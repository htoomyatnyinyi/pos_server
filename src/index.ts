import { Elysia } from "elysia";
import { authMiddleware } from "./middlewares/auth";
import { tenantMiddleware } from "./middlewares/tenant";
import { permissionMiddleware } from "./middlewares/permissions";
import { rateLimitMiddleware } from "./middlewares/rate-limit";
import { loggingMiddleware } from "./middlewares/logger";
import { errorHandlerMiddleware } from "./middlewares/error-handler";
import { corsMiddleware } from "./middlewares/cors";
import { productRoutes } from "./routes/products";
import { orderRoutes } from "./routes/orders";
import { swagger } from "@elysiajs/swagger";

const app = new Elysia()
  .use(swagger())
  // Global middlewares (order matters!)
  .use(errorHandlerMiddleware) // 1. Catch all errors
  .use(corsMiddleware) // 2. CORS
  .use(loggingMiddleware) // 3. Logging
  .use(
    rateLimitMiddleware({
      // 4. Rate limiting
      maxRequests: 100,
      windowMs: 60000,
    }),
  )
  .use(authMiddleware) // 5. Authentication
  .use(tenantMiddleware) // 6. Tenant context

  // Protected routes
  .group("/api/v1", (app) =>
    app
      .use(permissionMiddleware(["VIEW_REPORTS"]))
      .use(productRoutes)
      .use(orderRoutes),
  )

  // Public routes (no auth)
  .group("/api/v1/public", (app) =>
    app
      .get("/health", () => ({ status: "ok" }))
      .get("/ping", () => ({ pong: true })),
  )

  .listen(6060);

console.log(`🦊 Server running at http://localhost:6060`);

// import { Elysia } from "elysia";
// import { cors } from "@elysiajs/cors";
// import { jwt } from "@elysiajs/jwt";
// import { swagger } from "@elysiajs/swagger";
// import { authRoutes } from "./routes/auth";
// import { tenantRoutes } from "./routes/tenants";
// import { productRoutes } from "./routes/products";
// import { orderRoutes } from "./routes/orders";
// import { storeRoutes } from "./routes/stores";
// import { categoryRoutes } from "./routes/categories";
// import { supplierRoutes } from "./routes/suppliers";
// import { customerRoutes } from "./routes/customers";
// import { sessionRoutes } from "./routes/sessions";
// import { inventoryRoutes } from "./routes/inventory";
// import { staffRoutes } from "./routes/staff";
// import { paymentRoutes } from "./routes/payments";
// import { returnRoutes } from "./routes/returns";
// import { purchaseOrderRoutes } from "./routes/purchase-orders";
// import { stockTransferRoutes } from "./routes/stock-transfers";
// import { promotionRoutes } from "./routes/promotions";
// import { auditLogRoutes } from "./routes/audit-logs";
// import { storeSettingRoutes } from "./routes/store-settings";
// import { notificationRoutes } from "./routes/notifications";
// import { taxRateRoutes } from "./routes/tax-rates";
// import { expenseRoutes } from "./routes/expenses";
// import { cashRegisterRoutes } from "./routes/cash-registers";
// import { giftCardRoutes } from "./routes/gift-cards";
// import { walletRoutes } from "./routes/wallets";
// import { supplierPaymentRoutes } from "./routes/supplier-payments";
// import { apiKeyRoutes } from "./routes/api-keys";
// import { webhookRoutes } from "./routes/webhooks";

// const app = new Elysia()
//   .use(swagger())
//   .use(
//     cors({
//       origin: ["*"],
//       allowedHeaders: ["Content-Type", "Authorization"],
//       methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
//     }),
//   )
//   .use(
//     jwt({
//       name: "jwt",
//       secret: process.env.JWT_SECRET!,
//     }),
//   )

//   .get("/", () => ({
//     message: "POS API Running",
//   }))
//   .group("/api", (app: any) =>
//     app
//       .use(authRoutes)
//       .use(tenantRoutes)
//       .use(productRoutes)
//       .use(orderRoutes)
//       .use(storeRoutes)
//       .use(categoryRoutes)
//       .use(supplierRoutes)
//       .use(customerRoutes)
//       .use(sessionRoutes)
//       .use(inventoryRoutes)
//       .use(staffRoutes)
//       .use(paymentRoutes)
//       .use(returnRoutes)
//       .use(purchaseOrderRoutes)
//       .use(stockTransferRoutes)
//       .use(promotionRoutes)
//       .use(auditLogRoutes)
//       .use(storeSettingRoutes)
//       .use(notificationRoutes)
//       .use(taxRateRoutes)
//       .use(expenseRoutes)
//       .use(cashRegisterRoutes)
//       .use(giftCardRoutes)
//       .use(walletRoutes)
//       .use(supplierPaymentRoutes)
//       .use(apiKeyRoutes)
//       .use(webhookRoutes),
//   )
//   .listen(6060);

// console.log(`🦊 POS API running at http://localhost:6060`);
