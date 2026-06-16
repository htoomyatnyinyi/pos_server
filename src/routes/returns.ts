import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";
import { tenantAuthMiddleware } from "../../middlewares/tenantAuthMiddleware";
import { adjustInventory } from "../lib/inventory";
import { PaymentMethod, RefundStatus } from "@prisma/client";

export const returnRoutes = new Elysia({
  prefix: "/returns",
})
  // 🔐 Multi-Tenant Authentication Middleware ချိတ်ဆက်ခြင်း
  .use(tenantAuthMiddleware)

  /**
   * 1. GET ALL SALES RETURNS WITH TENANT ISOLATION & PAGINATION
   */
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

  /**
   * 2. GET SINGLE RETURN VOUCHER BY ID
   */
  .get(
    "/:id",
    async ({ params: { id }, tenantId, set }) => {
      const returnData = await prisma.return.findFirst({
        // 🚨 လုံခြုံရေးအရ မိမိ Tenant ပိုင်ဆိုင်သော Return Record ကိုသာ ပြသခွင့်ပေးမည်
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

  /**
   * 3. POST: PROCESS NEW SALES RETURN & RESTOCK INVENTORY IN TRANSACTION
   */
  .post(
    "/",
    async ({ body, tenantId, userId, set }) => {
      const returnNumber = `RET-${Date.now()}`;

      try {
        const returnRecord = await prisma.$transaction(async (tx) => {
          // ၁။ မူရင်း အရောင်းဘောင်ချာ (Order) ရှိမရှိနှင့် မည်သည့်ဆိုင်ခွဲဖြစ်ကြောင်း ဦးစွာစစ်ဆေးခြင်း
          const order = await tx.order.findFirst({
            where: { id: body.orderId, tenantId },
            select: { id: true, storeId: true },
          });

          if (!order || !order.storeId) {
            throw new Error(
              "Invalid request: Referenced order not found or missing warehouse branch information.",
            );
          }

          // ၂။ ပစ္စည်းပြန်အပ်မှုမှတ်တမ်း (Return Ticket) အသစ် ဖန်တီးခြင်း
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
              approvedById: userId, // 💡 JWT Token မှရလာသော လက်ရှိမန်နေဂျာ ID အား သတ်မှတ်ခြင်း
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

          // ၃။ မူရင်း အရောင်းဘောင်ချာအား Refunded အခြေအနေသို့ ပြောင်းလဲခြင်း
          await tx.order.update({
            where: { id: body.orderId },
            data: { status: "REFUNDED" },
          });

          // ၄။ အပ်နှံလိုက်သော ပစ္စည်းများအတွက် Database Loop ပတ်၍ စတော့ခ်နှင့် အခြေအနေများ Sync လုပ်ခြင်း
          for (const item of body.items) {
            const orderItem = await tx.orderItem.findUnique({
              where: { id: item.orderItemId },
            });

            if (!orderItem) {
              throw new Error(
                `Data Sync Error: Order item details matching ID '${item.orderItemId}' could not be recovered.`,
              );
            }

            // 🚀 (က) ဆိုင်ခွဲအတွင်းသို့ ပစ္စည်းပြန်လည်ဝင်ရောက်လာသဖြင့် စတော့ခ်အား တိုးမြှင့်ခြင်း (RETURN_IN)
            await adjustInventory(tx, {
              tenantId,
              storeId: order.storeId,
              productId: orderItem.productId,
              variantId: orderItem.variantId ?? null, // 💡 Type-safe explicit null check
              quantityDelta: item.quantity, // 👈 ပစ္စည်းပြန်ဝင်လာသဖြင့် အပေါင်းကိန်းဖြစ်သည်
              userId,
              type: "RETURN_IN",
              referenceId: createdReturn.id,
              referenceType: "Return",
              reason: `Sales Return Received: Ticket #${returnNumber}`,
            });

            // (ခ) မူရင်း Item List ထဲတွင် ပစ္စည်းပြန်အပ်ပြီးကြောင်း အခြေအနေနှင့် အရေအတွက်အား မှတ်တမ်းတင်ခြင်း
            await tx.orderItem.update({
              where: { id: item.orderItemId },
              data: {
                isReturned: true,
                returnedQuantity: { increment: item.quantity },
              },
            });
          }

          // ၅။ လုပ်ငန်းစဉ်နောက်ခံသမိုင်း စနစ်တကျ မှတ်တမ်းတင်ခြင်း (System Audit Logs)
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
          message:
            "Sales return successfully processed and inventory restocked.",
          returnRecord,
        };
      } catch (error: any) {
        set.status = 400;
        return {
          success: false,
          message:
            error.message ||
            "An unexpected error occurred during processing return tickets.",
        };
      }
    },
    {
      body: t.Object({
        orderId: t.String({ minLength: 1 }),
        customerId: t.Optional(t.String()),
        totalAmount: t.Number({ minimum: 0 }),
        refundMethod: t.String(), // Schema PaymentMethod Enum Mapping
        refundStatus: t.Optional(t.String()), // Schema RefundStatus Enum Mapping
        reason: t.String({ minLength: 2 }),
        items: t.Array(
          t.Object({
            orderItemId: t.String({ minLength: 1 }),
            quantity: t.Integer({ minimum: 1 }), // 🚨 အနည်းဆုံး ၁ ခုနှင့်အထက် ပြန်အပ်ရမည်
            refundAmount: t.Number({ minimum: 0 }),
            reason: t.Optional(t.String()),
          }),
        ),
      }),
    },
  )

  /**
   * 4. DELETE: PURGE/CANCEL SALES RETURN RECORD
   */
  .delete(
    "/:id",
    async ({ params: { id }, tenantId, userId, set }) => {
      const returnData = await prisma.return.findFirst({
        where: { id, tenantId },
      });

      if (!returnData) {
        set.status = 404;
        return {
          success: false,
          message: "Sales return ticket not found or access denied.",
        };
      }

      // 💡 Accounting နှင့် Inventory အရှုပ်အရှင်းမဖြစ်စေရန် ပြီးမြောက်ပြီးသား Return များကို ဖျက်ခွင့်မပြုပါ
      set.status = 400;
      return {
        success: false,
        message:
          "Security Restriction: Completed financial returns cannot be hard-deleted. Kindly use reverse balance adjustments if auditing correction is required.",
      };
    },
    { params: t.Object({ id: t.String() }) },
  );
