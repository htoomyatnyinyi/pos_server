import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";
import { requireTenantId } from "../lib/tenant";
import { adjustInventory } from "../lib/inventory";
import { orderStatusSchema, paymentMethodSchema } from "../lib/schemas";

export const orderRoutes = new Elysia({
  prefix: "/orders",
})
  .get("/", async ({ query, set }) => {
    const tenantId = requireTenantId({ query, set });
    if (!tenantId) return { message: "tenantId is required" };

    return prisma.order.findMany({
      where: {
        tenantId,
        ...(query.storeId ? { storeId: query.storeId } : {}),
      },
      include: {
        items: { include: { product: true, variant: true } },
        user: { select: { id: true, name: true, email: true } },
        customer: true,
        payments: true,
      },
      orderBy: { createdAt: "desc" },
    });
  })
  .get("/:id", async ({ params, set }) => {
    const order = await prisma.order.findUnique({
      where: { id: params.id },
      include: {
        items: { include: { product: true, variant: true } },
        user: true,
        customer: true,
        payments: true,
      },
    });
    if (!order) {
      set.status = 404;
      return { message: "Order not found" };
    }
    return order;
  })
  .post(
    "/",
    async ({ body, set }) => {
      if (!body.userId) {
        set.status = 400;
        return { message: "userId is required" };
      }
      if (!body.storeId) {
        set.status = 400;
        return { message: "storeId is required" };
      }

      const orderNumber = `ORD-${Date.now()}`;

      const order = await prisma.$transaction(async (tx) => {
        const created = await tx.order.create({
          data: {
            tenantId: body.tenantId,
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
            sessionId: body.sessionId,
            storeId: body.storeId,
            registerId: body.registerId,
            completedAt: new Date(),
            items: {
              create: body.items.map((item) => ({
                productId: item.productId,
                variantId: item.variantId,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                discountAmount: item.discountAmount || 0,
                subTotal: item.subTotal,
              })),
            },
          },
          include: { items: true },
        });

        for (const item of body.items) {
          await adjustInventory(tx, {
            tenantId: body.tenantId,
            storeId: body.storeId!,
            productId: item.productId,
            variantId: item.variantId,
            quantityDelta: -item.quantity,
            userId: body.userId,
            type: "SALE",
            referenceId: created.id,
            referenceType: "Order",
          });
        }

        return created;
      });

      set.status = 201;
      return order;
    },
    {
      body: t.Object({
        tenantId: t.String(),
        subTotal: t.Number(),
        taxAmount: t.Optional(t.Number()),
        discountAmount: t.Optional(t.Number()),
        grandTotal: t.Number(),
        paymentMethod: paymentMethodSchema,
        paidAmount: t.Number(),
        changeAmount: t.Number(),
        paymentStatus: t.Optional(t.String()),
        userId: t.String({ minLength: 1 }),
        customerId: t.Optional(t.String()),
        sessionId: t.Optional(t.String()),
        storeId: t.String(),
        registerId: t.Optional(t.String()),
        items: t.Array(
          t.Object({
            productId: t.String(),
            variantId: t.Optional(t.String()),
            quantity: t.Integer(),
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
        data: { status: body.status },
      });
    },
    {
      body: t.Object({ status: orderStatusSchema }),
    },
  )
  .delete("/:id", async ({ params }) => {
    return prisma.order.delete({ where: { id: params.id } });
  });
