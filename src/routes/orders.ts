import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";

export const orderRoutes = new Elysia({
  prefix: "/orders",
})
  .get("/", async () => {
    return prisma.order.findMany({
      include: {
        items: {
          include: {
            product: true,
          },
        },
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        customer: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });
  })
  .get("/:id", async ({ params, set }) => {
    const order = await prisma.order.findUnique({
      where: { id: params.id },
      include: {
        items: {
          include: {
            product: true,
          },
        },
        user: true,
        customer: true,
      },
    });
    if (!order) { set.status = 404; return "Order not found"; }return order;
  })
  .post(
    "/",
    async ({ body, set }) => {
      if (!body.userId) {
        { set.status = 400; return "userId is required"; }
      }

      // Generate order number (simple version)
      const orderNumber = `ORD-${Date.now()}`;

      return prisma.$transaction(async (tx) => {
        const order = await tx.order.create({
          data: {
            orderNumber,
            subTotal: body.subTotal,
            taxAmount: body.taxAmount || 0,
            discountAmount: body.discountAmount || 0,
            grandTotal: body.grandTotal,
            paymentMethod: body.paymentMethod,
            paidAmount: body.paidAmount,
            changeAmount: body.changeAmount,
            paymentStatus: body.paymentStatus || "PAID",
            status: "COMPLETED",
            userId: body.userId,
            customerId: body.customerId,
            items: {
              create: body.items.map((item) => ({
                productId: item.productId,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                discountAmount: item.discountAmount || 0,
                subTotal: item.subTotal,
              })),
            },
          },
          include: {
            items: true,
          },
        });

        // Decrease stock
        for (const item of body.items) {
          await tx.product.update({
            where: { id: item.productId },
            data: {
              stockQuantity: {
                decrement: item.quantity,
              },
            },
          });
        }

        set.status = 201;
        return order;
      });
    },
    {
      body: t.Object({
        subTotal: t.Number(),
        taxAmount: t.Optional(t.Number()),
        discountAmount: t.Optional(t.Number()),
        grandTotal: t.Number(),
        paymentMethod: t.Enum({
          CASH: "CASH",
          KBZ_PAY: "KBZ_PAY",
          CB_PAY: "CB_PAY",
          WAVE_PAY: "WAVE_PAY",
          CARD: "CARD",
          MIXED_PAYMENT: "MIXED_PAYMENT",
        }),
        paidAmount: t.Number(),
        changeAmount: t.Number(),
        paymentStatus: t.Optional(t.String()),
        userId: t.String(),
        customerId: t.Optional(t.String()),
        items: t.Array(
          t.Object({
            productId: t.String(),
            quantity: t.Number(),
            unitPrice: t.Number(),
            discountAmount: t.Optional(t.Number()),
            subTotal: t.Number(),
          }),
        ),
      }),
    },
  )
  .patch(
    "/:id/status",
    async ({ params, body }) => {
      return prisma.order.update({
        where: { id: params.id },
        data: {
          status: body.status,
        },
      });
    },
    {
      body: t.Object({
        status: t.Enum({
          PENDING: "PENDING",
          COMPLETED: "COMPLETED",
          CANCELLED: "CANCELLED",
          VOIDED: "VOIDED",
          REFUNDED: "REFUNDED",
          PARTIALLY_REFUNDED: "PARTIALLY_REFUNDED",
          HOLD: "HOLD",
        }),
      }),
    },
  )
  .delete("/:id", async ({ params }) => {
    return prisma.order.delete({
      where: { id: params.id },
    });
  });
