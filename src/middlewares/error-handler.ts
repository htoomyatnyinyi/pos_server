// middlewares/error-handler.ts
import { Elysia } from "elysia";
import { v4 as uuidv4 } from "uuid";

export const errorHandlerMiddleware = new Elysia().onError(
  async ({ code, error, set, request }) => {
    const requestId = uuidv4();
    const timestamp = new Date().toISOString();
    const path = new URL(request.url).pathname;

    // Log error
    console.error({
      requestId,
      timestamp,
      path,
      code,
      error: error.message,
      stack: error.stack,
    });

    // Send structured error response
    set.status =
      code === "VALIDATION"
        ? 400
        : code === "UNAUTHORIZED"
          ? 401
          : code === "FORBIDDEN"
            ? 403
            : code === "NOT_FOUND"
              ? 404
              : code === "RATE_LIMIT"
                ? 429
                : 500;

    return {
      success: false,
      error: {
        code: code || "INTERNAL_SERVER_ERROR",
        message: error.message || "An unexpected error occurred",
        requestId,
        timestamp,
        path,
        ...(process.env.NODE_ENV === "development" && { stack: error.stack }),
      },
    };
  },
);
