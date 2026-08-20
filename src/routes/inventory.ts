import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";
import { tenantAuthMiddleware } from "../../middlewares/tenantAuthMiddleware";
import { adjustInventory } from "../lib/inventory";
import { MovementType } from "@prisma/client";
import { validateStore, requirePermission, requireRoles } from "../lib/security";

export const inventoryRoutes = new Elysia({ prefix: "/inventory" })
  .use(tenantAuthMiddleware)

  .get(
    "/",
    async ({ tenantId, query }) => {
      const page = query.page ? parseInt(query.page as string) : 1;
      const limit = query.limit ? parseInt(query.limit as string) : 20;
      const skip = (page - 1) * limit;
      const whereCondition: any = {
        tenantId,
        ...(query.storeId ? { storeId: query.storeId as string } : {}),
        ...(query.productId ? { productId: query.productId as string } : {}),
      };
      const [total, inventory] = await prisma.$transaction([
        prisma.inventory.count({ where: whereCondition }),
        prisma.inventory.findMany({
          where: whereCondition,
          include: { product: true, variant: true, store: true },
          orderBy: { updatedAt: "desc" },
          skip,
          take: limit,
        }),
      ]);
      const productIds = [...new Set(inventory.map((row: any) => row.productId))];
      const [productsForTotal, scopedRows] = await prisma.$transaction([
        prisma.product.findMany({
          where: { tenantId, id: { in: productIds } },
          select: { id: true, variants: { select: { id: true } } },
        }),
        prisma.inventory.findMany({
          where: {
            tenantId,
            productId: { in: productIds },
            ...(query.storeId ? { storeId: query.storeId as string } : {}),
            lotId: null,
          },
          select: { productId: true, variantId: true, quantity: true },
        }),
      ]);
      const variantProductIds = new Set(
        productsForTotal.filter((product: any) => product.variants.length > 0).map((product: any) => product.id),
      );
      const totalByProduct = new Map<string, number>();
      for (const row of scopedRows) {
        const isVariantStock = variantProductIds.has(row.productId);
        if ((isVariantStock && row.variantId == null) || (!isVariantStock && row.variantId != null)) continue;
        totalByProduct.set(row.productId, (totalByProduct.get(row.productId) ?? 0) + row.quantity);
      }
      return {
        success: true,
        meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
        // Each row keeps its own variant quantity. `productTotalStock` is the
        // parent total for inventory screens and is never copied into quantity.
        inventory: inventory.map((row: any) => ({
          ...row,
          productTotalStock: totalByProduct.get(row.productId) ?? 0,
        })),
      };
    },
    {
      query: t.Optional(
        t.Object({
          page: t.Optional(t.String()),
          limit: t.Optional(t.String()),
          storeId: t.Optional(t.String()),
          productId: t.Optional(t.String()),
        }),
      ),
    },
  )

  .group("/movements", (app) =>
    app
      .get(
        "/",
        async ({ tenantId, query }) => {
          const page = query.page ? parseInt(query.page as string) : 1;
          const limit = query.limit ? parseInt(query.limit as string) : 20;
          const skip = (page - 1) * limit;
          const whereCondition: any = {
            tenantId,
            ...(query.storeId ? { storeId: query.storeId as string } : {}),
            ...(query.type ? { type: query.type as MovementType } : {}),
          };
          const [total, movements] = await prisma.$transaction([
            prisma.stockMovement.count({ where: whereCondition }),
            prisma.stockMovement.findMany({
              where: whereCondition,
              include: {
                product: true,
                variant: true,
                user: { select: { id: true, name: true } },
                store: true,
              },
              orderBy: { createdAt: "desc" },
              skip,
              take: limit,
            }),
          ]);
          return {
            success: true,
            meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
            movements,
          };
        },
        {
          query: t.Optional(
            t.Object({
              page: t.Optional(t.String()),
              limit: t.Optional(t.String()),
              storeId: t.Optional(t.String()),
              type: t.Optional(t.String()),
            }),
          ),
        },
      )
      .post(
        "/",
        async ({ body, tenantId, userId, role, set }) => {
          requireRoles(role, ["ADMIN", "MANAGER", "SUPER_ADMIN"], set);
          await requirePermission(userId, role, "MANAGE_INVENTORY", set);
          if (!body.storeId) {
            set.status = 400;
            return { success: false, message: "storeId is required" };
          }
          await validateStore(body.storeId, tenantId);

          const result = await prisma.$transaction(async (tx: any) => {
            return await adjustInventory(tx, {
              tenantId,
              storeId: body.storeId!,
              productId: body.productId,
              variantId: body.variantId ?? null,
              quantityDelta: body.quantity,
              userId,
              type: body.type as MovementType,
              referenceId: body.referenceId,
              referenceType: body.referenceType,
              reason: body.reason,
            });
          });

          set.status = 201;
          return {
            success: true,
            message: "Stock adjusted successfully.",
            movement: result.movement,
          };
        },
        {
          body: t.Object({
            storeId: t.String({ minLength: 1 }),
            productId: t.String(),
            variantId: t.Optional(t.String()),
            quantity: t.Integer(),
            type: t.String(),
            referenceId: t.String(),
            referenceType: t.String(),
            reason: t.Optional(t.String()),
          }),
        },
      ),
  )

  .group("/counts", (app) =>
    app
      .get(
        "/",
        async ({ tenantId, query }) => {
          const page = query.page ? parseInt(query.page as string) : 1;
          const limit = query.limit ? parseInt(query.limit as string) : 20;
          const skip = (page - 1) * limit;
          const whereCondition = {
            tenantId,
            ...(query.storeId ? { storeId: query.storeId as string } : {}),
          };
          const [total, counts] = await prisma.$transaction([
            prisma.inventoryCount.count({ where: whereCondition }),
            prisma.inventoryCount.findMany({
              where: whereCondition,
              include: {
                store: true,
                created: true,
                approved: true,
                items: true,
              },
              orderBy: { createdAt: "desc" },
              skip,
              take: limit,
            }),
          ]);
          return {
            success: true,
            meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
            counts,
          };
        },
        {
          query: t.Optional(
            t.Object({
              page: t.Optional(t.String()),
              limit: t.Optional(t.String()),
              storeId: t.Optional(t.String()),
            }),
          ),
        },
      )
      .post(
        "/",
        async ({ body, tenantId, userId, role, set }) => {
          requireRoles(role, ["ADMIN", "MANAGER", "SUPER_ADMIN"], set);
          await requirePermission(userId, role, "MANAGE_INVENTORY", set);
          if (!body.storeId) {
            set.status = 400;
            return {
              success: false,
              message: "storeId is required to create a stock count sheet.",
            };
          }
          await validateStore(body.storeId, tenantId);

          const countNumber = `CNT-${Date.now()}`;
          const inventoryCount = await prisma.$transaction(async (tx: any) => {
            const createdCount = await tx.inventoryCount.create({
              data: {
                countNumber,
                tenantId,
                storeId: body.storeId,
                scheduledDate: body.scheduledDate
                  ? new Date(body.scheduledDate)
                  : new Date(),
                createdBy: userId,
                items: {
                  create: body.items.map((item) => ({
                    tenantId,
                    productId: item.productId,
                    variantId: item.variantId ?? null,
                    systemQuantity: item.systemQuantity,
                    countedQuantity: item.countedQuantity,
                    variance: item.countedQuantity - item.systemQuantity,
                    reason: item.reason,
                  })),
                },
              },
              include: { items: true },
            });
            await tx.auditLog.create({
              data: {
                tenantId,
                userId,
                action: "CREATE",
                entity: "InventoryCount",
                entityId: createdCount.id,
                newData: JSON.parse(JSON.stringify(createdCount)),
              },
            });
            return createdCount;
          });

          set.status = 201;
          return {
            success: true,
            message: "Inventory Stock Count created successfully.",
            inventoryCount,
          };
        },
        {
          body: t.Object({
            storeId: t.String(),
            scheduledDate: t.Optional(t.String()),
            items: t.Array(
              t.Object({
                productId: t.String(),
                variantId: t.Optional(t.String()),
                systemQuantity: t.Integer(),
                countedQuantity: t.Integer(),
                reason: t.Optional(t.String()),
              }),
            ),
          }),
        },
      ),
  );
