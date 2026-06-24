// middlewares/cors.ts
import { Elysia } from "elysia";

export const corsMiddleware = new Elysia().onRequest(async ({ set }) => {
  set.headers["Access-Control-Allow-Origin"] = "*";
  set.headers["Access-Control-Allow-Methods"] =
    "GET, POST, PUT, DELETE, PATCH, OPTIONS";
  set.headers["Access-Control-Allow-Headers"] =
    "Content-Type, Authorization, X-Tenant-ID";
  set.headers["Access-Control-Allow-Credentials"] = "true";
  set.headers["Access-Control-Expose-Headers"] =
    "X-Request-ID, X-RateLimit-Limit, X-RateLimit-Remaining";
});
