import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";
import { requireTenantId } from "../lib/tenant";
import { adjustInventory } from "../lib/inventory";
import { paymentMethodSchema } from "../lib/schemas";

export const returnRoutes = new Elysia({
  prefix: "/returns",
})
  .get("/", async ({ query, set }) => {
    const tenantId = requireTenantId({ query, set });
    if (!tenantId) return { message: "tenantId is required" };

    return prisma.return.findMany({
      where: { tenantId },
      include: {
        order: true,
        customer: true,
        approvedBy: { select: { id: true, name: true } },
        items: {
          include: {
            orderItem: { include: { product: true, variant: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  })
  .get("/:id", async ({ params, set }) => {
    const returnData = await prisma.return.findUnique({
      where: { id: params.id },
      include: {
        order: true,
        customer: true,
        approvedBy: true,
        items: {
          include: {
            orderItem: { include: { product: true, variant: true } },
          },
        },
      },
    });
    if (!returnData) {
      set.status = 404;
      return { message: "Return record not found" };
    }
    return returnData;
  })
  .post(
    "/",
    async ({ body, set }) => {
      const returnNumber = `RET-${Date.now()}`;

      const returnRecord = await prisma.$transaction(async (tx) => {
        const order = await tx.order.findUnique({
          where: { id: body.orderId },
          select: { tenantId: true, storeId: true },
        });

        if (!order?.storeId) {
          throw new Error("Order store is required for stock return");
        }

        const created = await tx.return.create({
          data: {
            returnNumber,
            tenantId: body.tenantId,
            orderId: body.orderId,
            customerId: body.customerId,
            totalAmount: body.totalAmount,
            refundMethod: body.refundMethod,
            refundStatus: body.refundStatus || "COMPLETED",
            reason: body.reason,
            approvedById: body.approvedById,
            approvedAt: new Date(),
            items: {
              create: body.items.map((item) => ({
                tenantId: body.tenantId,
                orderItemId: item.orderItemId,
                quantity: item.quantity,
                refundAmount: item.refundAmount,
                reason: item.reason,
              })),
            },
          },
          include: { items: true },
        });

        await tx.order.update({
          where: { id: body.orderId },
          data: { status: "REFUNDED" },
        });

        for (const item of body.items) {
          const orderItem = await tx.orderItem.findUnique({
            where: { id: item.orderItemId },
          });

          if (orderItem) {
            await adjustInventory(tx, {
              tenantId: body.tenantId,
              storeId: order.storeId,
              productId: orderItem.productId,
              variantId: orderItem.variantId,
              quantityDelta: item.quantity,
              userId: body.approvedById,
              type: "RETURN_IN",
              referenceId: created.id,
              referenceType: "Return",
            });

            await tx.orderItem.update({
              where: { id: item.orderItemId },
              data: {
                isReturned: true,
                returnedQuantity: { increment: item.quantity },
              },
            });
          }
        }

        return created;
      });

      set.status = 201;
      return returnRecord;
    },
    {
      body: t.Object({
        tenantId: t.String(),
        orderId: t.String(),
        customerId: t.Optional(t.String()),
        totalAmount: t.Number(),
        refundMethod: paymentMethodSchema,
        refundStatus: t.Optional(t.String()),
        reason: t.String(),
        approvedById: t.String(),
        items: t.Array(
          t.Object({
            orderItemId: t.String(),
            quantity: t.Integer(),
            refundAmount: t.Number(),
            reason: t.Optional(t.String()),
          }),
        ),
      }),
    },
  )
  .delete("/:id", async ({ params }) => {
    return prisma.return.delete({ where: { id: params.id } });
  });
