import { Elysia } from "elysia";
import { jwt } from "@elysiajs/jwt";

export const platformAuthMiddleware = new Elysia({
  name: "platformAuthMiddleware",
})
  .use(jwt({ name: "jwt", secret: process.env.JWT_SECRET! }))
  .derive({ as: "global" }, async ({ jwt, headers }) => {
    const authHeader = headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return { authError: true, authMessage: "No token provided" };
    }
    const token = authHeader.split(" ")[1];
    const payload = await jwt.verify(token);
    if (!payload || !payload.sub) {
      return { authError: true, authMessage: "Invalid or expired token" };
    }
    return {
      authError: false,
      role: payload.role as string,
      userId: payload.sub as string,
    };
  })
  .onBeforeHandle(({ authError, authMessage, role, set }) => {
    if (authError) {
      set.status = 401;
      return { success: false, message: authMessage };
    }
    const allowedRoles = ["SUPER_ADMIN", "SUPPORT_AGENT", "BILLING_ADMIN"];
    if (!allowedRoles.includes(role)) {
      set.status = 403;
      return { success: false, message: "Forbidden: Insufficient privileges" };
    }
  });
