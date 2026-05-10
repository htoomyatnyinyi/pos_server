import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";

export const paymentRoutes = new Elysia({
  prefix: "/payments",
})
  .get("/", async () => {
    return prisma.payment.findMany({
      include: {
        order: true,
      },
      orderBy: {
        processedAt: "desc",
      },
    });
  })
  .get("/:id", async ({ params, set }) => {
    const payment = await prisma.payment.findUnique({
      where: { id: params.id },
      include: {
        order: true,
      },
    });
    if (!payment) { set.status = 404; return "Payment not found"; }return payment;
  })
  .post(
    "/",
    async ({ body, set }) => {
      set.status = 201;
      return prisma.payment.create({
        data: body,
      });
    },
    {
      body: t.Object({
        orderId: t.String(),
        amount: t.Number(),
        method: t.Enum({
          CASH: "CASH",
          KBZ_PAY: "KBZ_PAY",
          CB_PAY: "CB_PAY",
          WAVE_PAY: "WAVE_PAY",
          CARD: "CARD",
          MIXED_PAYMENT: "MIXED_PAYMENT",
        }),
        referenceNumber: t.Optional(t.String()),
        status: t.Optional(t.String()),
        processedBy: t.String(),
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
          method: t.Enum({
            CASH: "CASH",
            KBZ_PAY: "KBZ_PAY",
            CB_PAY: "CB_PAY",
            WAVE_PAY: "WAVE_PAY",
            CARD: "CARD",
            MIXED_PAYMENT: "MIXED_PAYMENT",
          }),
          referenceNumber: t.String(),
          status: t.String(),
        }),
      ),
    },
  )
  .delete("/:id", async ({ params }) => {
    return prisma.payment.delete({
      where: { id: params.id },
    });
  });
