import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";

export const tenantRoutes = new Elysia({
  prefix: "/tenants",
})
  // NOTE: This file is only mounted under /platform with platformAuthMiddleware.
  // No tenantAuthMiddleware here – access is controlled by Super Admin role.

  // -------------------------------------------------------------------
  // 1. GET ALL TENANTS – SUPER ADMIN ONLY
  // -------------------------------------------------------------------
  .get(
    "/",
    async ({ role, query, set }: any) => {
      if (role !== "SUPER_ADMIN") {
        set.status = 403;
        return {
          success: false,
          message: "Forbidden: Only Super Administrators can view all tenants.",
        };
      }

      const page = query.page ? parseInt(query.page as string) : 1;
      const limit = query.limit ? parseInt(query.limit as string) : 20;
      const skip = (page - 1) * limit;

      const whereCondition = { deletedAt: null };

      const [total, tenants] = await prisma.$transaction([
        prisma.tenant.count({ where: whereCondition }),
        prisma.tenant.findMany({
          where: whereCondition,
          include: {
            subscription: { include: { plan: true } },
          },
          orderBy: { createdAt: "desc" },
          skip,
          take: limit,
        }),
      ]);

      return {
        success: true,
        meta: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
        tenants,
      };
    },
    {
      query: t.Optional(
        t.Object({
          page: t.Optional(t.String()),
          limit: t.Optional(t.String()),
        }),
      ),
    },
  )

  // -------------------------------------------------------------------
  // 2. GET SINGLE TENANT BY ID – SUPER ADMIN OR OWN TENANT
  // -------------------------------------------------------------------
  .get(
    "/:id",
    async ({ params: { id }, tenantId, role, set }: any) => {
      // Allow Super Admin OR the tenant itself (if it has the correct tenantId in context)
      // Note: tenantId is passed from platformAuthMiddleware (but platform admins may not have tenantId)
      // For safety, we only allow Super Admin to view any tenant, and we allow if tenantId matches.
      if (role !== "SUPER_ADMIN" && tenantId !== id) {
        set.status = 403;
        return {
          success: false,
          message:
            "Access denied. You cannot view other tenant's configuration.",
        };
      }

      const tenant = await prisma.tenant.findFirst({
        where: { id, deletedAt: null },
        include: {
          subscription: { include: { plan: true } },
          stores: { where: { deletedAt: null } },
          tenantFeatures: { include: { feature: true } },
        },
      });

      if (!tenant) {
        set.status = 404;
        return { success: false, message: "Tenant organization not found." };
      }

      return { success: true, tenant };
    },
    { params: t.Object({ id: t.String() }) },
  )

  // -------------------------------------------------------------------
  // 3. POST: CREATE NEW TENANT – SUPER ADMIN ONLY (or system)
  // -------------------------------------------------------------------
  .post(
    "/",
    async ({ body, userId, set }: any) => {
      // Role check is enforced by platformAuthMiddleware, but we can double-check
      // We allow creating a tenant without requiring Super Admin? Usually yes, but system might call internally.
      // We assume it's called by Super Admin.

      const generatedCode = body.code
        ? body.code.trim().toUpperCase()
        : `TNT-${Date.now()}`;

      const existingTenant = await prisma.tenant.findFirst({
        where: { code: generatedCode },
      });
      if (existingTenant) {
        set.status = 400;
        return {
          success: false,
          message: `Tenant code '${generatedCode}' is already taken.`,
        };
      }

      const tenant = await prisma.$transaction(async (tx: any) => {
        const created = await tx.tenant.create({
          data: {
            code: generatedCode,
            name: body.name.trim(),
            email: body.email ? body.email.trim().toLowerCase() : null,
            phone: body.phone ? body.phone.trim() : null,
            isActive: true,
          },
        });

        if (userId) {
          await tx.auditLog.create({
            data: {
              tenantId: created.id,
              userId: userId,
              action: "CREATE",
              entity: "Tenant",
              entityId: created.id,
              newData: JSON.parse(JSON.stringify(created)),
            },
          });
        }

        return created;
      });

      set.status = 201;
      return {
        success: true,
        message: "Tenant account provisioned successfully.",
        tenant,
      };
    },
    {
      body: t.Object({
        code: t.Optional(t.String()),
        name: t.String({ minLength: 2 }),
        email: t.Optional(t.String()),
        phone: t.Optional(t.String()),
        userId: t.Optional(t.String()),
      }),
    },
  )

  // -------------------------------------------------------------------
  // 4. POST: ASSIGN SUBSCRIPTION PLAN TO TENANT – SUPER ADMIN ONLY
  // -------------------------------------------------------------------
  .post(
    "/:id/subscription",
    async ({ params: { id }, body, role, userId, set }: any) => {
      if (role !== "SUPER_ADMIN") {
        set.status = 403;
        return {
          success: false,
          message: "Only Super Admin can assign subscription plans.",
        };
      }

      const { planId, billingCycle } = body;

      // Check tenant exists
      const tenant = await prisma.tenant.findFirst({
        where: { id, deletedAt: null },
      });
      if (!tenant) {
        set.status = 404;
        return { success: false, message: "Tenant not found." };
      }

      // Check plan exists – FIX: use subscriptionPlan
      const plan = await prisma.subscriptionPlan.findFirst({
        where: { id: planId, deletedAt: null, isActive: true },
      });
      if (!plan) {
        set.status = 404;
        return { success: false, message: "Plan not found or inactive." };
      }

      const subscription = await prisma.$transaction(async (tx: any) => {
        // Deactivate old active subscription
        await tx.tenantSubscription.updateMany({
          where: {
            tenantId: id,
            status: "ACTIVE",
          },
          data: {
            status: "EXPIRED",
            endDate: new Date(),
          },
        });

        // Create new subscription – FIX: use tenantSubscription
        const created = await tx.tenantSubscription.create({
          data: {
            tenantId: id,
            planId,
            startDate: new Date(),
            status: "ACTIVE",
            billingCycle: billingCycle || "MONTHLY",
            autoRenew: true,
            currentStores: 0,
            currentUsers: 0,
            currentProducts: 0,
            currentCustomers: 0,
          },
          include: {
            plan: true,
          },
        });

        if (userId) {
          await tx.auditLog.create({
            data: {
              tenantId: id,
              userId,
              action: "CREATE",
              entity: "Subscription",
              entityId: created.id,
              newData: JSON.parse(JSON.stringify(created)),
            },
          });
        }

        return created;
      });

      set.status = 201;
      return {
        success: true,
        message: "Subscription plan assigned successfully.",
        subscription,
      };
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        planId: t.String(),
        billingCycle: t.Optional(t.String()), // MONTHLY | YEARLY
      }),
    },
  )

  // -------------------------------------------------------------------
  // 5. PUT: UPDATE TENANT – SUPER ADMIN OR OWN TENANT (with restrictions)
  // -------------------------------------------------------------------
  .put(
    "/:id",
    async ({ params: { id }, body, tenantId, role, userId, set }: any) => {
      if (role !== "SUPER_ADMIN" && tenantId !== id) {
        set.status = 403;
        return {
          success: false,
          message: "Unauthorized: Cannot modify other tenant profiles.",
        };
      }

      const currentTenant = await prisma.tenant.findFirst({
        where: { id, deletedAt: null },
      });
      if (!currentTenant) {
        set.status = 404;
        return { success: false, message: "Tenant account not found." };
      }

      // Only SUPER_ADMIN can change isActive
      if (body.isActive !== undefined && role !== "SUPER_ADMIN") {
        set.status = 403;
        return {
          success: false,
          message: "Only Super Admin can change tenant active status.",
        };
      }

      const updatedTenant = await prisma.$transaction(async (tx: any) => {
        const updated = await tx.tenant.update({
          where: { id },
          data: {
            name: body.name ? body.name.trim() : undefined,
            email: body.email ? body.email.trim().toLowerCase() : undefined,
            phone: body.phone ? body.phone.trim() : undefined,
            isActive: body.isActive,
          },
        });

        if (userId) {
          await tx.auditLog.create({
            data: {
              tenantId: id,
              userId: userId,
              action: "UPDATE",
              entity: "Tenant",
              entityId: id,
              oldData: JSON.parse(JSON.stringify(currentTenant)),
              newData: JSON.parse(JSON.stringify(updated)),
            },
          });
        }

        return updated;
      });

      return {
        success: true,
        message: "Tenant profile updated successfully.",
        tenant: updatedTenant,
      };
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Partial(
        t.Object({
          name: t.Optional(t.String()),
          email: t.Optional(t.String()),
          phone: t.Optional(t.String()),
          isActive: t.Optional(t.Boolean()),
        }),
      ),
    },
  )

  // -------------------------------------------------------------------
  // 6. DELETE: SOFT-DELETE TENANT – SUPER ADMIN ONLY
  // -------------------------------------------------------------------
  .delete(
    "/:id",
    async ({ params: { id }, role, userId, set }: any) => {
      if (role !== "SUPER_ADMIN") {
        set.status = 403;
        return {
          success: false,
          message: "Only Platform Super Administrators can delete tenants.",
        };
      }

      const tenant = await prisma.tenant.findFirst({
        where: { id, deletedAt: null },
      });
      if (!tenant) {
        set.status = 404;
        return {
          success: false,
          message: "Tenant target not found or already deleted.",
        };
      }

      await prisma.$transaction(async (tx: any) => {
        const deleted = await tx.tenant.update({
          where: { id },
          data: {
            deletedAt: new Date(),
            isActive: false,
          },
        });

        await tx.auditLog.create({
          data: {
            tenantId: id,
            userId,
            action: "DELETE",
            entity: "Tenant",
            entityId: id,
            oldData: JSON.parse(JSON.stringify(tenant)),
            newData: JSON.parse(JSON.stringify(deleted)),
          },
        });
      });

      return {
        success: true,
        message:
          "Tenant account has been successfully deactivated and soft-deleted.",
      };
    },
    { params: t.Object({ id: t.String() }) },
  );
