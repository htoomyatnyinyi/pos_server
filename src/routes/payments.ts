import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";
import { requireTenantId } from "../lib/tenant";
import { paymentMethodSchema } from "../lib/schemas";

export const paymentRoutes = new Elysia({
  prefix: "/payments",
})
  .get("/", async ({ query, set }) => {
    const tenantId = requireTenantId({ query, set });
    if (!tenantId) return { message: "tenantId is required" };

    return prisma.payment.findMany({
      where: { tenantId },
      include: { order: true, processedBy: { select: { id: true, name: true } } },
      orderBy: { processedAt: "desc" },
    });
  })
  .get("/:id", async ({ params, set }) => {
    const payment = await prisma.payment.findUnique({
      where: { id: params.id },
      include: { order: true, processedBy: true },
    });
    if (!payment) {
      set.status = 404;
      return { message: "Payment not found" };
    }
    return payment;
  })
  .post(
    "/",
    async ({ body, set }) => {
      set.status = 201;
      return prisma.payment.create({
        data: {
          tenantId: body.tenantId,
          orderId: body.orderId,
          amount: body.amount,
          method: body.method,
          referenceNumber: body.referenceNumber,
          status: body.status || "PAID",
          processedById: body.processedById,
        },
      });
    },
    {
      body: t.Object({
        tenantId: t.String(),
        orderId: t.String(),
        amount: t.Number(),
        method: paymentMethodSchema,
        referenceNumber: t.Optional(t.String()),
        status: t.Optional(t.String()),
        processedById: t.String(),
      }),
    },
  )
  .put(
    "/:id",
    async ({ params, body }) => {
      return prisma.payment.update({
        where: { id: params.id },
        data: body,
      });
    },
    {
      body: t.Partial(
        t.Object({
          amount: t.Number(),
          method: paymentMethodSchema,
          referenceNumber: t.Optional(t.String()),
          status: t.Optional(t.String()),
        }),
      ),
    },
  )
  .delete("/:id", async ({ params }) => {
    return prisma.payment.delete({ where: { id: params.id } });
  });
