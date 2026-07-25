import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";
import { tenantAuthMiddleware } from "../../middlewares/tenantAuthMiddleware";
import { requireRoles } from "../lib/security";

export const supplierPaymentRoutes = new Elysia({
  prefix: "/supplier-payments",
})
  .use(tenantAuthMiddleware)

  .get(
    "/",
    async ({ tenantId, query }) => {
      const page = query.page ? parseInt(query.page as string) : 1;
      const limit = query.limit ? parseInt(query.limit as string) : 20;
      const skip = (page - 1) * limit;

      const whereCondition: any = { tenantId };
      if (query.supplierId) whereCondition.supplierId = query.supplierId;
      if (query.paymentMethod)
        whereCondition.paymentMethod = query.paymentMethod;

      const [total, payments] = await prisma.$transaction([
        prisma.supplierPayment.count({ where: whereCondition }),
        prisma.supplierPayment.findMany({
          where: whereCondition,
          include: {
            supplier: { select: { id: true, name: true, code: true } },
          },
          orderBy: { paidAt: "desc" },
          skip,
          take: limit,
        }),
      ]);

      return {
        success: true,
        meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
        payments,
      };
    },
    {
      query: t.Optional(
        t.Object({
          page: t.Optional(t.String()),
          limit: t.Optional(t.String()),
          supplierId: t.Optional(t.String()),
          paymentMethod: t.Optional(t.String()),
        }),
      ),
    },
  )

  .get(
    "/:id",
    async ({ params: { id }, tenantId, set }) => {
      const payment = await prisma.supplierPayment.findFirst({
        where: { id, tenantId },
        include: { supplier: true },
      });
      if (!payment) {
        set.status = 404;
        return { success: false, message: "Supplier payment not found." };
      }
      return { success: true, payment };
    },
    { params: t.Object({ id: t.String() }) },
  )

  .post(
    "/",
    async ({ body, tenantId, userId, role, set }) => {
      requireRoles(role, ["ADMIN", "MANAGER", "SUPER_ADMIN"], set);

      // Validate supplier
      const supplier = await prisma.supplier.findFirst({
        where: { id: body.supplierId, tenantId, deletedAt: null },
      });
      if (!supplier) {
        set.status = 400;
        return { success: false, message: "Supplier not found." };
      }

      const payment = await prisma.$transaction(async (tx: any) => {
        const created = await tx.supplierPayment.create({
          data: {
            tenantId,
            supplierId: body.supplierId,
            amount: body.amount,
            paymentMethod: body.paymentMethod,
            referenceNumber: body.referenceNumber,
            note: body.note,
            paidAt: new Date(),
          },
        });

        await tx.supplier.update({
          where: { id: body.supplierId },
          data: { currentBalance: { decrement: body.amount } },
        });

        await tx.auditLog.create({
          data: {
            tenantId,
            userId,
            action: "CREATE",
            entity: "SupplierPayment",
            entityId: created.id,
            newData: JSON.parse(JSON.stringify(created)),
          },
        });

        return created;
      });

      set.status = 201;
      return {
        success: true,
        message: "Supplier payment recorded successfully.",
        payment,
      };
    },
    {
      body: t.Object({
        supplierId: t.String({ minLength: 1 }),
        amount: t.Number({ minimum: 0.01 }),
        paymentMethod: t.String(),
        referenceNumber: t.Optional(t.String()),
        note: t.Optional(t.String()),
      }),
    },
  );
