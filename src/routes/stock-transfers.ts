import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";
import { requireTenantId } from "../lib/tenant";
import { adjustInventory } from "../lib/inventory";

export const stockTransferRoutes = new Elysia({
  prefix: "/stock-transfers",
})
  .get("/", async ({ query, set }) => {
    const tenantId = requireTenantId({ query, set });
    if (!tenantId) return { message: "tenantId is required" };

    return prisma.stockTransfer.findMany({
      where: { tenantId },
      include: {
        fromStore: true,
        toStore: true,
        requestedBy: { select: { id: true, name: true } },
        approvedBy: { select: { id: true, name: true } },
        items: { include: { product: true, variant: true } },
      },
      orderBy: { requestedAt: "desc" },
    });
  })
  .get("/:id", async ({ params, set }) => {
    const transfer = await prisma.stockTransfer.findUnique({
      where: { id: params.id },
      include: {
        fromStore: true,
        toStore: true,
        requestedBy: true,
        approvedBy: true,
        items: { include: { product: true, variant: true } },
      },
    });
    if (!transfer) {
      set.status = 404;
      return { message: "Stock Transfer not found" };
    }
    return transfer;
  })
  .post(
    "/",
    async ({ body, set }) => {
      const transferNumber = `TRF-${Date.now()}`;
      set.status = 201;
      return prisma.stockTransfer.create({
        data: {
          tenantId: body.tenantId,
          transferNumber,
          fromStoreId: body.fromStoreId,
          toStoreId: body.toStoreId,
          status: "PENDING",
          requestedById: body.userId,
          notes: body.notes,
          items: {
            create: body.items.map((item) => ({
              tenantId: body.tenantId,
              productId: item.productId,
              variantId: item.variantId,
              quantity: item.quantity,
            })),
          },
        },
        include: { items: true },
      });
    },
    {
      body: t.Object({
        tenantId: t.String(),
        fromStoreId: t.String(),
        toStoreId: t.String(),
        userId: t.String(),
        notes: t.Optional(t.String()),
        items: t.Array(
          t.Object({
            productId: t.String(),
            variantId: t.Optional(t.String()),
            quantity: t.Integer(),
          }),
        ),
      }),
    },
  )
  .post(
    "/:id/complete",
    async ({ params, body, set }) => {
      const transfer = await prisma.$transaction(async (tx) => {
        const updated = await tx.stockTransfer.update({
          where: { id: params.id },
          data: {
            status: "RECEIVED",
            completedAt: new Date(),
            approvedById: body.userId,
          },
          include: { items: true },
        });

        for (const item of updated.items) {
          await adjustInventory(tx, {
            tenantId: updated.tenantId,
            storeId: updated.fromStoreId,
            productId: item.productId,
            variantId: item.variantId,
            quantityDelta: -item.quantity,
            userId: body.userId,
            type: "TRANSFER_OUT",
            referenceId: updated.id,
            referenceType: "StockTransfer",
          });

          await adjustInventory(tx, {
            tenantId: updated.tenantId,
            storeId: updated.toStoreId,
            productId: item.productId,
            variantId: item.variantId,
            quantityDelta: item.quantity,
            userId: body.userId,
            type: "TRANSFER_IN",
            referenceId: updated.id,
            referenceType: "StockTransfer",
          });

          await tx.stockTransferItem.update({
            where: { id: item.id },
            data: { receivedQuantity: item.quantity },
          });
        }

        return updated;
      });

      set.status = 201;
      return transfer;
    },
    {
      body: t.Object({ userId: t.String() }),
    },
  )
  .delete("/:id", async ({ params }) => {
    return prisma.stockTransfer.delete({ where: { id: params.id } });
  });
