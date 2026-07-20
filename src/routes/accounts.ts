import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";
import { platformAuthMiddleware } from "../../middlewares/platformAuthMiddleware";
import { requireRoles } from "../lib/security";

export const accountRoutes = new Elysia({ prefix: "/accounts" })
  .use(platformAuthMiddleware)

  // -------------------------------------------------------------------
  // 1. GET ALL ACCOUNTS (Chart of Accounts)
  // -------------------------------------------------------------------
  .get(
    "/",
    async ({ userId, role, query }) => {
      // Only Super Admin can view all accounts (or we could per tenant)
      // Since this is platform-level accounting, we allow Super Admin only.
      if (role !== "SUPER_ADMIN") {
        return { success: false, message: "Forbidden" };
      }

      const accounts = await prisma.account.findMany({
        where: {
          // We could filter by tenantId if we have platform-wide accounting
          // For now, let's assume we want all accounts (or filter by a specific tenant)
          // Use query.tenantId to filter if needed
          ...(query.tenantId ? { tenantId: query.tenantId as string } : {}),
        },
        include: {
          parent: true,
          children: true,
        },
        orderBy: { code: "asc" },
      });
      return { success: true, accounts };
    },
    {
      query: t.Optional(
        t.Object({
          tenantId: t.Optional(t.String()),
        }),
      ),
    },
  )

  // -------------------------------------------------------------------
  // 2. GET SINGLE ACCOUNT
  // -------------------------------------------------------------------
  .get(
    "/:id",
    async ({ params: { id }, role, set }) => {
      if (role !== "SUPER_ADMIN") {
        set.status = 403;
        return { success: false, message: "Forbidden" };
      }
      const account = await prisma.account.findFirst({
        where: { id },
        include: { parent: true, children: true },
      });
      if (!account) {
        set.status = 404;
        return { success: false, message: "Account not found." };
      }
      return { success: true, account };
    },
    { params: t.Object({ id: t.String() }) },
  )

  // -------------------------------------------------------------------
  // 3. POST – CREATE NEW ACCOUNT
  // -------------------------------------------------------------------
  .post(
    "/",
    async ({ body, role, set }) => {
      if (role !== "SUPER_ADMIN") {
        set.status = 403;
        return { success: false, message: "Forbidden" };
      }

      const existing = await prisma.account.findFirst({
        where: {
          tenantId: body.tenantId,
          code: body.code,
        },
      });
      if (existing) {
        set.status = 400;
        return {
          success: false,
          message: "Account code already exists for this tenant.",
        };
      }

      const account = await prisma.account.create({
        data: {
          tenantId: body.tenantId,
          parentId: body.parentId,
          code: body.code,
          name: body.name,
          type: body.type,
          subType: body.subType,
          description: body.description,
          isActive: true,
          isSystem: body.isSystem ?? false,
        },
      });

      set.status = 201;
      return { success: true, message: "Account created.", account };
    },
    {
      body: t.Object({
        tenantId: t.String(),
        parentId: t.Optional(t.String()),
        code: t.String(),
        name: t.String(),
        type: t.String(),
        subType: t.Optional(t.String()),
        description: t.Optional(t.String()),
        isSystem: t.Optional(t.Boolean()),
      }),
    },
  )

  // -------------------------------------------------------------------
  // 4. PUT – UPDATE ACCOUNT
  // -------------------------------------------------------------------
  .put(
    "/:id",
    async ({ params: { id }, body, role, set }) => {
      if (role !== "SUPER_ADMIN") {
        set.status = 403;
        return { success: false, message: "Forbidden" };
      }
      const current = await prisma.account.findFirst({ where: { id } });
      if (!current) {
        set.status = 404;
        return { success: false, message: "Account not found." };
      }
      const updated = await prisma.account.update({
        where: { id },
        data: {
          name: body.name,
          parentId: body.parentId,
          subType: body.subType,
          description: body.description,
          isActive: body.isActive,
        },
      });
      return { success: true, message: "Account updated.", account: updated };
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Partial(
        t.Object({
          name: t.Optional(t.String()),
          parentId: t.Optional(t.String()),
          subType: t.Optional(t.String()),
          description: t.Optional(t.String()),
          isActive: t.Optional(t.Boolean()),
        }),
      ),
    },
  )

  // -------------------------------------------------------------------
  // 5. DELETE – SOFT DELETE ACCOUNT
  // -------------------------------------------------------------------
  .delete(
    "/:id",
    async ({ params: { id }, role, set }) => {
      if (role !== "SUPER_ADMIN") {
        set.status = 403;
        return { success: false, message: "Forbidden" };
      }
      const account = await prisma.account.findFirst({ where: { id } });
      if (!account) {
        set.status = 404;
        return { success: false, message: "Account not found." };
      }
      await prisma.account.update({
        where: { id },
        data: { isActive: false },
      });
      return { success: true, message: "Account deactivated." };
    },
    { params: t.Object({ id: t.String() }) },
  );
