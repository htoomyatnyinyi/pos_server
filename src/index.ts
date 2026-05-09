import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { jwt } from "@elysiajs/jwt";
import { authRoutes } from "./routes/auth";
import { productRoutes } from "./routes/products";
import { orderRoutes } from "./routes/orders";
import { cartRoutes } from "./routes/cart";
import { addressRoutes } from "./routes/addresses";
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
      .use(cartRoutes)
      .use(addressRoutes),
  )
  .listen(3000);

console.log(`🦊 POS API running at http://localhost:3000`);
