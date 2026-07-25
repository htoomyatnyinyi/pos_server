import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";
import { tenantAuthMiddleware } from "../../middlewares/tenantAuthMiddleware";
import { requireRoles } from "../lib/security";

export const promotionRoutes = new Elysia({ prefix: "/promotions" })
  .use(tenantAuthMiddleware)

  .get(
    "/",
    async ({ tenantId, query }) => {
      const page = query.page ? parseInt(query.page as string) : 1;
      const limit = query.limit ? parseInt(query.limit as string) : 20;
      const skip = (page - 1) * limit;
      const search = query.search as string;

      const whereCondition: any = {
        tenantId,
        deletedAt: null,
      };
      if (query.isActive !== undefined) {
        whereCondition.isActive = query.isActive === "true";
      }
      if (search) {
        whereCondition.OR = [
          { name: { contains: search, mode: "insensitive" } },
          { code: { contains: search, mode: "insensitive" } },
        ];
      }

      const [total, promotions] = await prisma.$transaction([
        prisma.promotion.count({ where: whereCondition }),
        prisma.promotion.findMany({
          where: whereCondition,
          include: {
            products: { include: { product: true } },
            categories: { include: { category: true } },
          },
          orderBy: { createdAt: "desc" },
          skip,
          take: limit,
        }),
      ]);

      return {
        success: true,
        meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
        promotions,
      };
    },
    {
      query: t.Optional(
        t.Object({
          page: t.Optional(t.String()),
          limit: t.Optional(t.String()),
          search: t.Optional(t.String()),
          isActive: t.Optional(t.String()),
        }),
      ),
    },
  )

  .get(
    "/:id",
    async ({ params: { id }, tenantId, set }) => {
      const promotion = await prisma.promotion.findFirst({
        where: { id, tenantId, deletedAt: null },
        include: {
          products: { include: { product: true } },
          categories: { include: { category: true } },
        },
      });
      if (!promotion) {
        set.status = 404;
        return { success: false, message: "Promotion not found." };
      }
      return { success: true, promotion };
    },
    { params: t.Object({ id: t.String() }) },
  )

  .post(
    "/",
    async ({ body, tenantId, userId, role, set }) => {
      requireRoles(role, ["ADMIN", "MANAGER", "SUPER_ADMIN"], set);

      const existing = await prisma.promotion.findFirst({
        where: { tenantId, code: body.code.trim(), deletedAt: null },
      });
      if (existing) {
        set.status = 400;
        return { success: false, message: "Promotion code already exists." };
      }

      const promotion = await prisma.$transaction(async (tx: any) => {
        const created = await tx.promotion.create({
          data: {
            tenantId,
            code: body.code.trim(),
            name: body.name.trim(),
            description: body.description,
            discountType: body.discountType,
            discountValue: body.discountValue,
            minPurchase: body.minPurchase,
            minQuantity: body.minQuantity,
            startDate: new Date(body.startDate),
            endDate: new Date(body.endDate),
            usageLimit: body.usageLimit,
            perUserLimit: body.perUserLimit,
            applicableTo: body.applicableTo || "ALL_PRODUCTS",
            priority: body.priority || 0,
            stackable: body.stackable || false,
            isActive: body.isActive ?? true,
            products: body.productIds
              ? {
                  create: body.productIds.map((pid) => ({
                    productId: pid,
                  })),
                }
              : undefined,
            categories: body.categoryIds
              ? {
                  create: body.categoryIds.map((cid) => ({
                    categoryId: cid,
                  })),
                }
              : undefined,
          },
          include: {
            products: { include: { product: true } },
            categories: { include: { category: true } },
          },
        });
        await tx.auditLog.create({
          data: {
            tenantId,
            userId,
            action: "CREATE",
            entity: "Promotion",
            entityId: created.id,
            newData: JSON.parse(JSON.stringify(created)),
          },
        });
        return created;
      });

      set.status = 201;
      return {
        success: true,
        message: "Promotion created successfully.",
        promotion,
      };
    },
    {
      body: t.Object({
        code: t.String({ minLength: 2 }),
        name: t.String({ minLength: 2 }),
        description: t.Optional(t.String()),
        discountType: t.String(),
        discountValue: t.Number({ minimum: 0 }),
        minPurchase: t.Optional(t.Number()),
        minQuantity: t.Optional(t.Integer()),
        startDate: t.String(),
        endDate: t.String(),
        usageLimit: t.Optional(t.Integer()),
        perUserLimit: t.Optional(t.Integer()),
        applicableTo: t.Optional(t.String()),
        priority: t.Optional(t.Integer()),
        stackable: t.Optional(t.Boolean()),
        isActive: t.Optional(t.Boolean()),
        productIds: t.Optional(t.Array(t.String())),
        categoryIds: t.Optional(t.Array(t.String())),
      }),
    },
  )

  .put(
    "/:id",
    async ({ params: { id }, body, tenantId, userId, role, set }) => {
      requireRoles(role, ["ADMIN", "MANAGER", "SUPER_ADMIN"], set);

      const current = await prisma.promotion.findFirst({
        where: { id, tenantId, deletedAt: null },
      });
      if (!current) {
        set.status = 404;
        return { success: false, message: "Promotion not found." };
      }

      const updated = await prisma.promotion.update({
        where: { id },
        data: {
          code: body.code?.trim(),
          name: body.name?.trim(),
          description: body.description,
          discountType: body.discountType,
          discountValue: body.discountValue,
          minPurchase: body.minPurchase,
          minQuantity: body.minQuantity,
          startDate: body.startDate ? new Date(body.startDate) : undefined,
          endDate: body.endDate ? new Date(body.endDate) : undefined,
          usageLimit: body.usageLimit,
          perUserLimit: body.perUserLimit,
          applicableTo: body.applicableTo,
          priority: body.priority,
          stackable: body.stackable,
          isActive: body.isActive,
        },
      });

      await prisma.auditLog.create({
        data: {
          tenantId,
          userId,
          action: "UPDATE",
          entity: "Promotion",
          entityId: id,
          oldData: JSON.parse(JSON.stringify(current)),
          newData: JSON.parse(JSON.stringify(updated)),
        },
      });

      return {
        success: true,
        message: "Promotion updated successfully.",
        promotion: updated,
      };
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Partial(
        t.Object({
          code: t.Optional(t.String()),
          name: t.Optional(t.String()),
          description: t.Optional(t.String()),
          discountType: t.Optional(t.String()),
          discountValue: t.Optional(t.Number({ minimum: 0 })),
          minPurchase: t.Optional(t.Number()),
          minQuantity: t.Optional(t.Integer()),
          startDate: t.Optional(t.String()),
          endDate: t.Optional(t.String()),
          usageLimit: t.Optional(t.Integer()),
          perUserLimit: t.Optional(t.Integer()),
          applicableTo: t.Optional(t.String()),
          priority: t.Optional(t.Integer()),
          stackable: t.Optional(t.Boolean()),
          isActive: t.Optional(t.Boolean()),
        }),
      ),
    },
  )

  .delete(
    "/:id",
    async ({ params: { id }, tenantId, userId, role, set }) => {
      requireRoles(role, ["ADMIN", "MANAGER", "SUPER_ADMIN"], set);

      const promotion = await prisma.promotion.findFirst({
        where: { id, tenantId, deletedAt: null },
      });
      if (!promotion) {
        set.status = 404;
        return {
          success: false,
          message: "Promotion not found or already deleted.",
        };
      }

      await prisma.$transaction(async (tx: any) => {
        const deleted = await tx.promotion.update({
          where: { id },
          data: { deletedAt: new Date(), isActive: false },
        });
        await tx.auditLog.create({
          data: {
            tenantId,
            userId,
            action: "DELETE",
            entity: "Promotion",
            entityId: id,
            oldData: JSON.parse(JSON.stringify(promotion)),
            newData: JSON.parse(JSON.stringify(deleted)),
          },
        });
      });

      return { success: true, message: "Promotion deleted successfully." };
    },
    { params: t.Object({ id: t.String() }) },
  );
