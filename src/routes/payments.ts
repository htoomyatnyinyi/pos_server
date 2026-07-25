import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";
import { tenantAuthMiddleware } from "../../middlewares/tenantAuthMiddleware";
import { requireRoles } from "../lib/security";

export const paymentRoutes = new Elysia({ prefix: "/payments" })
  .use(tenantAuthMiddleware)

  .get("/", async ({ tenantId }) => {
    const payments = await prisma.payment.findMany({
      where: { tenantId, deletedAt: null },
      include: { order: true, processedBy: { select: { name: true } } },
      orderBy: { processedAt: "desc" },
      take: 100,
    });
    return { success: true, payments };
  })

  .get(
    "/:id",
    async ({ params: { id }, tenantId, set }) => {
      const payment = await prisma.payment.findFirst({
        where: { id, tenantId, deletedAt: null },
        include: { order: true, processedBy: { select: { name: true } } },
      });
      if (!payment) {
        set.status = 404;
        return { success: false, message: "Payment not found." };
      }
      return { success: true, payment };
    },
    { params: t.Object({ id: t.String() }) },
  )

  .post(
    "/",
    async ({ body, tenantId, userId, role, set }) => {
      requireRoles(role, ["ADMIN", "MANAGER", "CASHIER", "SUPER_ADMIN"], set);

      // Validate order
      const order = await prisma.order.findFirst({
        where: { id: body.orderId, tenantId },
      });
      if (!order) {
        set.status = 404;
        return { success: false, message: "Order not found." };
      }

      const payment = await prisma.$transaction(async (tx: any) => {
        const created = await tx.payment.create({
          data: {
            tenantId,
            orderId: body.orderId,
            amount: body.amount,
            method: body.method,
            referenceNumber: body.referenceNumber,
            status: body.status || "PAID",
            processedById: userId,
            processedAt: new Date(),
          },
        });
        await tx.auditLog.create({
          data: {
            tenantId,
            userId,
            action: "CREATE",
            entity: "Payment",
            entityId: created.id,
            newData: JSON.parse(JSON.stringify(created)),
          },
        });
        return created;
      });

      set.status = 201;
      return {
        success: true,
        message: "Payment recorded successfully.",
        payment,
      };
    },
    {
      body: t.Object({
        orderId: t.String(),
        amount: t.Number(),
        method: t.String(),
        referenceNumber: t.Optional(t.String()),
        status: t.Optional(t.String()),
      }),
    },
  )

  .put(
    "/:id",
    async ({ params: { id }, body, tenantId, userId, role, set }) => {
      requireRoles(role, ["ADMIN", "MANAGER", "SUPER_ADMIN"], set);

      const current = await prisma.payment.findFirst({
        where: { id, tenantId, deletedAt: null },
      });
      if (!current) {
        set.status = 404;
        return { success: false, message: "Payment not found." };
      }

      const updated = await prisma.payment.update({
        where: { id },
        data: {
          amount: body.amount,
          method: body.method,
          referenceNumber: body.referenceNumber,
          status: body.status,
        },
      });

      await prisma.auditLog.create({
        data: {
          tenantId,
          userId,
          action: "UPDATE",
          entity: "Payment",
          entityId: id,
          oldData: JSON.parse(JSON.stringify(current)),
          newData: JSON.parse(JSON.stringify(updated)),
        },
      });

      return {
        success: true,
        message: "Payment updated successfully.",
        payment: updated,
      };
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Partial(
        t.Object({
          amount: t.Optional(t.Number()),
          method: t.Optional(t.String()),
          referenceNumber: t.Optional(t.String()),
          status: t.Optional(t.String()),
        }),
      ),
    },
  )

  .delete(
    "/:id",
    async ({ params: { id }, tenantId, userId, role, set }) => {
      requireRoles(role, ["ADMIN", "SUPER_ADMIN"], set);

      const payment = await prisma.payment.findFirst({
        where: { id, tenantId, deletedAt: null },
      });
      if (!payment) {
        set.status = 404;
        return { success: false, message: "Payment not found." };
      }

      await prisma.$transaction(async (tx: any) => {
        const deleted = await tx.payment.update({
          where: { id },
          data: { deletedAt: new Date() },
        });
        await tx.auditLog.create({
          data: {
            tenantId,
            userId,
            action: "DELETE",
            entity: "Payment",
            entityId: id,
            oldData: JSON.parse(JSON.stringify(payment)),
            newData: JSON.parse(JSON.stringify(deleted)),
          },
        });
      });

      return { success: true, message: "Payment deleted successfully." };
    },
    { params: t.Object({ id: t.String() }) },
  );
