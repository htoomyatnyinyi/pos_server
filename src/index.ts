import { Elysia } from "elysia";
import { Prisma } from "@prisma/client";
import { cors } from "@elysiajs/cors";
import { jwt } from "@elysiajs/jwt";
import { authRoutes } from "./routes/auth";
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
import { swagger } from "@elysiajs/swagger";

const app = new Elysia()
  .use(swagger())

  .use(
    cors({
      origin: true,
    }),
  )
  .use(
    jwt({
      name: "jwt",

      secret: process.env.JWT_SECRET!,
    }),
  )
  .onError(({ code, error, set }) => {
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
  })
  .get("/", () => ({
    message: "POS API Running",
  }))
  .group("/api", (app) =>
    app
      .use(authRoutes)
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
      .use(auditLogRoutes)
      .use(storeSettingRoutes)
      .use(notificationRoutes),
  )
  .listen(6060);

console.log(`🦊 POS API running at http://localhost:6060`);
