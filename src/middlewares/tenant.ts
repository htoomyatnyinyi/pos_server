// middlewares/tenant.ts
import { Elysia } from "elysia";
import { prisma } from "../../lib/prisma";

export const tenantMiddleware = new Elysia().derive(
  async ({ request, set, user }) => {
    // Try header first, then query param, then JWT
    const tenantId =
      request.headers.get("X-Tenant-ID") ||
      new URL(request.url).searchParams.get("tenantId") ||
      user?.tenantId;

    if (!tenantId) {
      set.status = 400;
      throw new Error("Tenant ID is required");
    }

    // Validate tenant exists and user has access
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId, deletedAt: null },
    });

    if (!tenant) {
      set.status = 404;
      throw new Error("Tenant not found");
    }

    // Check user belongs to tenant
    if (user && user.tenantId !== tenantId) {
      set.status = 403;
      throw new Error("Access denied to this tenant");
    }

    return { tenant };
  },
);
