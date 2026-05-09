import { Elysia } from "elysia";
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
      .use(inventoryRoutes),
  )
  .listen(3000);

console.log(`🦊 POS API running at http://localhost:3000`);
