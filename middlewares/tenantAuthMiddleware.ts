import { Elysia } from "elysia";
import { jwt } from "@elysiajs/jwt";

export const tenantAuthMiddleware = new Elysia({ name: "tenantAuthMiddleware" })
  .use(jwt({ name: "jwt", secret: process.env.JWT_SECRET! }))
  .derive({ as: "global" }, async ({ jwt, headers, set }) => {
    const authHeader = headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      set.status = 401;
      return { tenantId: "", role: "", userId: "" }; // Error မပစ်ဘဲ Context အလွတ်ပေးလိုက်ခြင်း
    }

    const token = authHeader.split(" ")[1];
    const payload = await jwt.verify(token);

    if (!payload) {
      set.status = 401;
      return { tenantId: "", role: "", userId: "" };
      // throw new Error("Unauthorized: Invalid token");
    }

    // ✅ userId (သို့မဟုတ် payload.id) ကိုပါ Routes တွေသုံးလို့ရအောင် ပြန်ပေးလိုက်ခြင်း
    return {
      tenantId: payload.tenantId as string,
      role: payload.role as string,
      userId: payload.id as string,
    };
  })
  .onBeforeHandle(({ tenantId, userId, set }) => {
    // အခြေခံအားဖြင့် တိုကင်မပါလာသူ သို့မဟုတ် သက်တမ်းကုန်သူများကို 401 ပေးပြီး တားဆီးမည်
    if (!tenantId || !userId) {
      set.status = 401;
      return {
        success: false,
        message: "Unauthorized: Invalid or missing token",
      };
    }
  });

// import { Elysia, t } from "elysia";
// import { jwt } from "@elysiajs/jwt";

// export const tenantAuthMiddleware = new Elysia({ name: "tenantAuthMiddleware" })
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

//     // JWT ထဲမှာပါတဲ့ tenantId နဲ့ role ကို ခွဲထုတ်ခြင်း
//     return {
//       tenantId: payload.tenantId as string,
//       role: payload.role as string,
//     };
//   })
//   .onBeforeHandle(({ role, set }) => {
//     // လိုအပ်ရင် role အလိုက် ခွင့်ပြုချက်ကို ဒီမှာ ဆက်စစ်လို့ရပါတယ်
//     // ဥပမာ - ADMIN အဆင့်မှသာဝင်ခွင့်ပေးရန်
//     if (role !== "ADMIN" && role !== "SUPER_ADMIN") {
//       set.status = 403;
//       throw new Error("Forbidden: Insufficient permissions");
//     }
//   });
