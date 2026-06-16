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
  .onParse(({ request, contentType }) => {
    console.log("Incoming request Content-Type:", contentType);
  })
  .onError(({ code, error, set }) => {
    console.error("Global Error Handler:", {
      code,
      message: error.message,
      cause: error.cause,
      stack: error.stack,
    });
    if (code === "VALIDATION") {
      set.status = 400;
      const errorsList = Array.isArray(error.all)
        ? error.all
        : [...(error.all || [])];
      return {
        success: false,
        message: "Validation failed",
        errors: errorsList.map((e: any) => ({
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
      .group(
        "/platform",
        (platformApp) =>
          platformApp
            .use(platformAuthMiddleware)
            .use(apiKeyRoutes) // add on
            .use(tenantRoutes)
            .use(auditLogRoutes)
            .use(storeSettingRoutes), // add on
      )

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
