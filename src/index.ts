import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { jwt } from "@elysiajs/jwt";
import { swagger } from "@elysiajs/swagger";

// Middlewares
import { platformAuthMiddleware } from "../middlewares/platformAuthMiddleware";
import { tenantAuthMiddleware } from "../middlewares/tenantAuthMiddleware";

// Route Imports
import { authRoutes } from "./routes/auth";
import { tenantRoutes } from "./routes/tenants"; // Platform only
import { tenantProfileRoutes } from "./routes/tenant-profile"; // NEW
import { productRoutes } from "./routes/products";
import { productVariantRoutes } from "./routes/product-variants";
import { orderRoutes } from "./routes/orders";
import { storeRoutes } from "./routes/stores";
import { categoryRoutes } from "./routes/categories";
import { brandRoutes } from "./routes/brands";
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
import { reportRoutes } from "./routes/reports";
import { accountRoutes } from "./routes/accounts";
import { journalEntryRoutes } from "./routes/journal-entries";
import { dashboardRoutes } from "./routes/dashboard";
import { syncRoutes } from "./routes/sync";

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

  .get("/", () => ({
    success: true,
    status: "ok",
    code: 200,
    data: {
      message: "POS System API",
      version: "1.0.0",
    },
  }))

  .group("/api", (apiApp) =>
    apiApp
      // 1. Public routes – no auth required
      .use(authRoutes)
      .use(platformAuthRoutes)
      .use(syncRoutes)

      // Dashboard routes (both tenant and platform)
      .use(dashboardRoutes)

      // 2. Platform group – Super Admin only
      .group(
        "/platform",
        (platformApp) =>
          platformApp
            .use(platformAuthMiddleware)
            .use(apiKeyRoutes) // platform‑level api keys
            .use(tenantRoutes) // ONLY platform can manage all tenants
            .use(auditLogRoutes) // platform‑wide audit logs
            .use(storeSettingRoutes) // global store settings
            // Add accounting routes here
            .use(accountRoutes) // /platform/accounts
            .use(journalEntryRoutes) // /platform/journal-entries
            .use(reportRoutes), // /platform/reports
      )

      // 3. Tenant group – authenticated tenant users
      .group("/tenant", (tenantApp) =>
        tenantApp
          .use(tenantAuthMiddleware)
          // NEW: tenant profile endpoints (GET/PUT their own tenant)
          .use(tenantProfileRoutes)
          // All other tenant‑scoped resources
          .use(productRoutes)
          .use(productVariantRoutes)
          .use(orderRoutes)
          .use(storeRoutes)
          .use(categoryRoutes)
          .use(brandRoutes)
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
          .use(apiKeyRoutes) // tenant‑level api keys
          .use(webhookRoutes),
      ),
  )
  .listen(6060);

console.log(`🦊 POS API running at http://localhost:6060`);
