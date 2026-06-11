import { Elysia, t } from "elysia";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";
import { jwt } from "@elysiajs/jwt";

export const platformAuthRoutes = new Elysia({
  prefix: "/platform/auth",
})
  .use(
    jwt({
      name: "jwt",
      secret: process.env.JWT_SECRET!,
      exp: "24h", // 💡 Token သက်တမ်း ၂၄ နာရီသာထားခြင်း
    }),
  )

  /**
   * 1. LOGIN: Super Admin Only
   */
  .post(
    "/login",
    async ({ body, jwt, set }) => {
      const email = body.email.toLowerCase().trim();

      const admin = await prisma.systemAdmin.findFirst({
        where: { email, isActive: true },
      });

      // 💡 Security: Invalid email or password ပုံစံတူပေးခြင်းဖြင့် Enumeration တိုက်ခိုက်မှုကာကွယ်ခြင်း
      if (
        !admin ||
        !(await bcrypt.compare(body.password, admin.passwordHash))
      ) {
        set.status = 401;
        return { success: false, message: "Invalid credentials" };
      }

      await prisma.systemAdmin.update({
        where: { id: admin.id },
        data: { lastLoginAt: new Date() },
      });

      const token = await jwt.sign({
        sub: admin.id,
        role: admin.role, // SUPER_ADMIN
      });

      return {
        success: true,
        admin: {
          id: admin.id,
          name: admin.name,
          email: admin.email,
          role: admin.role,
        },
        token,
      };
    },
    {
      body: t.Object({
        email: t.String({ format: "email" }),
        password: t.String(),
      }),
    },
  )

  /**
   * 2. ME: Current Session Validation
   */
  .get("/me", async ({ jwt, set, headers }) => {
    const authHeader = headers["authorization"];
    const token = authHeader?.startsWith("Bearer ")
      ? authHeader.split(" ")[1]
      : null;

    if (!token) {
      set.status = 401;
      return { success: false, message: "Unauthorized: Token required" };
    }

    const payload = await jwt.verify(token);

    // 💡 Role-based access validation
    if (!payload || payload.role !== "SUPER_ADMIN") {
      set.status = 403;
      return { success: false, message: "Forbidden: Platform access only" };
    }

    const admin = await prisma.systemAdmin.findUnique({
      where: { id: payload.sub as string },
      select: { id: true, name: true, email: true, role: true, isActive: true },
    });

    if (!admin || !admin.isActive) {
      set.status = 404;
      return { success: false, message: "Admin account invalid" };
    }

    return { success: true, admin };
  });

// import { Elysia, t } from "elysia";
// import bcrypt from "bcryptjs";
// import { prisma } from "../lib/prisma";
// import { jwt } from "@elysiajs/jwt";

// export const platformAuthRoutes = new Elysia({
//   prefix: "/platform/auth",
// })
//   .use(
//     jwt({
//       name: "jwt",
//       secret: process.env.JWT_SECRET!,
//     }),
//   )
//   // ၁။ Super Admin Login ဝင်ခြင်း
//   .post(
//     "/login",
//     async ({ body, jwt, set }) => {
//       const emailLower = body.email.toLowerCase().trim();

//       // SystemAdmin Table ထဲတွင် ရှာဖွေခြင်း
//       const admin = await prisma.systemAdmin.findFirst({
//         where: {
//           email: emailLower,
//           isActive: true,
//         },
//       });

//       if (!admin) {
//         set.status = 400;
//         return { success: false, message: "Invalid credentials" };
//       }

//       // Password စစ်ဆေးခြင်း
//       const validPassword = await bcrypt.compare(
//         body.password,
//         admin.passwordHash,
//       );
//       if (!validPassword) {
//         set.status = 400;
//         return { success: false, message: "Invalid credentials" };
//       }

//       // နောက်ဆုံး Login ဝင်ချိန်ကို Update လုပ်ခြင်း
//       await prisma.systemAdmin.update({
//         where: { id: admin.id },
//         data: { lastLoginAt: new Date() },
//       });

//       // တိုကင်ထုတ်ပေးခြင်း (Middleware က စစ်ဆေးနိုင်ရန် role ကိုပါ ထည့်ပေးရပါမည်)
//       const token = await jwt.sign({
//         sub: admin.id,
//         role: admin.role, // "SUPER_ADMIN"
//       });

//       return {
//         success: true,
//         admin: {
//           id: admin.id,
//           name: admin.name,
//           email: admin.email,
//           role: admin.role,
//         },
//         token,
//       };
//     },
//     {
//       body: t.Object({
//         email: t.String(),
//         password: t.String(),
//       }),
//     },
//   )
//   // ၂။ လက်ရှိ Login ဝင်ထားသော Super Admin အချက်အလက်ကို ပြန်ယူခြင်း
//   .get("/me", async ({ jwt, set, headers }) => {
//     const authHeader = headers["authorization"];
//     if (!authHeader || !authHeader.startsWith("Bearer ")) {
//       set.status = 401;
//       return { success: false, message: "Unauthorized" };
//     }

//     const token = authHeader.split(" ")[1];
//     const payload = await jwt.verify(token);

//     if (!payload || payload.role !== "SUPER_ADMIN") {
//       set.status = 401;
//       return {
//         success: false,
//         message: "Unauthorized: Invalid platform token",
//       };
//     }

//     const admin = await prisma.systemAdmin.findUnique({
//       where: { id: payload.sub as string },
//       select: {
//         id: true,
//         name: true,
//         email: true,
//         role: true,
//         isActive: true,
//       },
//     });

//     if (!admin || !admin.isActive) {
//       set.status = 404;
//       return {
//         success: false,
//         message: "Admin account not found or suspended",
//       };
//     }

//     return {
//       success: true,
//       admin,
//     };
//   });
