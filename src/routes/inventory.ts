import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";
import { requireTenantId } from "../lib/tenant";
import { adjustInventory } from "../lib/inventory";
import { movementTypeSchema } from "../lib/schemas";

export const inventoryRoutes = new Elysia({
  prefix: "/inventory",
})
  .get("/", async ({ query, set }) => {
    const tenantId = requireTenantId({ query, set });
    if (!tenantId) return { message: "tenantId is required" };

    return prisma.inventory.findMany({
      where: {
        tenantId,
        ...(query.storeId ? { storeId: query.storeId } : {}),
        ...(query.productId ? { productId: query.productId } : {}),
      },
      include: { product: true, variant: true, store: true },
      orderBy: { updatedAt: "desc" },
    });
  })
  .group("/movements", (app) =>
    app
      .get("/", async ({ query, set }) => {
        const tenantId = requireTenantId({ query, set });
        if (!tenantId) return { message: "tenantId is required" };

        return prisma.stockMovement.findMany({
          where: {
            tenantId,
            ...(query.storeId ? { storeId: query.storeId } : {}),
          },
          include: { product: true, variant: true, user: true, store: true },
          orderBy: { createdAt: "desc" },
        });
      })
      .post(
        "/",
        async ({ body, set }) => {
          if (!body.storeId) {
            set.status = 400;
            return { message: "storeId is required" };
          }

          const result = await prisma.$transaction((tx) =>
            adjustInventory(tx, {
              tenantId: body.tenantId,
              storeId: body.storeId!,
              productId: body.productId,
              variantId: body.variantId,
              quantityDelta: body.quantity,
              userId: body.userId,
              type: body.type,
              referenceId: body.referenceId,
              referenceType: body.referenceType,
              reason: body.reason,
            }),
          );

          set.status = 201;
          return result.movement;
        },
        {
          body: t.Object({
            tenantId: t.String(),
            storeId: t.Optional(t.String()),
            productId: t.String(),
            variantId: t.Optional(t.String()),
            quantity: t.Integer(),
            type: movementTypeSchema,
            referenceId: t.String(),
            referenceType: t.String(),
            reason: t.Optional(t.String()),
            userId: t.String(),
          }),
        },
      ),
  )
  .group("/counts", (app) =>
    app
      .get("/", async ({ query, set }) => {
        const tenantId = requireTenantId({ query, set });
        if (!tenantId) return { message: "tenantId is required" };

        return prisma.inventoryCount.findMany({
          where: {
            tenantId,
            ...(query.storeId ? { storeId: query.storeId } : {}),
          },
          include: { store: true, created: true, approved: true, items: true },
          orderBy: { createdAt: "desc" },
        });
      })
      .post(
        "/",
        async ({ body, set }) => {
          const countNumber = `CNT-${Date.now()}`;
          set.status = 201;
          return prisma.inventoryCount.create({
            data: {
              countNumber,
              tenantId: body.tenantId,
              storeId: body.storeId,
              scheduledDate: new Date(body.scheduledDate),
              createdBy: body.userId,
              items: {
                create: body.items.map((item) => ({
                  tenantId: body.tenantId,
                  productId: item.productId,
                  variantId: item.variantId,
                  systemQuantity: item.systemQuantity,
                  countedQuantity: item.countedQuantity,
                  variance: item.countedQuantity - item.systemQuantity,
                  reason: item.reason,
                })),
              },
            },
            include: { items: true },
          });
        },
        {
          body: t.Object({
            tenantId: t.String(),
            storeId: t.Optional(t.String()),
            scheduledDate: t.String(),
            userId: t.String(),
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
