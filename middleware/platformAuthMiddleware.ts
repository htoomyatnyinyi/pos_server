import { Elysia } from "elysia";
import { jwt } from "@elysiajs/jwt";

export const platformAuthMiddleware = new Elysia({
  name: "platformAuthMiddleware",
})
  .use(jwt({ name: "jwt", secret: process.env.JWT_SECRET! }))
  .derive(async ({ jwt, headers }) => {
    const authHeader = headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return {
        isAuthError: true,
        authMessage: "Unauthorized: No token provided or invalid format",
      };
    }

    const token = authHeader.split(" ")[1];
    const payload = await jwt.verify(token);

    if (!payload) {
      return {
        isAuthError: true,
        authMessage: "Unauthorized: Invalid or expired token",
      };
    }

    return {
      isAuthError: false,
      role: payload.role as string,
      userId: payload.sub as string,
    };
  })
  // error အစား စိတ်ချရသည့် 'set' ကို ဆွဲထုတ်သုံးစွဲပါသည်
  .onBeforeHandle(({ isAuthError, authMessage, role, set }) => {
    if (isAuthError) {
      set.status = 401;
      return {
        success: false,
        message: authMessage || "Unauthorized access",
      };
    }

    if (role !== "SUPER_ADMIN") {
      set.status = 403;
      return {
        success: false,
        message: "Forbidden: Access restricted to Super Admins only",
      };
    }
  });
// import { Elysia } from "elysia";
// import { jwt } from "@elysiajs/jwt";

// export const platformAuthMiddleware = new Elysia({
//   name: "platformAuthMiddleware",
// })
//   .use(jwt({ name: "jwt", secret: process.env.JWT_SECRET! }))
//   .derive(async ({ jwt, headers, set }) => {
//     const authHeader = headers.authorization;
//     if (!authHeader) {
//       set.status = 401;
//       throw new Error("Unauthorized: No token provided");
//     }

//     const token = authHeader.split(" ")[1];
//     const payload = await jwt.verify(token);

//     if (!payload) {
//       set.status = 401;
//       throw new Error("Unauthorized: Invalid token");
//     }

//     // Role ကို စစ်ဆေးခြင်း
//     return {
//       role: payload.role as string,
//     };
//   })
//   .onBeforeHandle(({ role, set }) => {
//     // Super Admin မဟုတ်ရင် ဝင်ခွင့်မပေးပါ
//     if (role !== "SUPER_ADMIN") {
//       set.status = 403;
//       throw new Error("Forbidden: Access restricted to Super Admins only");
//     }
//   });
