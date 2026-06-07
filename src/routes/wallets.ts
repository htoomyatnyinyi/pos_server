import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";
import { requireTenantId } from "../lib/tenant";
import { walletTransactionTypeSchema } from "../lib/schemas";

export const walletRoutes = new Elysia({
  prefix: "/wallets",
})
  .get("/", async ({ query, set }) => {
    const tenantId = requireTenantId({ query, set });
    if (!tenantId) return { message: "tenantId is required" };

    return prisma.customerWallet.findMany({
      where: { tenantId },
      include: {
        customer: { select: { id: true, name: true, code: true, phone: true } },
      },
      orderBy: { updatedAt: "desc" },
    });
  })
  .get("/customer/:customerId", async ({ params, query, set }) => {
    const tenantId = requireTenantId({ query, set });
    if (!tenantId) return { message: "tenantId is required" };

    let wallet = await prisma.customerWallet.findFirst({
      where: { tenantId, customerId: params.customerId },
      include: {
        transactions: { orderBy: { createdAt: "desc" }, take: 50 },
        customer: true,
      },
    });

    if (!wallet) {
      wallet = await prisma.customerWallet.create({
        data: { tenantId, customerId: params.customerId },
        include: {
          transactions: true,
          customer: true,
        },
      });
    }

    return wallet;
  })
  .post(
    "/transactions",
    async ({ body, set }) => {
      const wallet = await prisma.$transaction(async (tx) => {
        let customerWallet = await tx.customerWallet.findUnique({
          where: { customerId: body.customerId },
        });

        if (!customerWallet) {
          customerWallet = await tx.customerWallet.create({
            data: { tenantId: body.tenantId, customerId: body.customerId },
          });
        }

        const delta =
          body.type === "DEPOSIT" || body.type === "REFUND"
            ? body.amount
            : -body.amount;

        const updated = await tx.customerWallet.update({
          where: { id: customerWallet.id },
          data: { balance: { increment: delta } },
        });

        await tx.walletTransaction.create({
          data: {
            tenantId: body.tenantId,
            walletId: updated.id,
            amount: body.amount,
            type: body.type,
            referenceId: body.referenceId,
            description: body.description,
          },
        });

        return updated;
      });

      set.status = 201;
      return wallet;
    },
    {
      body: t.Object({
        tenantId: t.String(),
        customerId: t.String(),
        amount: t.Number(),
        type: walletTransactionTypeSchema,
        referenceId: t.Optional(t.String()),
        description: t.Optional(t.String()),
      }),
    },
  );
