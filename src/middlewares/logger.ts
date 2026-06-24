// middlewares/logger.ts
import { Elysia } from "elysia";
import pino from "pino";

const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  timestamp: pino.stdTimeFunctions.isoTime,
});

export const loggingMiddleware = new Elysia()
  .onRequest(async ({ request }) => {
    const start = Date.now();
    const url = new URL(request.url);

    // Store for later use
    request.__startTime = start;
    request.__path = url.pathname;
    request.__method = request.method;
  })
  .onAfterResponse(async ({ request, set }) => {
    const duration = Date.now() - (request.__startTime || Date.now());

    logger.info({
      method: request.__method || request.method,
      path: request.__path || new URL(request.url).pathname,
      status: set.status || 200,
      duration: `${duration}ms`,
      ip:
        request.headers.get("x-forwarded-for") ||
        request.headers.get("x-real-ip"),
      userAgent: request.headers.get("user-agent"),
    });
  });
