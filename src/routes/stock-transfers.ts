import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";
import { tenantAuthMiddleware } from "../../middlewares/tenantAuthMiddleware";
import { adjustInventory } from "../lib/inventory";
import { TransferStatus } from "@prisma/client";

export const stockTransferRoutes = new Elysia({
  prefix: "/stock-transfers",
})
  // 🔐 Multi-Tenant Authentication Middleware ချိတ်ဆက်ခြင်း
  .use(tenantAuthMiddleware)

  /**
   * 1. GET ALL STOCK TRANSFERS WITH TENANT ISOLATION
   */
  .get(
    "/",
    async ({ tenantId, query }) => {
      const page = query.page ? parseInt(query.page as string) : 1;
      const limit = query.limit ? parseInt(query.limit as string) : 20;
      const skip = (page - 1) * limit;

      const whereCondition: any = {
        tenantId,
        ...(query.fromStoreId
          ? { fromStoreId: query.fromStoreId as string }
          : {}),
        ...(query.toStoreId ? { toStoreId: query.toStoreId as string } : {}),
        ...(query.status ? { status: query.status as TransferStatus } : {}),
      };

      const [total, stockTransfers] = await prisma.$transaction([
        prisma.stockTransfer.count({ where: whereCondition }),
        prisma.stockTransfer.findMany({
          where: whereCondition,
          include: {
            fromStore: true,
            toStore: true,
            requestedBy: { select: { id: true, name: true } },
            approvedBy: { select: { id: true, name: true } },
            items: { include: { product: true, variant: true } },
          },
          orderBy: { requestedAt: "desc" },
          skip,
          take: limit,
        }),
      ]);

      return {
        success: true,
        meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
        stockTransfers,
      };
    },
    {
      query: t.Optional(
        t.Object({
          page: t.Optional(t.String()),
          limit: t.Optional(t.String()),
          fromStoreId: t.Optional(t.String()),
          toStoreId: t.Optional(t.String()),
          status: t.Optional(t.String()),
        }),
      ),
    },
  )

  /**
   * 2. GET SINGLE STOCK TRANSFER BY ID
   */
  .get(
    "/:id",
    async ({ params: { id }, tenantId, set }) => {
      const transfer = await prisma.stockTransfer.findFirst({
        where: { id, tenantId },
        include: {
          fromStore: true,
          toStore: true,
          requestedBy: { select: { id: true, name: true, email: true } },
          approvedBy: { select: { id: true, name: true } },
          items: { include: { product: true, variant: true } },
        },
      });

      if (!transfer) {
        set.status = 404;
        return {
          success: false,
          message: "Stock Transfer record not found or access denied.",
        };
      }

      return { success: true, transfer };
    },
    { params: t.Object({ id: t.String() }) },
  )

  /**
   * 3. POST: CREATE NEW STOCK TRANSFER REQUEST (PENDING STATE)
   */
  .post(
    "/",
    async ({ body, tenantId, userId, set }) => {
      if (body.fromStoreId === body.toStoreId) {
        set.status = 400;
        return {
          success: false,
          message: "Source store and destination store cannot be the same.",
        };
      }

      // Add On by myself. VALIDATION: Verify both stores exist and belong to this tenant
      const stores = await prisma.store.findMany({
        where: {
          id: { in: [body.fromStoreId, body.toStoreId] },
          tenantId: tenantId, // Ensures tenant isolation
        },
      });

      if (stores.length !== 2) {
        set.status = 404;
        return {
          success: false,
          message:
            "One or both of the specified stores do not exist or do not belong to your organization.",
        };
      }

      const transferNumber = `TRF-${Date.now()}`;

      const transfer = await prisma.$transaction(async (tx: any) => {
        const created = await tx.stockTransfer.create({
          data: {
            tenantId,
            transferNumber,
            fromStoreId: body.fromStoreId,
            toStoreId: body.toStoreId,
            status: TransferStatus.PENDING,
            requestedById: userId, // Token မှရလာသော Requester User ID
            notes: body.notes,
            items: {
              create: body.items.map((item) => ({
                tenantId,
                productId: item.productId,
                // 💡 TypeScript Safety အတွက် Explicit Null Mapping ပြုလုပ်ခြင်း
                variantId: item.variantId ?? null,
                quantity: item.quantity,
              })),
            },
          },
          include: { items: true },
        });

        // Audit Log မှတ်တမ်းတင်ခြင်း
        await tx.auditLog.create({
          data: {
            tenantId,
            userId,
            action: "CREATE",
            entity: "StockTransfer",
            entityId: created.id,
            newData: JSON.parse(JSON.stringify(created)),
          },
        });

        return created;
      });

      set.status = 201;
      return {
        success: true,
        message: "Stock transfer requested successfully.",
        transfer,
      };
    },
    {
      body: t.Object({
        fromStoreId: t.String(),
        toStoreId: t.String(),
        notes: t.Optional(t.String()),
        items: t.Array(
          t.Object({
            productId: t.String(),
            variantId: t.Optional(t.String()),
            quantity: t.Integer({ minimum: 1 }),
          }),
        ),
      }),
    },
  )

  /**
   * 4. POST: APPROVE & COMPLETE STOCK TRANSFER (REAL-TIME TWO-WAY INVENTORY BALANCE)
   */
  .post(
    "/:id/complete",
    async ({ params: { id }, tenantId, userId, set }) => {
      // ၁။ ဘောင်ချာရှိမရှိနှင့် အခြေအနေအား Strict Check လုပ်ခြင်း
      const existingTransfer = await prisma.stockTransfer.findFirst({
        where: { id, tenantId },
        include: { items: true },
      });

      if (!existingTransfer) {
        set.status = 404;
        return { success: false, message: "Stock Transfer ticket not found." };
      }

      if (existingTransfer.status === TransferStatus.RECEIVED) {
        set.status = 400;
        return {
          success: false,
          message:
            "This stock transfer has already been completed and received.",
        };
      }

      const transfer = await prisma.$transaction(async (tx: any) => {
        const updated = await tx.stockTransfer.update({
          where: { id },
          data: {
            status: TransferStatus.RECEIVED,
            completedAt: new Date(),
            approvedById: userId, // Current logged in Manager/Approver
          },
          include: { items: true },
        });

        for (const item of updated.items) {
          // 🚀 (က) ထွက်ခွာမည့်ဆိုင်ခွဲမှ စတော့ခ်အား နှုတ်ပယ်ခြင်း (TRANSFER_OUT)
          await adjustInventory(tx, {
            tenantId,
            storeId: updated.fromStoreId,
            productId: item.productId,
            variantId: item.variantId ?? null, // 💡 Type-safe explicit null
            quantityDelta: -item.quantity, // 👈 နှုတ်ကိန်းပြပါသည်
            userId,
            type: "TRANSFER_OUT",
            referenceId: updated.id,
            referenceType: "StockTransfer",
            reason: `Transfer Out to Store ID: ${updated.toStoreId}`,
          });

          // 🚀 (ခ) ဆိုက်ရောက်မည့်ဆိုင်ခွဲထဲသို့ စတော့ခ်အား ပေါင်းထည့်ခြင်း (TRANSFER_IN)
          await adjustInventory(tx, {
            tenantId,
            storeId: updated.toStoreId,
            productId: item.productId,
            variantId: item.variantId ?? null, // 💡 Type-safe explicit null
            quantityDelta: item.quantity, // 👈 အပေါင်းကိန်းပြပါသည်
            userId,
            type: "TRANSFER_IN",
            referenceId: updated.id,
            referenceType: "StockTransfer",
            reason: `Transfer In from Store ID: ${updated.fromStoreId}`,
          });

          // (ဂ) ဘောင်ချာ Item Table ထဲတွင် လက်ခံရရှိသည့် အရေအတွက်အား Sync လုပ်ပေးခြင်း
          await tx.stockTransferItem.update({
            where: { id: item.id },
            data: { receivedQuantity: item.quantity },
          });
        }

        // Audit Log Tracker Operation
        await tx.auditLog.create({
          data: {
            tenantId,
            userId,
            action: "APPROVE",
            entity: "StockTransfer",
            entityId: updated.id,
            oldData: JSON.parse(JSON.stringify(existingTransfer)),
            newData: JSON.parse(JSON.stringify(updated)),
          },
        });

        return updated;
      });

      return {
        success: true,
        message:
          "Stock transfer completed and quantities inventory successfully updated across stores.",
        transfer,
      };
    },
    { params: t.Object({ id: t.String() }) },
  )

  /**
   * 5. DELETE: DELETE/CANCEL PENDING STOCK TRANSFER
   */
  .delete(
    "/:id",
    async ({ params: { id }, tenantId, userId, set }) => {
      const transfer = await prisma.stockTransfer.findFirst({
        where: { id, tenantId },
      });

      if (!transfer) {
        set.status = 404;
        return { success: false, message: "Stock Transfer ticket not found." };
      }

      // စတော့ခ်တွေ အပြန်အလှန် လွှဲပြောင်းပြီးသားဖြစ်တဲ့ RECEIVED အဆင့်ရောက်ရင် ဖျက်ခွင့်မပြုပါ
      if (transfer.status === TransferStatus.RECEIVED) {
        set.status = 400;
        return {
          success: false,
          message:
            "Cannot delete or cancel a stock transfer that has already been received.",
        };
      }

      return await prisma.$transaction(async (tx: any) => {
        // တွဲဖက်ပစ္စည်းစာရင်းများကို အရင်ဖျက်သိမ်းခြင်း
        await tx.stockTransferItem.deleteMany({ where: { transferId: id } });

        const deletedTransfer = await tx.stockTransfer.delete({
          where: { id },
        });

        // Log Critical Activity
        await tx.auditLog.create({
          data: {
            tenantId,
            userId,
            action: "DELETE",
            entity: "StockTransfer",
            entityId: id,
            oldData: JSON.parse(JSON.stringify(deletedTransfer)),
          },
        });

        return {
          success: true,
          message: "Stock transfer request ticket successfully discarded.",
        };
      });
    },
    { params: t.Object({ id: t.String() }) },
  );
