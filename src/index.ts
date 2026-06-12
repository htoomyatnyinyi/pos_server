import { Elysia } from "elysia";
import { Prisma } from "@prisma/client";
import { cors } from "@elysiajs/cors";
import { jwt } from "@elysiajs/jwt";
import { swagger } from "@elysiajs/swagger";

// Middlewares
import { platformAuthMiddleware } from "../middlewares/platformAuthMiddleware";
import { tenantAuthMiddleware } from "../middlewares/tenantAuthMiddleware";

// Route Imports
import { authRoutes } from "./routes/auth";
import { tenantRoutes } from "./routes/tenants";
import { productRoutes } from "./routes/products";
import { orderRoutes } from "./routes/orders";
import { storeRoutes } from "./routes/stores";
import { categoryRoutes } from "./routes/categories";
import { supplierRoutes } from "./routes/suppliers";
import { customerRoutes } from "./routes/customers";
import { sessionRoutes } from "./routes/sessions";
import { inventoryRoutes } from "./routes/inventory";
import { staffRoutes } from "./routes/staff";
import { paymentRoutes } from "./routes/payments";
import { returnRoutes } from "./routes/returns";
import { purchaseOrderRoutes } from "./routes/purchase-orders";
import { stockTransferRoutes } from "./routes/stock-transfers";
import { promotionRoutes } from "./routes/promotions";
import { auditLogRoutes } from "./routes/audit-logs";
import { storeSettingRoutes } from "./routes/store-settings";
import { notificationRoutes } from "./routes/notifications";
import { taxRateRoutes } from "./routes/tax-rates";
import { expenseRoutes } from "./routes/expenses";
import { cashRegisterRoutes } from "./routes/cash-registers";
import { giftCardRoutes } from "./routes/gift-cards";
import { walletRoutes } from "./routes/wallets";
import { supplierPaymentRoutes } from "./routes/supplier-payments";
import { apiKeyRoutes } from "./routes/api-keys";
import { webhookRoutes } from "./routes/webhooks";
import { platformAuthRoutes } from "./routes/platform-auth";

const app = new Elysia()
  .use(swagger())
  .use(
    cors({
      origin: ["*"],
      allowedHeaders: ["Content-Type", "Authorization"],
      methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    }),
  )
  .use(
    jwt({
      name: "jwt",
      secret: process.env.JWT_SECRET!,
    }),
  )
  .onError(({ code, error, set }) => {
    if (code === "VALIDATION") {
      set.status = 400;
      return {
        success: false,
        message: "Validation failed",
        errors: error.all.map((e) => ({
          path: e.path,
          message: e.message,
          expected: e.schema?.type || "unknown",
        })),
      };
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") {
        set.status = 409;
        return {
          success: false,
          message: `Unique constraint failed: ${error.meta?.target || "Unknown field"}`,
          code: "CONFLICT",
        };
      }
      if (error.code === "P2025") {
        set.status = 404;
        return {
          success: false,
          message: "Record not found",
          code: "NOT_FOUND",
        };
      }
    }

    set.status = 500;
    return {
      success: false,
      message:
        process.env.NODE_ENV === "development"
          ? (error as Error).message
          : "Something went wrong",
    };
  })
  .get("/", () => ({
    success: true,
    status: "ok",
    code: 200,
    data: {
      message: "POS System API",
      version: "1.0.0",
    },
  }))

  // စနစ်တစ်ခုလုံး၏ ပင်မ API Group
  .group("/api", (apiApp) =>
    apiApp
      // ၁။ Public Routes (Login / Register များအတွက်) - Middleware မလိုပါ
      .use(authRoutes) // POST: /api/auth/login, /api/auth/register
      .use(platformAuthRoutes) // POST: /api/platform/auth/login (အသစ်)

      // ၂။ Platform Group - Super Admin သီးသန့်လမ်းကြောင်းများ (Inline ပုံစံပြောင်းလဲထားသည်)
      .group("/platform", (platformApp) =>
        platformApp
          .use(platformAuthMiddleware)
          .use(tenantRoutes)
          .use(auditLogRoutes),
      )
      // // ==========================================
      // // ခ။ PLATFORM GROUP (Super Admin သီးသန့်လမ်းကြောင်းများ)
      // // ==========================================
      // .group("/platform", (platformApp) =>
      //   platformApp
      //     .use(platformAuthMiddleware) // Super Admin Token ကို အရင်စစ်မည်

      //     // Tenants စီမံခန့်ခွဲမှုအတွက် လမ်းကြောင်းကို ဤနေရာတွင် တိုက်ရိုက် Group ဖွဲ့ပေးလိုက်ပါ
      //     .group("/", (tenantApp) => tenantApp.use(tenantRoutes))

      //     // Audit Logs လမ်းကြောင်း
      //     .group("/audit-logs", (auditApp) => auditApp.use(auditLogRoutes)),
      // )

      // ၃။ Tenant Group - ဆိုင်ခွဲများအတွက် လမ်းကြောင်းများ (Inline ပုံစံပြောင်းလဲထားသည်)
      .group("/tenant", (tenantApp) =>
        tenantApp
          .use(tenantAuthMiddleware)
          .use(productRoutes)
          .use(orderRoutes)
          .use(storeRoutes)
          .use(categoryRoutes)
          .use(supplierRoutes)
          .use(customerRoutes)
          .use(sessionRoutes)
          .use(inventoryRoutes)
          .use(staffRoutes)
          .use(paymentRoutes)
          .use(returnRoutes)
          .use(purchaseOrderRoutes)
          .use(stockTransferRoutes)
          .use(promotionRoutes)
          .use(storeSettingRoutes)
          .use(notificationRoutes)
          .use(taxRateRoutes)
          .use(expenseRoutes)
          .use(cashRegisterRoutes)
          .use(giftCardRoutes)
          .use(walletRoutes)
          .use(supplierPaymentRoutes)
          .use(apiKeyRoutes)
          .use(webhookRoutes),
      ),
  )
  .listen(6060);

console.log(`🦊 POS API running at http://localhost:6060`);

/* 

import { Elysia } from "elysia";
import { Prisma } from "@prisma/client";
import { cors } from "@elysiajs/cors";
import { jwt } from "@elysiajs/jwt";
import { swagger } from "@elysiajs/swagger";

// Middlewares
import { platformAuthMiddleware } from "./middlewares/platformAuthMiddleware";
import { tenantAuthMiddleware } from "./middlewares/tenantAuthMiddleware";

// Route Imports
import { authRoutes } from "./routes/auth";
import { platformAuthRoutes } from "./routes/platform-auth";
import { tenantRoutes } from "./routes/tenants";
import { productRoutes } from "./routes/products";
import { orderRoutes } from "./routes/orders";
import { storeRoutes } from "./routes/stores";
import { categoryRoutes } from "./routes/categories";
import { supplierRoutes } from "./routes/suppliers";
import { customerRoutes } from "./routes/customers";
import { sessionRoutes } from "./routes/sessions";
import { inventoryRoutes } from "./routes/inventory";
import { staffRoutes } from "./routes/staff";
import { paymentRoutes } from "./routes/payments";
import { returnRoutes } from "./routes/returns";
import { purchaseOrderRoutes } from "./routes/purchase-orders";
import { stockTransferRoutes } from "./routes/stock-transfers";
import { promotionRoutes } from "./routes/promotions";
import { auditLogRoutes } from "./routes/audit-logs";
import { storeSettingRoutes } from "./routes/store-settings";
import { notificationRoutes } from "./routes/notifications";
import { taxRateRoutes } from "./routes/tax-rates";
import { expenseRoutes } from "./routes/expenses";
import { cashRegisterRoutes } from "./routes/cash-registers";
import { giftCardRoutes } from "./routes/gift-cards";
import { walletRoutes } from "./routes/wallets";
import { supplierPaymentRoutes } from "./routes/supplier-payments";
import { apiKeyRoutes } from "./routes/api-keys";
import { webhookRoutes } from "./routes/webhooks";

const app = new Elysia()
  .use(swagger())
  .use(
    cors({
      origin: ["*"],
      allowedHeaders: ["Content-Type", "Authorization"],
      methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    }),
  )
  // ၁။ Tenant standard users များအတွက် ကမ္ဘာလုံးဆိုင်ရာ JWT
  .use(
    jwt({
      name: "jwt",
      secret: process.env.JWT_SECRET!,
    }),
  )
  // ၂။ Global Error Interceptor (Database နှင့် Validation Error များကို ဖမ်းယူရန်)
  .onError(({ code, error, set }) => {
    if (code === "VALIDATION") {
      set.status = 400;
      return {
        success: false,
        message: "Validation failed",
        errors: error.all.map((e) => ({
          path: e.path,
          message: e.message,
          expected: e.schema?.type || "unknown",
        })),
      };
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") {
        set.status = 409;
        return {
          success: false,
          message: `Unique constraint failed: ${error.meta?.target || "Unknown field"}`,
          code: "CONFLICT",
        };
      }
      if (error.code === "P2025") {
        set.status = 404;
        return {
          success: false,
          message: "Record not found",
          code: "NOT_FOUND",
        };
      }
    }

    set.status = 500;
    return {
      success: false,
      message:
        process.env.NODE_ENV === "development"
          ? (error as Error).message
          : "Something went wrong",
    };
  })
  // Health Check Endpoint
  .get("/", () => ({
    success: true,
    status: "ok",
    code: 200,
    data: {
      message: "POS System Core API Platform",
      version: "1.0.0",
    },
  }))

  // စနစ်တစ်ခုလုံး၏ ပင်မ API Group Namespace
  .group("/api", (apiApp) =>
    apiApp
      // ==========================================
      // က။ PUBLIC ROUTES (လော့ဂ်အင်ဝင်ရန် - Middleware မလိုပါ)
      // ==========================================
      .use(authRoutes)          // POST: /api/auth/login, /api/auth/register
      .use(platformAuthRoutes)  // POST: /api/platform/auth/login, GET: /api/platform/auth/me (တိုက်ရိုက်အလုပ်လုပ်မည်)

      // ==========================================
      // ခ။ PLATFORM GROUP (Super Admin သီးသန့်လမ်းကြောင်းများ)
      // ==========================================
      .group("/platform", (platformApp) =>
        platformApp
          .use(platformAuthMiddleware) // Super Admin ဟုတ်မဟုတ် စစ်ဆေးမည့် ဓားစာခံ Middleware
          .use(tenantRoutes)           // ဆိုင်လုပ်ငန်း (Tenants) အားလုံးကို ထိန်းချုပ်ခြင်း
          .use(auditLogRoutes),        // စနစ်တစ်ခုလုံး၏ Log များ ကြည့်ခြင်း
      )

      // ==========================================
      // ဂ။ TENANT GROUP (သက်ဆိုင်ရာ ဆိုင်ခွဲတစ်ခုချင်းစီ၏ စီးပွားရေးလုပ်ငန်း လုပ်ဆောင်ချက်များ)
      // ==========================================
      .group("/tenant", (tenantApp) =>
        tenantApp
          .use(tenantAuthMiddleware) // ၎င်းအောက်ရှိ Route များအားလုံးကို tenantId အလိုအလျောက် သတ်မှတ်ပေးမည့်နေရာ
          .use(productRoutes)
          .use(orderRoutes)
          .use(storeRoutes)
          .use(categoryRoutes)
          .use(supplierRoutes)
          .use(customerRoutes)
          .use(sessionRoutes)
          .use(inventoryRoutes)
          .use(staffRoutes)
          .use(paymentRoutes)
          .use(returnRoutes)
          .use(purchaseOrderRoutes)
          .use(stockTransferRoutes)
          .use(promotionRoutes)
          .use(storeSettingRoutes)
          .use(notificationRoutes)
          .use(taxRateRoutes)
          .use(expenseRoutes)
          .use(cashRegisterRoutes)
          .use(giftCardRoutes)
          .use(walletRoutes)
          .use(supplierPaymentRoutes)
          .use(apiKeyRoutes)
          .use(webhookRoutes),
      ),
  )
  .listen(6060);

console.log(`🦊 POS API Core Server is running smoothly at http://localhost:6060`);
*/
