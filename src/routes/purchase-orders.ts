import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";
import { tenantAuthMiddleware } from "../../middlewares/tenantAuthMiddleware";
import { adjustInventory } from "../lib/inventory";
import { PurchaseOrderStatus } from "@prisma/client";
import { validateStore, requireRoles } from "../lib/security";

export const purchaseOrderRoutes = new Elysia({ prefix: "/purchase-orders" })
  .use(tenantAuthMiddleware)

  .get(
    "/",
    async ({ tenantId, query }) => {
      const page = query.page ? parseInt(query.page as string) : 1;
      const limit = query.limit ? parseInt(query.limit as string) : 20;
      const skip = (page - 1) * limit;
      const whereCondition: any = {
        tenantId,
        ...(query.supplierId ? { supplierId: query.supplierId as string } : {}),
        ...(query.status
          ? { status: query.status as PurchaseOrderStatus }
          : {}),
      };
      const [total, purchaseOrders] = await prisma.$transaction([
        prisma.purchaseOrder.count({ where: whereCondition }),
        prisma.purchaseOrder.findMany({
          where: whereCondition,
          include: {
            supplier: true,
            createdBy: { select: { id: true, name: true } },
            items: { include: { product: true, variant: true } },
          },
          orderBy: { createdAt: "desc" },
          skip,
          take: limit,
        }),
      ]);
      return {
        success: true,
        meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
        purchaseOrders,
      };
    },
    {
      query: t.Optional(
        t.Object({
          page: t.Optional(t.String()),
          limit: t.Optional(t.String()),
          supplierId: t.Optional(t.String()),
          status: t.Optional(t.String()),
        }),
      ),
    },
  )

  .get(
    "/:id",
    async ({ params: { id }, tenantId, set }) => {
      const po = await prisma.purchaseOrder.findFirst({
        where: { id, tenantId },
        include: {
          supplier: true,
          createdBy: { select: { id: true, name: true, email: true } },
          items: { include: { product: true, variant: true } },
        },
      });
      if (!po) {
        set.status = 404;
        return { success: false, message: "Purchase Order not found." };
      }
      return { success: true, po };
    },
    { params: t.Object({ id: t.String() }) },
  )

  .post(
    "/",
    async ({ body, tenantId, userId, role, set }) => {
      requireRoles(role, ["ADMIN", "MANAGER", "SUPER_ADMIN"], set);

      const poNumber = `PO-${Date.now()}`;
      const po = await prisma.$transaction(async (tx) => {
        const created = await tx.purchaseOrder.create({
          data: {
            tenantId,
            poNumber,
            supplierId: body.supplierId,
            status:
              (body.status as PurchaseOrderStatus) || PurchaseOrderStatus.DRAFT,
            orderDate: body.orderDate ? new Date(body.orderDate) : new Date(),
            expectedDate: body.expectedDate
              ? new Date(body.expectedDate)
              : null,
            subTotal: body.subTotal,
            taxAmount: body.taxAmount || 0,
            grandTotal: body.grandTotal,
            createdById: userId,
            notes: body.notes,
            items: {
              create: body.items.map((item) => ({
                tenantId,
                productId: item.productId,
                variantId: item.variantId ?? null,
                quantity: item.quantity,
                unitCost: item.unitCost,
                totalCost: item.totalCost,
              })),
            },
          },
          include: { items: true },
        });
        await tx.auditLog.create({
          data: {
            tenantId,
            userId,
            action: "CREATE",
            entity: "PurchaseOrder",
            entityId: created.id,
            newData: JSON.parse(JSON.stringify(created)),
          },
        });
        return created;
      });

      set.status = 201;
      return {
        success: true,
        message: "Purchase Order created successfully.",
        po,
      };
    },
    {
      body: t.Object({
        supplierId: t.String(),
        status: t.Optional(t.String()),
        orderDate: t.Optional(t.String()),
        expectedDate: t.Optional(t.String()),
        subTotal: t.Number(),
        taxAmount: t.Optional(t.Number()),
        grandTotal: t.Number(),
        notes: t.Optional(t.String()),
        items: t.Array(
          t.Object({
            productId: t.String(),
            variantId: t.Optional(t.String()),
            quantity: t.Integer(),
            unitCost: t.Number(),
            totalCost: t.Number(),
          }),
        ),
      }),
    },
  )

  .post(
    "/:id/receive",
    async ({ params: { id }, body, tenantId, userId, role, set }) => {
      requireRoles(role, ["ADMIN", "MANAGER", "SUPER_ADMIN"], set);
      await validateStore(body.storeId, tenantId);

      const existingPo = await prisma.purchaseOrder.findFirst({
        where: { id, tenantId },
        include: { items: true },
      });
      if (!existingPo) {
        set.status = 404;
        return {
          success: false,
          message: "Purchase Order not found or access denied.",
        };
      }
      if (existingPo.status === PurchaseOrderStatus.RECEIVED) {
        set.status = 400;
        return {
          success: false,
          message: "This Purchase Order has already been fully received.",
        };
      }

      const po = await prisma.$transaction(async (tx: any) => {
        const updated = await tx.purchaseOrder.update({
          where: { id },
          data: {
            status: PurchaseOrderStatus.RECEIVED,
            receivedDate: new Date(),
          },
          include: { items: true },
        });

        for (const item of updated.items) {
          await adjustInventory(tx, {
            tenantId,
            storeId: body.storeId,
            productId: item.productId,
            variantId: item.variantId ?? null,
            quantityDelta: item.quantity,
            userId,
            type: "PURCHASE",
            referenceId: updated.id,
            referenceType: "PurchaseOrder",
            reason: `Received PO Goods - PO No: ${updated.poNumber}`,
          });
          await tx.purchaseOrderItem.update({
            where: { id: item.id },
            data: { receivedQuantity: item.quantity },
          });
        }

        await tx.auditLog.create({
          data: {
            tenantId,
            userId,
            action: "APPROVE",
            entity: "PurchaseOrder",
            entityId: updated.id,
            oldData: JSON.parse(JSON.stringify(existingPo)),
            newData: JSON.parse(JSON.stringify(updated)),
          },
        });

        return updated;
      });

      return {
        success: true,
        message: "Stocks successfully received and sync'd to warehouse.",
        po,
      };
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({ storeId: t.String() }),
    },
  )

  .put(
    "/:id",
    async ({ params: { id }, body, tenantId, userId, role, set }) => {
      requireRoles(role, ["ADMIN", "MANAGER", "SUPER_ADMIN"], set);

      const currentPo = await prisma.purchaseOrder.findFirst({
        where: { id, tenantId },
      });
      if (!currentPo) {
        set.status = 404;
        return { success: false, message: "Purchase Order not found." };
      }
      if (currentPo.status === PurchaseOrderStatus.RECEIVED) {
        set.status = 400;
        return {
          success: false,
          message: "Cannot edit a completed/received purchase order.",
        };
      }

      const updatedPo = await prisma.purchaseOrder.update({
        where: { id },
        data: {
          status: body.status
            ? (body.status as PurchaseOrderStatus)
            : undefined,
          expectedDate: body.expectedDate
            ? new Date(body.expectedDate)
            : undefined,
          notes: body.notes,
          subTotal: body.subTotal,
          taxAmount: body.taxAmount,
          grandTotal: body.grandTotal,
        },
      });

      await prisma.auditLog.create({
        data: {
          tenantId,
          userId,
          action: "UPDATE",
          entity: "PurchaseOrder",
          entityId: id,
          oldData: JSON.parse(JSON.stringify(currentPo)),
          newData: JSON.parse(JSON.stringify(updatedPo)),
        },
      });

      return {
        success: true,
        message: "Purchase Order updated successfully.",
        po: updatedPo,
      };
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Partial(
        t.Object({
          status: t.Optional(t.String()),
          expectedDate: t.Optional(t.String()),
          notes: t.Optional(t.String()),
          subTotal: t.Optional(t.Number()),
          taxAmount: t.Optional(t.Number()),
          grandTotal: t.Optional(t.Number()),
        }),
      ),
    },
  )

  .delete(
    "/:id",
    async ({ params: { id }, tenantId, userId, role, set }) => {
      requireRoles(role, ["ADMIN", "MANAGER", "SUPER_ADMIN"], set);

      const po = await prisma.purchaseOrder.findFirst({
        where: { id, tenantId },
      });
      if (!po) {
        set.status = 404;
        return { success: false, message: "Purchase Order not found." };
      }
      if (po.status === PurchaseOrderStatus.RECEIVED) {
        set.status = 400;
        return {
          success: false,
          message: "Cannot delete a stock-received purchase order.",
        };
      }

      await prisma.$transaction(async (tx: any) => {
        await tx.purchaseOrderItem.deleteMany({ where: { poId: id } });
        await tx.purchaseOrder.delete({ where: { id } });
        await tx.auditLog.create({
          data: {
            tenantId,
            userId,
            action: "DELETE",
            entity: "PurchaseOrder",
            entityId: id,
            oldData: JSON.parse(JSON.stringify(po)),
          },
        });
      });

      return {
        success: true,
        message: "Purchase Order has been permanently deleted.",
      };
    },
    { params: t.Object({ id: t.String() }) },
  );
