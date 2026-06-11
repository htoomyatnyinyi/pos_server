import { Elysia, t } from "elysia";
import bcrypt from "bcryptjs";
import { Permission } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { jwt } from "@elysiajs/jwt";

// 🔐 Secure constant selection
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

export const authRoutes = new Elysia({ prefix: "/auth" })
  .use(
    jwt({
      name: "jwt",
      secret: process.env.JWT_SECRET!,
      exp: "7d", // 💡 Token သက်တမ်း ၇ ရက်သတ်မှတ်ခြင်း
    }),
  )

  /**
   * 1. REGISTER: Tenant, HQ Store & Admin User Creation
   */
  .post(
    "/register",
    async ({ body, jwt, set }) => {
      const email = body.email.toLowerCase().trim();

      // Check duplication
      const existing = await prisma.user.findFirst({ where: { email } });
      if (existing) {
        set.status = 409;
        return { success: false, message: "Email already registered" };
      }

      const hashedPassword = await bcrypt.hash(body.password, 12); // 💡 Security: Work factor 12

      const user = await prisma.$transaction(async (tx) => {
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

      const token = await jwt.sign({ id: user.id, tenantId: user.tenantId });
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
   * 2. LOGIN: Credentials Verification
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

      if (!user || !(await bcrypt.compare(body.password, user.passwordHash))) {
        set.status = 401; // 💡 401 Unauthorized for security
        return { success: false, message: "Invalid email or password" };
      }

      await prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });

      const token = await jwt.sign({ id: user.id, tenantId: user.tenantId });

      // Remove passwordHash from response
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
   * 3. ME: Session Validation
   */
  .get("/me", async ({ jwt, set, headers }) => {
    const token = headers.authorization?.split(" ")[1];
    if (!token) return { success: false, message: "Missing token" };

    const payload = await jwt.verify(token);
    if (!payload) {
      set.status = 401;
      return { success: false, message: "Invalid token" };
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.id as string },
      select: userSelect,
    });

    return user
      ? { success: true, user }
      : { success: false, message: "User not found" };
  });

// import { Elysia, t } from "elysia";
// import bcrypt from "bcryptjs";
// import { Permission } from "@prisma/client";
// import { prisma } from "../lib/prisma";
// import { jwt } from "@elysiajs/jwt";

// const userSelect = {
//   id: true,
//   name: true,
//   email: true,
//   role: true,
//   tenantId: true,
//   userPermissions: { select: { permission: true } },
//   stores: { include: { store: true } },
//   tenant: { select: { id: true, code: true, name: true } },
// } as const;

// function formatUserResponse(user: {
//   id: string;
//   name: string;
//   email: string | null;
//   role: string;
//   tenantId: string;
//   userPermissions: { permission: Permission }[];
//   stores: { store: unknown }[];
//   tenant: { id: string; code: string; name: string };
// }) {
//   return {
//     id: user.id,
//     name: user.name,
//     email: user.email,
//     role: user.role,
//     tenantId: user.tenantId,
//     tenant: user.tenant,
//     permissions: user.userPermissions.map((p) => p.permission),
//     stores: user.stores.map((s) => s.store),
//   };
// }

// export const authRoutes = new Elysia({
//   prefix: "/auth",
// })
//   .use(
//     jwt({
//       name: "jwt",
//       secret: process.env.JWT_SECRET!,
//     }),
//   )
//   .post(
//     "/register",
//     async ({ body, jwt, set }) => {
//       const emailLower = body.email.toLowerCase().trim();

//       const existingUser = await prisma.user.findFirst({
//         where: { email: emailLower, deletedAt: null },
//       });

//       if (existingUser) {
//         set.status = 400;
//         return { message: "User already exists" };
//       }

//       const hashedPassword = await bcrypt.hash(body.password, 10);
//       const tenantCode = body.tenantCode || `TNT-${Date.now()}`;

//       const user = await prisma.$transaction(async (tx) => {
//         const tenant = await tx.tenant.create({
//           data: {
//             code: tenantCode,
//             name: body.tenantName || `${body.name}'s Organization`,
//             email: emailLower,
//           },
//         });

//         const store = await tx.store.create({
//           data: {
//             tenantId: tenant.id,
//             code: `HQ-${Date.now()}`,
//             name: `${body.name}'s Store`,
//           },
//         });

//         return tx.user.create({
//           data: {
//             tenantId: tenant.id,
//             username: emailLower,
//             email: emailLower,
//             passwordHash: hashedPassword,
//             name: body.name,
//             role: "ADMIN",
//             userPermissions: {
//               create: Object.values(Permission).map((permission) => ({
//                 permission,
//               })),
//             },
//             stores: {
//               create: { storeId: store.id, isPrimary: true },
//             },
//           },
//           select: userSelect,
//         });
//       });

//       const token = await jwt.sign({
//         id: user.id,
//         tenantId: user.tenantId,
//         role: user.role,
//       });

//       return { ...formatUserResponse(user), token };
//     },
//     {
//       body: t.Object({
//         name: t.String(),
//         email: t.String(),
//         password: t.String(),
//         tenantName: t.Optional(t.String()),
//         tenantCode: t.Optional(t.String()),
//       }),
//     },
//   )
//   .post(
//     "/login",
//     async ({ body, jwt, set }) => {
//       const emailLower = body.email.toLowerCase().trim();

//       const user = await prisma.user.findFirst({
//         where: {
//           email: emailLower,
//           deletedAt: null,
//           isActive: true,
//           ...(body.tenantCode ? { tenant: { code: body.tenantCode } } : {}),
//         },
//         select: userSelect,
//       });

//       if (!user) {
//         set.status = 400;
//         return { message: "Invalid credentials" };
//       }

//       const fullUser = await prisma.user.findUnique({
//         where: { id: user.id },
//         select: { passwordHash: true },
//       });

//       const validPassword = await bcrypt.compare(
//         body.password,
//         fullUser!.passwordHash,
//       );

//       if (!validPassword) {
//         set.status = 400;
//         return { message: "Invalid credentials" };
//       }

//       await prisma.user.update({
//         where: { id: user.id },
//         data: { lastLoginAt: new Date() },
//       });

//       const token = await jwt.sign({ id: user.id, tenantId: user.tenantId });

//       return { ...formatUserResponse(user), token };
//     },
//     {
//       body: t.Object({
//         email: t.String(),
//         password: t.String(),
//         tenantCode: t.Optional(t.String()),
//       }),
//     },
//   )
//   .get("/me", async ({ jwt, set, headers }) => {
//     const authHeader = headers["authorization"];
//     if (!authHeader) {
//       set.status = 401;
//       return { message: "Unauthorized" };
//     }

//     const token = authHeader.split(" ")[1];
//     const payload = await jwt.verify(token);

//     if (!payload) {
//       set.status = 401;
//       return { message: "Unauthorized" };
//     }

//     const user = await prisma.user.findUnique({
//       where: { id: payload.id as string },
//       select: userSelect,
//     });

//     if (!user) {
//       set.status = 404;
//       return { message: "User not found" };
//     }

//     return { ...formatUserResponse(user), token };
//   });
