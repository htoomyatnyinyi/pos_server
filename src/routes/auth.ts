import { Elysia, t } from "elysia";
import bcrypt from "bcryptjs";
import { Permission } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { jwt } from "@elysiajs/jwt";

// 🔐 Secure constant selection for Tenants/Users
const userSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  tenantId: true,
  isActive: true,
  userPermissions: { select: { permission: true } },
  stores: { include: { store: true } },
  tenant: { select: { id: true, code: true, name: true } },
} as const;

export const authRoutes = new Elysia()
  // Registering both JWT contexts cleanly up front
  .use(
    jwt({
      name: "jwt",
      secret: process.env.JWT_SECRET!,
      exp: "7d", // Tenant Auth valid for 7 days
    }),
  )
  .use(
    jwt({
      name: "platformJwt",
      secret: process.env.JWT_SECRET!,
      exp: "24h", // Strict session limit for system administrators
    }),
  )

  // =========================================================================
  // 👥 TENANT AUTH ROUTES (/auth/*)
  // =========================================================================
  .group("/auth", (app) =>
    app
      /**
       * 1. REGISTER: Tenant, HQ Store & Admin User Creation
       */
      .post(
        "/register",
        async ({ body, jwt, set }) => {
          const email = body.email.toLowerCase().trim();

          const existing = await prisma.user.findFirst({ where: { email } });
          if (existing) {
            set.status = 409;
            return { success: false, message: "Email already registered" };
          }

          const hashedPassword = await bcrypt.hash(body.password, 12);

          const user = await prisma.$transaction(async (tx: any) => {
            const tenant = await tx.tenant.create({
              data: {
                code:
                  body.tenantCode ||
                  `TNT-${Math.random().toString(36).substring(7).toUpperCase()}`,
                name: body.tenantName || `${body.name}'s Organization`,
              },
            });

            const store = await tx.store.create({
              data: {
                tenantId: tenant.id,
                code: `HQ-${Math.random().toString(36).substring(7).toUpperCase()}`,
                name: `${body.name}'s Store`,
              },
            });

            return tx.user.create({
              data: {
                tenantId: tenant.id,
                username: email,
                email,
                passwordHash: hashedPassword,
                name: body.name,
                role: "ADMIN",
                userPermissions: {
                  create: Object.values(Permission).map((permission) => ({
                    permission,
                  })),
                },
                stores: { create: { storeId: store.id, isPrimary: true } },
              },
              select: userSelect,
            });
          });

          const token = await jwt.sign({
            id: user.id,
            tenantId: user.tenantId,
          });
          return { success: true, user, token };
        },
        {
          body: t.Object({
            name: t.String(),
            email: t.String({ format: "email" }),
            password: t.String({ minLength: 8 }),
            tenantName: t.Optional(t.String()),
            tenantCode: t.Optional(t.String()),
          }),
        },
      )

      /**
       * 2. LOGIN: Tenant Credentials Verification
       */
      .post(
        "/login",
        async ({ body, jwt, set }) => {
          const email = body.email.toLowerCase().trim();

          const user = await prisma.user.findFirst({
            where: {
              email,
              isActive: true,
              deletedAt: null,
              ...(body.tenantCode ? { tenant: { code: body.tenantCode } } : {}),
            },
            select: { ...userSelect, passwordHash: true },
          });

          if (
            !user ||
            !(await bcrypt.compare(body.password, user.passwordHash))
          ) {
            set.status = 401;
            return { success: false, message: "Invalid email or password" };
          }

          await prisma.user.update({
            where: { id: user.id },
            data: { lastLoginAt: new Date() },
          });

          const token = await jwt.sign({
            id: user.id,
            tenantId: user.tenantId,
          });

          const { passwordHash, ...userData } = user;
          return { success: true, user: userData, token };
        },
        {
          body: t.Object({
            email: t.String(),
            password: t.String(),
            tenantCode: t.Optional(t.String()),
          }),
        },
      )

      /**
       * 3. ME: Active Session Profiler for Standard Users
       */
      .get("/me", async ({ jwt, set, headers }) => {
        const auth = headers["authorization"];
        if (!auth || !auth.startsWith("Bearer ")) {
          set.status = 401;
          return { success: false, message: "Missing or malformed token" };
        }

        const token = auth.split(" ")[1];
        const payload = await jwt.verify(token);
        if (!payload) {
          set.status = 401;
          return { success: false, message: "Invalid token context" };
        }

        const user = await prisma.user.findUnique({
          where: { id: payload.id as string },
          select: userSelect,
        });

        if (!user || !user.isActive) {
          set.status = 404;
          return {
            success: false,
            message: "User profile context unavailable",
          };
        }

        return { success: true, user };
      }),
  )

  // =========================================================================
  // ⚡ SUPER ADMIN PLATFORM ROUTES (/platform/auth/*)
  // =========================================================================
  .group("/platform/auth", (app) =>
    app
      /**
       * 4. PLATFORM LOGIN: System Admin Access Control
       */
      .post(
        "/login",
        async ({ body, platformJwt, set }) => {
          const admin = await prisma.systemAdmin.findFirst({
            where: { email: body.email.toLowerCase().trim(), isActive: true },
          });

          if (
            !admin ||
            !(await bcrypt.compare(body.password, admin.passwordHash))
          ) {
            set.status = 401;
            return {
              success: false,
              message: "Invalid administrative credentials",
            };
          }

          const token = await platformJwt.sign({
            sub: admin.id,
            role: admin.role, // e.g. "SUPER_ADMIN"
          });

          return { success: true, token };
        },
        {
          body: t.Object({
            email: t.String(),
            password: t.String(),
          }),
        },
      )

      /**
       * 5. PLATFORM ME: System Admin Identity verification
       */
      .get("/me", async ({ platformJwt, set, headers }) => {
        const auth = headers["authorization"];
        if (!auth || !auth.startsWith("Bearer ")) {
          set.status = 401;
          return {
            success: false,
            message: "No administrative context provided",
          };
        }

        const token = auth.split(" ")[1];
        const payload = await platformJwt.verify(token);

        if (!payload || payload.role !== "SUPER_ADMIN") {
          set.status = 403;
          return {
            success: false,
            message: "Forbidden: Higher system privilege required",
          };
        }

        const admin = await prisma.systemAdmin.findUnique({
          where: { id: payload.sub as string },
          select: { id: true, name: true, email: true, role: true },
        });

        if (!admin) {
          set.status = 404;
          return { success: false, message: "Administrative entity missing" };
        }

        return { success: true, admin };
      }),
  );

// import { Elysia, t } from "elysia";
// import bcrypt from "bcryptjs";
// import { Permission } from "@prisma/client";
// import { prisma } from "../lib/prisma";
// import { jwt } from "@elysiajs/jwt";

// // 🔐 Secure constant selection
// const userSelect = {
//   id: true,
//   name: true,
//   email: true,
//   role: true,
//   tenantId: true,
//   isActive: true,
//   userPermissions: { select: { permission: true } },
//   stores: { include: { store: true } },
//   tenant: { select: { id: true, code: true, name: true } },
// } as const;

// export const authRoutes = new Elysia({ prefix: "/auth" })
//   .use(
//     jwt({
//       name: "jwt",
//       secret: process.env.JWT_SECRET!,
//       exp: "7d", // 💡 Token သက်တမ်း ၇ ရက်သတ်မှတ်ခြင်း
//     }),
//   )

//   /**
//    * 1. REGISTER: Tenant, HQ Store & Admin User Creation
//    */
//   .post(
//     "/register",
//     async ({ body, jwt, set }) => {
//       const email = body.email.toLowerCase().trim();

//       // Check duplication
//       const existing = await prisma.user.findFirst({ where: { email } });
//       if (existing) {
//         set.status = 409;
//         return { success: false, message: "Email already registered" };
//       }

//       const hashedPassword = await bcrypt.hash(body.password, 12); // 💡 Security: Work factor 12

//       const user = await prisma.$transaction(async (tx) => {
//         const tenant = await tx.tenant.create({
//           data: {
//             code:
//               body.tenantCode ||
//               `TNT-${Math.random().toString(36).substring(7).toUpperCase()}`,
//             name: body.tenantName || `${body.name}'s Organization`,
//           },
//         });

//         const store = await tx.store.create({
//           data: {
//             tenantId: tenant.id,
//             code: `HQ-${Math.random().toString(36).substring(7).toUpperCase()}`,
//             name: `${body.name}'s Store`,
//           },
//         });

//         return tx.user.create({
//           data: {
//             tenantId: tenant.id,
//             username: email,
//             email,
//             passwordHash: hashedPassword,
//             name: body.name,
//             role: "ADMIN",
//             userPermissions: {
//               create: Object.values(Permission).map((permission) => ({
//                 permission,
//               })),
//             },
//             stores: { create: { storeId: store.id, isPrimary: true } },
//           },
//           select: userSelect,
//         });
//       });

//       const token = await jwt.sign({ id: user.id, tenantId: user.tenantId });
//       return { success: true, user, token };
//     },
//     {
//       body: t.Object({
//         name: t.String(),
//         email: t.String({ format: "email" }),
//         password: t.String({ minLength: 8 }),
//         tenantName: t.Optional(t.String()),
//         tenantCode: t.Optional(t.String()),
//       }),
//     },
//   )

//   /**
//    * 2. LOGIN: Credentials Verification
//    */
//   .post(
//     "/login",
//     async ({ body, jwt, set }) => {
//       const email = body.email.toLowerCase().trim();

//       const user = await prisma.user.findFirst({
//         where: {
//           email,
//           isActive: true,
//           deletedAt: null,
//           ...(body.tenantCode ? { tenant: { code: body.tenantCode } } : {}),
//         },
//         select: { ...userSelect, passwordHash: true },
//       });

//       if (!user || !(await bcrypt.compare(body.password, user.passwordHash))) {
//         set.status = 401; // 💡 401 Unauthorized for security
//         return { success: false, message: "Invalid email or password" };
//       }

//       await prisma.user.update({
//         where: { id: user.id },
//         data: { lastLoginAt: new Date() },
//       });

//       const token = await jwt.sign({ id: user.id, tenantId: user.tenantId });

//       // Remove passwordHash from response
//       const { passwordHash, ...userData } = user;
//       return { success: true, user: userData, token };
//     },
//     {
//       body: t.Object({
//         email: t.String(),
//         password: t.String(),
//         tenantCode: t.Optional(t.String()),
//       }),
//     },
//   )

//   //   import { Elysia, t } from "elysia";
//   // import jwt from "@elysiajs/jwt";
//   // import bcrypt from "bcryptjs";
//   // import { prisma } from "../lib/prisma";

//   // export const platformAuthRoutes = new Elysia({ prefix: "/platform/auth" })
//   //   // Isolate your JWT module namespace to prevent generic collision
//   //   .use(
//   //     jwt({
//   //       name: "platformJwt",
//   //       secret: process.env.JWT_SECRET!,
//   //       exp: "24h", // Strict session limit for administrative tasks
//   //     })
//   //   )
//   //   .post("/login", async ({ body, platformJwt, set }) => {
//   //     const admin = await prisma.systemAdmin.findFirst({
//   //       where: { email: body.email.toLowerCase().trim(), isActive: true }
//   //     });

//   //     if (!admin || !(await bcrypt.compare(body.password, admin.passwordHash))) {
//   //       set.status = 401;
//   //       return { success: false, message: "Invalid administrative credentials" };
//   //     }

//   //     // Sign with Super Admin payload
//   //     const token = await platformJwt.sign({
//   //       sub: admin.id,
//   //       role: admin.role, // "SUPER_ADMIN"
//   //     });

//   //     return { success: true, token };
//   //   })
//   .get("/me", async ({ jwt, set, headers }) => {
//     const auth = headers["authorization"];
//     if (!auth || !auth.startsWith("Bearer ")) {
//       set.status = 401;
//       return { success: false, message: "No administrative context provided" };
//     }

//     const token = auth.split(" ")[1];
//     const payload = await jwt.verify(token);

//     // Explicit check for administrative role context
//     if (!payload || payload.role !== "SUPER_ADMIN") {
//       set.status = 403;
//       return {
//         success: false,
//         message: "Forbidden: Higher system privilege required",
//       };
//     }

//     const admin = await prisma.systemAdmin.findUnique({
//       where: { id: payload.sub as string },
//       select: { id: true, name: true, email: true, role: true },
//     });

//     return { success: true, admin };
//   });

// /**
//  * 3. ME: Session Validation
//  */
// // .get("/me", async ({ jwt, set, headers }) => {
// //   const token = headers.authorization?.split(" ")[1];
// //   if (!token) return { success: false, message: "Missing token" };

// //   const payload = await jwt.verify(token);
// //   if (!payload) {
// //     set.status = 401;
// //     return { success: false, message: "Invalid token" };
// //   }

// //   const user = await prisma.user.findUnique({
// //     where: { id: payload.id as string },
// //     select: userSelect,
// //   });

// //   return user
// //     ? { success: true, user }
// //     : { success: false, message: "User not found" };
// // });
