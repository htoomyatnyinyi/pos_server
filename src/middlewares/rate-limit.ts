// middlewares/rate-limit.ts
import { Elysia } from "elysia";

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

export const rateLimitMiddleware = (options: {
  maxRequests?: number;
  windowMs?: number;
}) =>
  new Elysia().derive(async ({ request, set }) => {
    const ip = request.headers.get("x-forwarded-for") || "unknown";
    const key = `${ip}:${new URL(request.url).pathname}`;
    const now = Date.now();
    const windowMs = options.windowMs || 60000; // 1 minute
    const maxRequests = options.maxRequests || 100;

    const record = rateLimitMap.get(key);

    if (!record || record.resetAt < now) {
      rateLimitMap.set(key, { count: 1, resetAt: now + windowMs });
      return;
    }

    if (record.count >= maxRequests) {
      set.status = 429;
      set.headers["X-RateLimit-Limit"] = String(maxRequests);
      set.headers["X-RateLimit-Remaining"] = "0";
      set.headers["Retry-After"] = String(
        Math.ceil((record.resetAt - now) / 1000),
      );
      throw new Error("Too many requests. Please try again later.");
    }

    record.count++;
    set.headers["X-RateLimit-Limit"] = String(maxRequests);
    set.headers["X-RateLimit-Remaining"] = String(maxRequests - record.count);
  });
