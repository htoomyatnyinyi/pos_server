import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";

export const purchaseOrderRoutes = new Elysia({
  prefix: "/purchase-orders",
})
  .get("/", async () => {
    return prisma.purchaseOrder.findMany({
      include: {
        supplier: true,
        items: {
          include: {
            product: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });
  })
  .get("/:id", async ({ params, set }) => {
    const po = await prisma.purchaseOrder.findUnique({
      where: { id: params.id },
      include: {
        supplier: true,
        items: {
          include: {
            product: true,
          },
        },
      },
    });
    if (!po) { set.status = 404; return "Purchase Order not found"; }return po;
  })
  .post(
    "/",
    async ({ body, set }) => {
      const poNumber = `PO-${Date.now()}`;
      set.status = 201;
      return prisma.purchaseOrder.create({
        data: {
          poNumber,
          supplierId: body.supplierId,
          status: body.status || "DRAFT",
          orderDate: body.orderDate ? new Date(body.orderDate) : new Date(),
          expectedDate: body.expectedDate ? new Date(body.expectedDate) : null,
          subTotal: body.subTotal,
          taxAmount: body.taxAmount || 0,
          grandTotal: body.grandTotal,
          createdBy: body.userId,
          notes: body.notes,
          items: {
            create: body.items.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
              unitCost: item.unitCost,
              totalCost: item.totalCost,
            })),
          },
        },
      });
    },
    {
      body: t.Object({
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
            quantity: t.Integer(),
            unitCost: t.Number(),
            totalCost: t.Number(),
          }),
        ),
      }),
    },
  )
  .post("/:id/receive", async ({ params, body, set }) => {
    set.status = 201;
      return prisma.$transaction(async (tx: any) => {
      const po = await tx.purchaseOrder.update({
        where: { id: params.id },
        data: {
          status: "RECEIVED",
          receivedDate: new Date(),
        },
        include: {
          items: true,
        },
      });

      for (const item of po.items) {
        await tx.product.update({
          where: { id: item.productId },
          data: {
            stockQuantity: {
              increment: item.quantity,
            },
          },
        });

        // Update received quantity in PO item
        await tx.purchaseOrderItem.update({
          where: { id: item.id },
          data: {
            receivedQuantity: item.quantity,
          },
        });
      }

      return po;
    });
  })
  .put(
    "/:id",
    async ({ params, body }) => {
      return prisma.purchaseOrder.update({
        where: { id: params.id },
        data: body,
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
    return prisma.purchaseOrder.delete({
      where: { id: params.id },
    });
  });
