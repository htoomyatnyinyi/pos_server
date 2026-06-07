import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";
import { requireTenantId } from "../lib/tenant";
import { paymentMethodSchema } from "../lib/schemas";

export const supplierPaymentRoutes = new Elysia({
  prefix: "/supplier-payments",
})
  .get("/", async ({ query, set }) => {
    const tenantId = requireTenantId({ query, set });
    if (!tenantId) return { message: "tenantId is required" };

    return prisma.supplierPayment.findMany({
      where: {
        tenantId,
        ...(query.supplierId ? { supplierId: query.supplierId } : {}),
      },
      include: { supplier: { select: { id: true, name: true, code: true } } },
      orderBy: { paidAt: "desc" },
    });
  })
  .get("/:id", async ({ params, set }) => {
    const payment = await prisma.supplierPayment.findUnique({
      where: { id: params.id },
      include: { supplier: true },
    });
    if (!payment) {
      set.status = 404;
      return { message: "Supplier payment not found" };
    }
    return payment;
  })
  .post(
    "/",
    async ({ body, set }) => {
      set.status = 201;
      return prisma.$transaction(async (tx) => {
        const payment = await tx.supplierPayment.create({
          data: {
            tenantId: body.tenantId,
            supplierId: body.supplierId,
            amount: body.amount,
            paymentMethod: body.paymentMethod,
            referenceNumber: body.referenceNumber,
            note: body.note,
          },
        });

        await tx.supplier.update({
          where: { id: body.supplierId },
          data: { currentBalance: { decrement: body.amount } },
        });

        return payment;
      });
    },
    {
      body: t.Object({
        tenantId: t.String(),
        supplierId: t.String(),
        amount: t.Number(),
        paymentMethod: paymentMethodSchema,
        referenceNumber: t.Optional(t.String()),
        note: t.Optional(t.String()),
      }),
    },
  );
