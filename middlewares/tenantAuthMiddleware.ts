import { Elysia } from "elysia";
import { jwt } from "@elysiajs/jwt";

export const tenantAuthMiddleware = new Elysia({ name: "tenantAuthMiddleware" })
  .use(jwt({ name: "jwt", secret: process.env.JWT_SECRET! }))
  .derive({ as: "global" }, async ({ jwt, headers }) => {
    const authHeader = headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return { authError: true, tenantId: "", userId: "", role: "" };
    }
    const token = authHeader.split(" ")[1];
    const payload = await jwt.verify(token);
    if (!payload || !payload.sub) {
      return { authError: true, tenantId: "", userId: "", role: "" };
    }
    return {
      authError: false,
      tenantId: payload.tenantId as string,
      userId: payload.sub as string,
      role: payload.role as string,
    };
  })
  .onBeforeHandle(({ authError, tenantId, userId, set }) => {
    if (authError || !tenantId || !userId) {
      set.status = 401;
      return { success: false, message: "Unauthorized" };
    }
  });

// import { Elysia } from "elysia";
// import { jwt } from "@elysiajs/jwt";

// export const tenantAuthMiddleware = new Elysia({ name: "tenantAuthMiddleware" })
//   .use(jwt({ name: "jwt", secret: process.env.JWT_SECRET! }))
//   .derive({ as: "global" }, async ({ jwt, headers }) => {
//     const authHeader = headers.authorization;
//     if (!authHeader?.startsWith("Bearer ")) {
//       return { authError: true, tenantId: "", userId: "", role: "" };
//     }
//     const token = authHeader.split(" ")[1];
//     const payload = await jwt.verify(token);
//     if (!payload || !payload.sub) {
//       return { authError: true, tenantId: "", userId: "", role: "" };
//     }
//     // Optional: fetch user from DB to check isActive and tenant status
//     // const user = await prisma.user.findUnique({ where: { id: payload.sub } });
//     // if (!user || !user.isActive) return { authError: true, ... };
//     return {
//       authError: false,
//       tenantId: payload.tenantId as string,
//       userId: payload.sub as string,
//       role: payload.role as string,
//     };
//   })
//   .onBeforeHandle(({ authError, tenantId, userId, set }) => {
//     if (authError || !tenantId || !userId) {
//       set.status = 401;
//       return { success: false, message: "Unauthorized" };
//     }
//     // Optionally check tenant.isActive here if you fetched it
//   });

// // import { Elysia } from "elysia";
// // import { jwt } from "@elysiajs/jwt";

// // export const tenantAuthMiddleware = new Elysia({ name: "tenantAuthMiddleware" })
// //   .use(jwt({ name: "jwt", secret: process.env.JWT_SECRET! }))
// //   .derive({ as: "global" }, async ({ jwt, headers, set }) => {
// //     const authHeader = headers.authorization;
// //     if (!authHeader || !authHeader.startsWith("Bearer ")) {
// //       set.status = 401;
// //       return { tenantId: "", role: "", userId: "" }; // Error မပစ်ဘဲ Context အလွတ်ပေးလိုက်ခြင်း
// //     }

// //     const token = authHeader.split(" ")[1];
// //     const payload = await jwt.verify(token);

// //     if (!payload) {
// //       set.status = 401;
// //       return { tenantId: "", role: "", userId: "" };
// //       // throw new Error("Unauthorized: Invalid token");
// //     }

// //     // ✅ userId (သို့မဟုတ် payload.id) ကိုပါ Routes တွေသုံးလို့ရအောင် ပြန်ပေးလိုက်ခြင်း
// //     return {
// //       tenantId: payload.tenantId as string,
// //       role: payload.role as string,
// //       userId: payload.id as string,
// //     };
// //   })
// //   .onBeforeHandle(({ tenantId, userId, set }) => {
// //     // အခြေခံအားဖြင့် တိုကင်မပါလာသူ သို့မဟုတ် သက်တမ်းကုန်သူများကို 401 ပေးပြီး တားဆီးမည်
// //     if (!tenantId || !userId) {
// //       set.status = 401;
// //       return {
// //         success: false,
// //         message: "Unauthorized: Invalid or missing token",
// //       };
// //     }
// //   });
