import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";
import { requireTenantId } from "../lib/tenant";
import { giftCardStatusSchema } from "../lib/schemas";

export const giftCardRoutes = new Elysia({
  prefix: "/gift-cards",
})
  .get("/", async ({ query, set }) => {
    const tenantId = requireTenantId({ query, set });
    if (!tenantId) return { message: "tenantId is required" };

    return prisma.giftCard.findMany({
      where: {
        tenantId,
        ...(query.status ? { status: query.status as any } : {}),
        ...(query.customerId ? { customerId: query.customerId } : {}),
      },
      include: {
        customer: { select: { id: true, name: true, code: true } },
        transactions: { take: 5, orderBy: { createdAt: "desc" } },
      },
      orderBy: { createdAt: "desc" },
    });
  })
  .get("/lookup/:cardNumber", async ({ params, query, set }) => {
    const tenantId = requireTenantId({ query, set });
    if (!tenantId) return { message: "tenantId is required" };

    const giftCard = await prisma.giftCard.findFirst({
      where: { tenantId, cardNumber: params.cardNumber },
      include: {
        customer: true,
        transactions: { orderBy: { createdAt: "desc" } },
      },
    });
    if (!giftCard) {
      set.status = 404;
      return { message: "Gift card not found" };
    }
    return giftCard;
  })
  .post(
    "/",
    async ({ body, set }) => {
      set.status = 201;
      return prisma.$transaction(async (tx) => {
        const giftCard = await tx.giftCard.create({
          data: {
            tenantId: body.tenantId,
            customerId: body.customerId,
            cardNumber: body.cardNumber || `GC-${Date.now()}`,
            pinCode: body.pinCode,
            initialAmount: body.initialAmount,
            currentBalance: body.initialAmount,
            expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
            status: "ACTIVE",
          },
        });

        await tx.giftCardTransaction.create({
          data: {
            tenantId: body.tenantId,
            giftCardId: giftCard.id,
            amount: body.initialAmount,
            type: "ISSUE",
          },
        });

        return giftCard;
      });
    },
    {
      body: t.Object({
        tenantId: t.String(),
        initialAmount: t.Number(),
        cardNumber: t.Optional(t.String()),
        pinCode: t.Optional(t.String()),
        customerId: t.Optional(t.String()),
        expiresAt: t.Optional(t.String()),
      }),
    },
  )
  .post(
    "/:id/reload",
    async ({ params, body, set }) => {
      const giftCard = await prisma.$transaction(async (tx) => {
        const updated = await tx.giftCard.update({
          where: { id: params.id },
          data: {
            currentBalance: { increment: body.amount },
            status: "ACTIVE",
          },
        });

        await tx.giftCardTransaction.create({
          data: {
            tenantId: updated.tenantId,
            giftCardId: updated.id,
            amount: body.amount,
            type: "RELOAD",
          },
        });

        return updated;
      });

      set.status = 201;
      return giftCard;
    },
    {
      body: t.Object({ amount: t.Number() }),
    },
  )
  .patch(
    "/:id/status",
    async ({ params, body }) => {
      return prisma.giftCard.update({
        where: { id: params.id },
        data: { status: body.status },
      });
    },
    {
      body: t.Object({ status: giftCardStatusSchema }),
    },
  );
