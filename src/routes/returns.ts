import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";

export const returnRoutes = new Elysia({
  prefix: "/returns",
})
  .get("/", async () => {
    return prisma.return.findMany({
      include: {
        order: true,
        customer: true,
        items: {
          include: {
            orderItem: {
              include: {
                product: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });
  })
  .get("/:id", async ({ params, set }) => {
    const returnData = await prisma.return.findUnique({
      where: { id: params.id },
      include: {
        order: true,
        customer: true,
        items: {
          include: {
            orderItem: {
              include: {
                product: true,
              },
            },
          },
        },
      },
    });
    if (!returnData) { set.status = 404; return "Return record not found"; }return returnData;
  })
  .post(
    "/",
    async ({ body, set }) => {
      const returnNumber = `RET-${Date.now()}`;

      set.status = 201;
      return prisma.$transaction(async (tx: any) => {
        const returnRecord = await tx.return.create({
          data: {
            returnNumber,
            orderId: body.orderId,
            customerId: body.customerId,
            totalAmount: body.totalAmount,
            refundMethod: body.refundMethod,
            refundStatus: body.refundStatus || "COMPLETED",
            reason: body.reason,
            approvedBy: body.approvedBy,
            approvedAt: new Date(),
            items: {
              create: body.items.map((item) => ({
                orderItemId: item.orderItemId,
                quantity: item.quantity,
                refundAmount: item.refundAmount,
                reason: item.reason,
              })),
            },
          },
        });

        // Update Order Status if necessary
        await tx.order.update({
          where: { id: body.orderId },
          data: {
            status: "REFUNDED",
          },
        });

        // Increase stock for returned items
        for (const item of body.items) {
          const orderItem = await tx.orderItem.findUnique({
            where: { id: item.orderItemId },
          });

          if (orderItem) {
            await tx.product.update({
              where: { id: orderItem.productId },
              data: {
                stockQuantity: {
                  increment: item.quantity,
                },
              },
            });

            // Mark order item as returned
            await tx.orderItem.update({
              where: { id: item.orderItemId },
              data: {
                isReturned: true,
                returnedQuantity: {
                  increment: item.quantity,
                },
              },
            });
          }
        }

        return returnRecord;
      });
    },
    {
      body: t.Object({
        orderId: t.String(),
        customerId: t.Optional(t.String()),
        totalAmount: t.Number(),
        refundMethod: t.Enum({
          CASH: "CASH",
          KBZ_PAY: "KBZ_PAY",
          CB_PAY: "CB_PAY",
          WAVE_PAY: "WAVE_PAY",
          CARD: "CARD",
          MIXED_PAYMENT: "MIXED_PAYMENT",
        }),
        refundStatus: t.Optional(t.String()),
        reason: t.String(),
        approvedBy: t.String(),
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
    return prisma.return.delete({
      where: { id: params.id },
    });
  });
