import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";
import { tenantAuthMiddleware } from "../../middlewares/tenantAuthMiddleware";
import { adjustInventory } from "../lib/inventory";
import { OrderStatus, PaymentMethod, PaymentStatus } from "@prisma/client";

export const orderRoutes = new Elysia({ prefix: "/orders" })
  // 🔐 Multi-Tenant Authentication & Context Middleware
  .use(tenantAuthMiddleware)

  /**
   * 1. GET ALL ORDERS WITH TENANT ISOLATION & PAGINATION
   */
  .get(
    "/",
    async ({ tenantId, query }) => {
      const page = query.page ? parseInt(query.page as string) : 1;
      const limit = query.limit ? parseInt(query.limit as string) : 20;
      const skip = (page - 1) * limit;

      const whereCondition: any = {
        tenantId, // Strict Security Boundary
        ...(query.storeId ? { storeId: query.storeId as string } : {}),
        ...(query.sessionId ? { sessionId: query.sessionId as string } : {}),
        ...(query.status ? { status: query.status as OrderStatus } : {}),
      };

      const [total, orders] = await prisma.$transaction([
        prisma.order.count({ where: whereCondition }),
        prisma.order.findMany({
          where: whereCondition,
          include: {
            items: { include: { product: true, variant: true } },
            user: { select: { id: true, name: true, email: true } },
            customer: true,
          },
          orderBy: { createdAt: "desc" },
          skip,
          take: limit,
        }),
      ]);

      return {
        success: true,
        meta: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
        orders,
      };
    },
    {
      query: t.Optional(
        t.Object({
          page: t.Optional(t.String()),
          limit: t.Optional(t.String()),
          storeId: t.Optional(t.String()),
          sessionId: t.Optional(t.String()),
          status: t.Optional(t.String()),
        }),
      ),
    },
  )

  /**
   * 2. GET SINGLE ORDER BY ID
   */
  .get(
    "/:id",
    async ({ params: { id }, tenantId, set }) => {
      const order = await prisma.order.findFirst({
        where: { id, tenantId }, // ပြင်ပ လုပ်ငန်းခွဲမှ လှမ်းကြည့်၍မရအောင် ကာကွယ်ခြင်း
        include: {
          items: { include: { product: true, variant: true } },
          user: { select: { id: true, name: true, email: true } },
          customer: true,
        },
      });

      if (!order) {
        set.status = 404;
        return { success: false, message: "Order not found or access denied." };
      }

      return { success: true, order };
    },
    { params: t.Object({ id: t.String() }) },
  )

  /**
   * 3. POST: CREATE ORDER, DEDUCT STOCKS, INCREMENT SESSION CASH & AUDIT LOG
   */
  .post(
    "/",
    async ({ body, tenantId, userId, set }) => {
      // Cashier Session Active ဖြစ်မဖြစ် စစ်ဆေးခြင်း
      if (body.sessionId) {
        const activeSession = await prisma.session.findFirst({
          where: { id: body.sessionId, tenantId, status: "OPEN" },
        });
        if (!activeSession) {
          set.status = 400;
          return {
            success: false,
            message: "The provided register session is closed or invalid.",
          };
        }
      }

      const orderNumber = `ORD-${Date.now()}`;

      return await prisma.$transaction(async (tx) => {
        // (က) Order နှင့် Order Items များကို Database ထဲသိမ်းဆည်းခြင်း
        const createdOrder = await tx.order.create({
          data: {
            tenantId,
            orderNumber,
            subTotal: body.subTotal,
            taxAmount: body.taxAmount ?? 0,
            discountAmount: body.discountAmount ?? 0,
            grandTotal: body.grandTotal,
            paidAmount: body.paidAmount,
            changeAmount: body.changeAmount,
            paymentStatus: PaymentStatus.PAID,
            status: OrderStatus.COMPLETED,
            paymentMethod: body.paymentMethod as PaymentMethod,
            userId, // Auth Middleware မှရရှိလာသော Cashier User ID
            customerId: body.customerId,
            sessionId: body.sessionId,
            storeId: body.storeId,
            registerId: body.registerId,
            completedAt: new Date(),
            items: {
              create: body.items.map((item) => ({
                tenantId,
                productId: item.productId,
                variantId: item.variantId ?? null,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                discountAmount: item.discountAmount ?? 0,
                subTotal: item.subTotal,
              })),
            },
          },
          include: { items: true },
        });

        // (ခ) 🚀 Real-time Stock Deduction & Stock Movement Tracking
        for (const item of createdOrder.items) {
          await adjustInventory(tx, {
            tenantId,
            storeId: body.storeId,
            productId: item.productId,
            variantId: item.variantId,
            quantityDelta: -item.quantity, // အရောင်းဖြစ်၍ စတော့နှုတ်ရန် အနှုတ်ကိန်းပြရပါမည်
            userId,
            type: "SALE", // Schema MovementType Enum
            referenceId: createdOrder.id,
            referenceType: "Order",
            reason: `POS Checkout - Voucher: ${orderNumber}`,
          });
        }

        // (ဂ) Update Register Session Tracker Balance
        if (body.sessionId) {
          const updateField: any = {};
          if (body.paymentMethod === "CASH") {
            updateField.cashSales = { increment: body.grandTotal };
          } else if (body.paymentMethod === "CARD") {
            updateField.cardSales = { increment: body.grandTotal };
          } else {
            // KBZ_PAY, WAVE_PAY, CB_PAY etc -> Digital Wallet Sales
            updateField.digitalSales = { increment: body.grandTotal };
          }

          await tx.session.update({
            where: { id: body.sessionId },
            data: updateField,
          });
        }

        // (ဃ) Create System Audit Log Tracking
        await tx.auditLog.create({
          data: {
            tenantId,
            userId,
            action: "CREATE",
            entity: "Order",
            entityId: createdOrder.id,
            newData: JSON.parse(JSON.stringify(createdOrder)),
          },
        });

        set.status = 201;
        return {
          success: true,
          message: "Order placed successfully.",
          order: createdOrder,
        };
      });
    },
    {
      body: t.Object({
        subTotal: t.Number(),
        taxAmount: t.Optional(t.Number()),
        discountAmount: t.Optional(t.Number()),
        grandTotal: t.Number(),
        paymentMethod: t.String(), // Schema PaymentMethod Enum သုံးရန် String အဖြစ်ပြောင်းလဲထားပါသည်
        paidAmount: t.Number(),
        changeAmount: t.Number(),
        customerId: t.Optional(t.String()),
        sessionId: t.Optional(t.String()),
        storeId: t.String(),
        registerId: t.Optional(t.String()),
        items: t.Array(
          t.Object({
            productId: t.String(),
            variantId: t.Optional(t.String()),
            quantity: t.Integer(),
            unitPrice: t.Number(),
            discountAmount: t.Optional(t.Number()),
            subTotal: t.Number(),
          }),
        ),
      }),
    },
  )

  /**
   * 4. PATCH: UPDATE ORDER STATUS WITH AUDIT TRACK
   */
  .patch(
    "/:id/status",
    async ({ params: { id }, body, tenantId, userId, set }) => {
      const order = await prisma.order.findFirst({
        where: { id, tenantId },
      });

      if (!order) {
        set.status = 404;
        return { success: false, message: "Order not found." };
      }

      const updatedOrder = await prisma.order.update({
        where: { id },
        data: { status: body.status as OrderStatus },
      });

      // Audit Log For Status Change
      await prisma.auditLog.create({
        data: {
          tenantId,
          userId,
          action: "UPDATE",
          entity: "Order",
          entityId: id,
          oldData: JSON.parse(JSON.stringify(order)),
          newData: JSON.parse(JSON.stringify(updatedOrder)),
        },
      });

      return {
        success: true,
        message: "Order status updated successfully.",
        order: updatedOrder,
      };
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({ status: t.String() }),
    },
  )

  /**
   * 5. DELETE: CANCEL/VOID ORDER (Data Preservation Logic)
   */
  .delete(
    "/:id",
    async ({ params: { id }, tenantId, role, userId, set }) => {
      // Management Checking
      if (role !== "ADMIN" && role !== "SUPER_ADMIN" && role !== "MANAGER") {
        set.status = 403;
        return {
          success: false,
          message: "Forbidden: Only authorized staff can void orders.",
        };
      }

      const order = await prisma.order.findFirst({
        where: { id, tenantId },
        include: { items: true },
      });

      if (!order) {
        set.status = 404;
        return { success: false, message: "Order not found or access denied." };
      }

      return await prisma.$transaction(async (tx) => {
        // ဒေတာရင်းမြစ်မပျောက်ပျက်စေရန် အမှန်တကယ် Hard Delete မလုပ်ဘဲ Status ကို VOIDED ပြောင်းလဲပါမည်
        const voidedOrder = await tx.order.update({
          where: { id },
          data: {
            status: OrderStatus.VOIDED,
            paymentStatus: PaymentStatus.REFUNDED,
          },
        });

        // 🚀 ပစ္စည်းများကို စတော့ခ်ထဲ ပြန်လည်ဖြည့်သွင်းပေးခြင်း (Restock Counter)
        for (const item of order.items) {
          if (order.storeId) {
            await adjustInventory(tx, {
              tenantId,
              storeId: order.storeId,
              productId: item.productId,
              variantId: item.variantId,
              quantityDelta: item.quantity, // 👈 ပစ္စည်းပြန်ဝင်လာ၍ အပေါင်းကိန်းပြပါသည်
              userId,
              type: "RETURN_IN", // Schema MovementType Enum
              referenceId: order.id,
              referenceType: "Order",
              reason: `Voucher Cancelled/Voided - Restocking Items`,
            });
          }
        }

        // Log the Event
        await tx.auditLog.create({
          data: {
            tenantId,
            userId,
            action: "VOID", // Schema AuditAction.VOID Enum
            entity: "Order",
            entityId: id,
            oldData: JSON.parse(JSON.stringify(order)),
            newData: JSON.parse(JSON.stringify(voidedOrder)),
          },
        });

        return {
          success: true,
          message: "Order successfully voided and inventory restored.",
        };
      });
    },
    { params: t.Object({ id: t.String() }) },
  );
