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

// import { Elysia, t } from "elysia";
// import { prisma } from "../lib/prisma";
// import { tenantAuthMiddleware } from "../../middlewares/tenantAuthMiddleware";
// import { PaymentMethod } from "@prisma/client";

// export const supplierPaymentRoutes = new Elysia({
//   prefix: "/supplier-payments",
// })
//   // 🔐 Multi-Tenant Authentication Middleware ချိတ်ဆက်ခြင်း
//   .use(tenantAuthMiddleware)

//   /**
//    * 1. GET ALL SUPPLIER PAYMENTS WITH TENANT ISOLATION & PAGINATION
//    */
//   .get(
//     "/",
//     async ({ tenantId, query }) => {
//       const page = query.page ? parseInt(query.page as string) : 1;
//       const limit = query.limit ? parseInt(query.limit as string) : 20;
//       const skip = (page - 1) * limit;

//       const whereCondition: any = {
//         tenantId,
//         ...(query.supplierId ? { supplierId: query.supplierId as string } : {}),
//         ...(query.paymentMethod
//           ? { paymentMethod: query.paymentMethod as PaymentMethod }
//           : {}),
//       };

//       const [total, payments] = await prisma.$transaction([
//         prisma.supplierPayment.count({ where: whereCondition }),
//         prisma.supplierPayment.findMany({
//           where: whereCondition,
//           include: {
//             supplier: { select: { id: true, name: true, code: true } },
//           },
//           orderBy: { paidAt: "desc" },
//           skip,
//           take: limit,
//         }),
//       ]);

//       return {
//         success: true,
//         meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
//         payments,
//       };
//     },
//     {
//       query: t.Optional(
//         t.Object({
//           page: t.Optional(t.String()),
//           limit: t.Optional(t.String()),
//           supplierId: t.Optional(t.String()),
//           paymentMethod: t.Optional(t.String()),
//         }),
//       ),
//     },
//   )

//   /**
//    * 2. GET SINGLE SUPPLIER PAYMENT DETAIL BY ID
//    */
//   .get(
//     "/:id",
//     async ({ params: { id }, tenantId, set }) => {
//       const payment = await prisma.supplierPayment.findFirst({
//         // 🚨 လုံခြုံရေးအရ မိမိလုပ်ငန်းပိုင် ငွေချေမှုမှတ်တမ်းကိုသာ ကြည့်ခွင့်ပေးမည်
//         where: { id, tenantId },
//         include: { supplier: true },
//       });

//       if (!payment) {
//         set.status = 404;
//         return {
//           success: false,
//           message: "Supplier payment voucher not found or access denied.",
//         };
//       }

//       return { success: true, payment };
//     },
//     { params: t.Object({ id: t.String() }) },
//   )

//   /**
//    * 3. POST: RECORD NEW SUPPLIER PAYMENT & AUTO-DECREMENT SUPPLIER BALANCE
//    * (လုပ်ငန်းရှင်များသို့ ကြွေးမြီပြန်လည်ပေးဆပ်မှုအား စာရင်းသွင်းပြီး ၎င်းတို့၏လက်ကျန်ကြွေးမြီအား Auto နှုတ်ခြင်း)
//    */
//   .post(
//     "/",
//     async ({ body, tenantId, userId, set }) => {
//       // ၁။ ငွေတွက်ချက်မှု မလုပ်မီ အဆိုပါ Supplier သည် မိမိလုပ်ငန်းအောက်တွင် တကယ်ရှိမရှိ အရင်စစ်ဆေးခြင်း
//       const targetSupplier = await prisma.supplier.findFirst({
//         where: { id: body.supplierId, tenantId, deletedAt: null },
//       });

//       if (!targetSupplier) {
//         set.status = 400;
//         return {
//           success: false,
//           message:
//             "Transaction failed: Supplier not found or already deactivated.",
//         };
//       }

//       // ၂။ ငွေစာရင်းဇယား တိကျသေချာစေရန် Database Atomicity Transaction စတင်ခြင်း
//       const paymentResult = await prisma.$transaction(async (tx) => {
//         // (က) ငွေပေးချေမှုဘောင်ချာအသစ် ဖန်တီးခြင်း
//         const createdPayment = await tx.supplierPayment.create({
//           data: {
//             tenantId,
//             supplierId: body.supplierId,
//             amount: body.amount,
//             paymentMethod: body.paymentMethod as PaymentMethod,
//             referenceNumber: body.referenceNumber
//               ? body.referenceNumber.trim()
//               : null,
//             note: body.note ? body.note.trim() : null,
//             paidAt: new Date(),
//           },
//         });

//         // (ခ) Supplier Table ရှိ အဆိုပါ လုပ်ငန်းရှင်၏ လက်ကျန်ကြွေးမြီစာရင်းကို ငွေပေးချေလိုက်သော ပမာဏအတိုင်း နှုတ်ပယ်ခြင်း
//         await tx.supplier.update({
//           where: { id: body.supplierId },
//           data: {
//             currentBalance: { decrement: body.amount },
//           },
//         });

//         // (ဂ) စနစ်အတွင်း လုပ်ငန်းစဉ် သမိုင်းမှတ်တမ်း ရေးသွင်းခြင်း (System Audit Logs)
//         await tx.auditLog.create({
//           data: {
//             tenantId,
//             userId,
//             action: "CREATE",
//             entity: "SupplierPayment",
//             entityId: createdPayment.id,
//             newData: JSON.parse(JSON.stringify(createdPayment)),
//           },
//         });

//         return createdPayment;
//       });

//       set.status = 201;
//       return {
//         success: true,
//         message:
//           "Supplier payment successfully processed and supplier balance adjusted.",
//         payment: paymentResult,
//       };
//     },
//     {
//       body: t.Object({
//         supplierId: t.String({ minLength: 1 }),
//         amount: t.Number({ minimum: 0.01 }), // သုည သို့မဟုတ် အနှုတ်ကိန်းများ ငွေလှမ်းချေ၍မရအောင် ကာကွယ်ထားသည်
//         paymentMethod: t.String(), // Schema PaymentMethod Enum နှင့် ကိုက်ညီရမည်
//         referenceNumber: t.Optional(t.String()),
//         note: t.Optional(t.String()),
//       }),
//     },
//   );
