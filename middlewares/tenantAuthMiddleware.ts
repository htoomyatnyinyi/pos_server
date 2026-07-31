import { Elysia } from "elysia";
import { jwt } from "@elysiajs/jwt";

export const tenantAuthMiddleware = new Elysia({ name: "tenantAuthMiddleware" })
  .use(jwt({ name: "jwt", secret: process.env.JWT_SECRET! }))
  .derive({ as: "global" }, async ({ jwt, headers }) => {
    const authHeader = headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return { authError: true, tenantId: "", userId: "", role: "" };
    }
    const token = authHeader.split(" ")[1];
    const payload = await jwt.verify(token);
    if (!payload || !payload.sub) {
      return { authError: true, tenantId: "", userId: "", role: "" };
    }
    return {
      authError: false,
      tenantId: payload.tenantId as string,
      userId: payload.sub as string,
      role: payload.role as string,
    };
  })
  .onBeforeHandle(({ authError, tenantId, userId, set }) => {
    if (authError || !tenantId || !userId) {
      set.status = 401;
      return { success: false, message: "Unauthorized" };
    }
  });
