import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";
import { tenantAuthMiddleware } from "../../middlewares/tenantAuthMiddleware";
import { adjustInventory } from "../lib/inventory";
import { PaymentMethod, RefundStatus } from "@prisma/client";
import { validateStore, requireRoles } from "../lib/security";

export const returnRoutes = new Elysia({ prefix: "/returns" })
  .use(tenantAuthMiddleware)

  .get(
    "/",
    async ({ tenantId, query }) => {
      const page = query.page ? parseInt(query.page as string) : 1;
      const limit = query.limit ? parseInt(query.limit as string) : 20;
      const skip = (page - 1) * limit;
      const whereCondition: any = {
        tenantId,
        ...(query.orderId ? { orderId: query.orderId as string } : {}),
        ...(query.refundStatus
          ? { refundStatus: query.refundStatus as RefundStatus }
          : {}),
      };
      const [total, returns] = await prisma.$transaction([
        prisma.return.count({ where: whereCondition }),
        prisma.return.findMany({
          where: whereCondition,
          include: {
            order: true,
            customer: true,
            approvedBy: { select: { id: true, name: true } },
            items: {
              include: {
                orderItem: { include: { product: true, variant: true } },
              },
            },
          },
          orderBy: { createdAt: "desc" },
          skip,
          take: limit,
        }),
      ]);
      return {
        success: true,
        meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
        returns,
      };
    },
    {
      query: t.Optional(
        t.Object({
          page: t.Optional(t.String()),
          limit: t.Optional(t.String()),
          orderId: t.Optional(t.String()),
          refundStatus: t.Optional(t.String()),
        }),
      ),
    },
  )

  .get(
    "/:id",
    async ({ params: { id }, tenantId, set }) => {
      const returnData = await prisma.return.findFirst({
        where: { id, tenantId },
        include: {
          order: true,
          customer: true,
          approvedBy: { select: { id: true, name: true, email: true } },
          items: {
            include: {
              orderItem: { include: { product: true, variant: true } },
            },
          },
        },
      });
      if (!returnData) {
        set.status = 404;
        return {
          success: false,
          message: "Sales return record not found or access denied.",
        };
      }
      return { success: true, returnData };
    },
    { params: t.Object({ id: t.String() }) },
  )

  .post(
    "/",
    async ({ body, tenantId, userId, role, set }) => {
      requireRoles(role, ["ADMIN", "MANAGER", "SUPER_ADMIN"], set);

      // Validate order
      const order = await prisma.order.findFirst({
        where: { id: body.orderId, tenantId },
        include: { items: true },
      });
      if (!order) {
        set.status = 404;
        return { success: false, message: "Order not found." };
      }
      if (!order.storeId) {
        set.status = 400;
        return { success: false, message: "Order has no store associated." };
      }
      await validateStore(order.storeId, tenantId);

      // Validate return items against order items
      for (const item of body.items) {
        const orderItem = order.items.find(
          (i: any) => i.id === item.orderItemId,
        );
        if (!orderItem) {
          set.status = 400;
          return {
            success: false,
            message: `Order item ${item.orderItemId} not found.`,
          };
        }
        const available = orderItem.quantity - orderItem.returnedQuantity;
        if (item.quantity > available) {
          set.status = 400;
          return {
            success: false,
            message: `Return quantity for item ${orderItem.productId} exceeds available quantity (${available}).`,
          };
        }
      }

      const returnNumber = `RET-${Date.now()}`;
      const returnRecord = await prisma.$transaction(async (tx: any) => {
        const createdReturn = await tx.return.create({
          data: {
            returnNumber,
            tenantId,
            orderId: body.orderId,
            customerId: body.customerId ?? null,
            totalAmount: body.totalAmount,
            refundMethod: body.refundMethod as PaymentMethod,
            refundStatus:
              (body.refundStatus as RefundStatus) || RefundStatus.COMPLETED,
            reason: body.reason.trim(),
            approvedById: userId,
            approvedAt: new Date(),
            items: {
              create: body.items.map((item) => ({
                tenantId,
                orderItemId: item.orderItemId,
                quantity: item.quantity,
                refundAmount: item.refundAmount,
                reason: item.reason ? item.reason.trim() : null,
              })),
            },
          },
          include: { items: true },
        });

        // Update order status
        await tx.order.update({
          where: { id: body.orderId },
          data: { status: "REFUNDED" },
        });

        // Restock inventory
        for (const item of body.items) {
          const orderItem = order.items.find(
            (i: any) => i.id === item.orderItemId,
          )!;
          await adjustInventory(tx, {
            tenantId,
            storeId: order.storeId!,
            productId: orderItem.productId,
            variantId: orderItem.variantId ?? null,
            quantityDelta: item.quantity,
            userId,
            type: "RETURN_IN",
            referenceId: createdReturn.id,
            referenceType: "Return",
            reason: `Sales Return Received: Ticket #${returnNumber}`,
          });
          await tx.orderItem.update({
            where: { id: item.orderItemId },
            data: {
              isReturned: true,
              returnedQuantity: { increment: item.quantity },
            },
          });
        }

        await tx.auditLog.create({
          data: {
            tenantId,
            userId,
            action: "CREATE",
            entity: "Return",
            entityId: createdReturn.id,
            newData: JSON.parse(JSON.stringify(createdReturn)),
          },
        });

        return createdReturn;
      });

      set.status = 201;
      return {
        success: true,
        message: "Sales return successfully processed and inventory restocked.",
        returnRecord,
      };
    },
    {
      body: t.Object({
        orderId: t.String({ minLength: 1 }),
        customerId: t.Optional(t.String()),
        totalAmount: t.Number({ minimum: 0 }),
        refundMethod: t.String(),
        refundStatus: t.Optional(t.String()),
        reason: t.String({ minLength: 2 }),
        items: t.Array(
          t.Object({
            orderItemId: t.String({ minLength: 1 }),
            quantity: t.Integer({ minimum: 1 }),
            refundAmount: t.Number({ minimum: 0 }),
            reason: t.Optional(t.String()),
          }),
        ),
      }),
    },
  )

  .delete(
    "/:id",
    async ({ params: { id }, tenantId, userId, set }) => {
      const returnData = await prisma.return.findFirst({
        where: { id, tenantId },
        select: { refundStatus: true },
      });
      if (!returnData) {
        set.status = 404;
        return { success: false, message: "Return not found." };
      }
      if (returnData.refundStatus !== "PENDING") {
        set.status = 400;
        return { success: false, message: "Cannot delete completed return." };
      }
      await prisma.return.delete({ where: { id } });
      return { success: true, message: "Return deleted successfully." };
    },
    { params: t.Object({ id: t.String() }) },
  );
