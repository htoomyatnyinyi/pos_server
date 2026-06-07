import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";
import { requireTenantId } from "../lib/tenant";
import { adjustInventory } from "../lib/inventory";

export const purchaseOrderRoutes = new Elysia({
  prefix: "/purchase-orders",
})
  .get("/", async ({ query, set }) => {
    const tenantId = requireTenantId({ query, set });
    if (!tenantId) return { message: "tenantId is required" };

    return prisma.purchaseOrder.findMany({
      where: { tenantId },
      include: {
        supplier: true,
        createdBy: { select: { id: true, name: true } },
        items: { include: { product: true, variant: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  })
  .get("/:id", async ({ params, set }) => {
    const po = await prisma.purchaseOrder.findUnique({
      where: { id: params.id },
      include: {
        supplier: true,
        createdBy: true,
        items: { include: { product: true, variant: true } },
      },
    });
    if (!po) {
      set.status = 404;
      return { message: "Purchase Order not found" };
    }
    return po;
  })
  .post(
    "/",
    async ({ body, set }) => {
      const poNumber = `PO-${Date.now()}`;
      set.status = 201;
      return prisma.purchaseOrder.create({
        data: {
          tenantId: body.tenantId,
          poNumber,
          supplierId: body.supplierId,
          status: body.status || "DRAFT",
          orderDate: body.orderDate ? new Date(body.orderDate) : new Date(),
          expectedDate: body.expectedDate ? new Date(body.expectedDate) : null,
          subTotal: body.subTotal,
          taxAmount: body.taxAmount || 0,
          grandTotal: body.grandTotal,
          createdById: body.userId,
          notes: body.notes,
          items: {
            create: body.items.map((item) => ({
              tenantId: body.tenantId,
              productId: item.productId,
              variantId: item.variantId,
              quantity: item.quantity,
              unitCost: item.unitCost,
              totalCost: item.totalCost,
            })),
          },
        },
        include: { items: true },
      });
    },
    {
      body: t.Object({
        tenantId: t.String(),
        supplierId: t.String(),
        status: t.Optional(t.String()),
        orderDate: t.Optional(t.String()),
        expectedDate: t.Optional(t.String()),
        subTotal: t.Number(),
        taxAmount: t.Optional(t.Number()),
        grandTotal: t.Number(),
        userId: t.String(),
        notes: t.Optional(t.String()),
        items: t.Array(
          t.Object({
            productId: t.String(),
            variantId: t.Optional(t.String()),
            quantity: t.Integer(),
            unitCost: t.Number(),
            totalCost: t.Number(),
          }),
        ),
      }),
    },
  )
  .post(
    "/:id/receive",
    async ({ params, body, set }) => {
      if (!body.storeId) {
        set.status = 400;
        return { message: "storeId is required to receive stock" };
      }

      const po = await prisma.$transaction(async (tx) => {
        const updated = await tx.purchaseOrder.update({
          where: { id: params.id },
          data: { status: "RECEIVED", receivedDate: new Date() },
          include: { items: true },
        });

        for (const item of updated.items) {
          await adjustInventory(tx, {
            tenantId: updated.tenantId,
            storeId: body.storeId!,
            productId: item.productId,
            variantId: item.variantId,
            quantityDelta: item.quantity,
            userId: body.userId,
            type: "PURCHASE",
            referenceId: updated.id,
            referenceType: "PurchaseOrder",
          });

          await tx.purchaseOrderItem.update({
            where: { id: item.id },
            data: { receivedQuantity: item.quantity },
          });
        }

        return updated;
      });

      set.status = 201;
      return po;
    },
    {
      body: t.Object({
        storeId: t.String(),
        userId: t.String(),
      }),
    },
  )
  .put(
    "/:id",
    async ({ params, body }) => {
      return prisma.purchaseOrder.update({
        where: { id: params.id },
        data: {
          ...body,
          expectedDate: body.expectedDate ? new Date(body.expectedDate) : undefined,
        },
      });
    },
    {
      body: t.Partial(
        t.Object({
          status: t.Optional(t.String()),
          expectedDate: t.Optional(t.String()),
          notes: t.Optional(t.String()),
          subTotal: t.Optional(t.Number()),
          taxAmount: t.Optional(t.Number()),
          grandTotal: t.Optional(t.Number()),
        }),
      ),
    },
  )
  .delete("/:id", async ({ params }) => {
    return prisma.purchaseOrder.delete({ where: { id: params.id } });
  });
