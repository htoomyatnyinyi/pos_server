import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";
import { tenantAuthMiddleware } from "../../middlewares/tenantAuthMiddleware";

export const tenantProfileRoutes = new Elysia({
  prefix: "/profile",
})
  .use(tenantAuthMiddleware)

  /**
   * GET /profile – returns the tenant that the current user belongs to.
   * Only fields that are safe for tenant users are exposed.
   */
  .get("/", async ({ tenantId, set }) => {
    const tenant = await prisma.tenant.findFirst({
      where: { id: tenantId, deletedAt: null },
      select: {
        id: true,
        code: true,
        name: true,
        email: true,
        phone: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        // you can include subscription info if needed
        subscription: {
          include: { plan: true },
        },
      },
    });

    if (!tenant) {
      set.status = 404;
      return {
        success: false,
        message: "Tenant not found or access denied.",
      };
    }

    return { success: true, tenant };
  })

  /**
   * PUT /profile – update the tenant's own profile.
   * Restricts updates to non‑sensitive fields.
   */
  .put(
    "/",
    async ({ body, tenantId, userId, set }) => {
      // Only allow updating name, email, phone – no isActive, subscription, etc.
      const updateData: any = {};
      if (body.name !== undefined) updateData.name = body.name.trim();
      if (body.email !== undefined)
        updateData.email = body.email.trim().toLowerCase();
      if (body.phone !== undefined) updateData.phone = body.phone.trim();

      // Prevent updating isActive – that is admin‑only.
      if (body.isActive !== undefined) {
        set.status = 403;
        return {
          success: false,
          message:
            "You are not allowed to change the active status of your tenant.",
        };
      }

      // Ensure at least one field is provided
      if (Object.keys(updateData).length === 0) {
        set.status = 400;
        return {
          success: false,
          message: "At least one field (name, email, phone) must be provided.",
        };
      }

      const updatedTenant = await prisma.$transaction(async (tx: any) => {
        const updated = await tx.tenant.update({
          where: { id: tenantId },
          data: updateData,
          select: {
            id: true,
            code: true,
            name: true,
            email: true,
            phone: true,
            isActive: true,
            createdAt: true,
            updatedAt: true,
          },
        });

        // Audit log
        await tx.auditLog.create({
          data: {
            tenantId,
            userId,
            action: "UPDATE",
            entity: "Tenant",
            entityId: tenantId,
            newData: JSON.parse(JSON.stringify(updated)),
          },
        });

        return updated;
      });

      return {
        success: true,
        message: "Tenant profile updated successfully.",
        tenant: updatedTenant,
      };
    },
    {
      body: t.Partial(
        t.Object({
          name: t.Optional(t.String({ minLength: 2 })),
          email: t.Optional(t.String({ format: "email" })),
          phone: t.Optional(t.String()),
          // isActive is intentionally not allowed here
        }),
      ),
    },
  );
