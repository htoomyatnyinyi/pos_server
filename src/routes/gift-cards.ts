import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";
import { tenantAuthMiddleware } from "../../middlewares/tenantAuthMiddleware";
import { requireRoles } from "../lib/security";

export const giftCardRoutes = new Elysia({ prefix: "/gift-cards" })
  .use(tenantAuthMiddleware)

  .get(
    "/",
    async ({ tenantId, query }) => {
      const page = query.page ? parseInt(query.page as string) : 1;
      const limit = query.limit ? parseInt(query.limit as string) : 20;
      const skip = (page - 1) * limit;

      const whereCondition: any = { tenantId };
      if (query.status) whereCondition.status = query.status;
      if (query.customerId) whereCondition.customerId = query.customerId;
      if (query.search) {
        whereCondition.OR = [
          {
            cardNumber: {
              contains: query.search as string,
              mode: "insensitive",
            },
          },
        ];
      }

      const [total, giftCards] = await prisma.$transaction([
        prisma.giftCard.count({ where: whereCondition }),
        prisma.giftCard.findMany({
          where: whereCondition,
          include: { customer: true },
          orderBy: { createdAt: "desc" },
          skip,
          take: limit,
        }),
      ]);

      return {
        success: true,
        meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
        giftCards,
      };
    },
    {
      query: t.Optional(
        t.Object({
          page: t.Optional(t.String()),
          limit: t.Optional(t.String()),
          status: t.Optional(t.String()),
          customerId: t.Optional(t.String()),
          search: t.Optional(t.String()),
        }),
      ),
    },
  )

  .get(
    "/lookup/:cardNumber",
    async ({ params: { cardNumber }, tenantId, set }) => {
      const giftCard = await prisma.giftCard.findFirst({
        where: { cardNumber, tenantId },
        include: {
          customer: true,
          transactions: { take: 10, orderBy: { createdAt: "desc" } },
        },
      });
      if (!giftCard) {
        set.status = 404;
        return { success: false, message: "Gift card not found." };
      }
      return { success: true, giftCard };
    },
    { params: t.Object({ cardNumber: t.String() }) },
  )

  .post(
    "/",
    async ({ body, tenantId, userId, role, set }) => {
      requireRoles(role, ["ADMIN", "MANAGER", "SUPER_ADMIN"], set);

      // Validate customer if provided
      if (body.customerId) {
        const customer = await prisma.customer.findFirst({
          where: { id: body.customerId, tenantId },
        });
        if (!customer) {
          set.status = 400;
          return { success: false, message: "Customer not found." };
        }
      }

      const cardNumber = body.cardNumber || `GC-${Date.now()}`;

      const existing = await prisma.giftCard.findUnique({
        where: { cardNumber },
      });
      if (existing) {
        set.status = 400;
        return { success: false, message: "Card number already exists." };
      }

      const giftCard = await prisma.$transaction(async (tx) => {
        const created = await tx.giftCard.create({
          data: {
            tenantId,
            cardNumber,
            pinCode: body.pinCode,
            initialAmount: body.initialAmount,
            currentBalance: body.initialAmount,
            expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
            customerId: body.customerId,
            status: "ACTIVE",
          },
        });
        await tx.giftCardTransaction.create({
          data: {
            tenantId,
            giftCardId: created.id,
            amount: body.initialAmount,
            type: "ISSUE",
          },
        });
        await tx.auditLog.create({
          data: {
            tenantId,
            userId,
            action: "CREATE",
            entity: "GiftCard",
            entityId: created.id,
            newData: JSON.parse(JSON.stringify(created)),
          },
        });
        return created;
      });

      set.status = 201;
      return {
        success: true,
        message: "Gift card issued successfully.",
        giftCard,
      };
    },
    {
      body: t.Object({
        initialAmount: t.Number({ minimum: 1 }),
        cardNumber: t.Optional(t.String()),
        pinCode: t.Optional(t.String()),
        customerId: t.Optional(t.String()),
        expiresAt: t.Optional(t.String()),
      }),
    },
  )

  .post(
    "/:id/reload",
    async ({ params: { id }, body, tenantId, userId, role, set }) => {
      requireRoles(role, ["ADMIN", "MANAGER", "SUPER_ADMIN"], set);

      const giftCard = await prisma.giftCard.findFirst({
        where: { id, tenantId },
      });
      if (!giftCard) {
        set.status = 404;
        return { success: false, message: "Gift card not found." };
      }
      if (giftCard.status !== "ACTIVE") {
        set.status = 400;
        return { success: false, message: "Gift card is not active." };
      }

      const updated = await prisma.$transaction(async (tx: any) => {
        const result = await tx.giftCard.update({
          where: { id },
          data: {
            currentBalance: { increment: body.amount },
          },
        });
        await tx.giftCardTransaction.create({
          data: {
            tenantId,
            giftCardId: id,
            amount: body.amount,
            type: "RELOAD",
          },
        });
        await tx.auditLog.create({
          data: {
            tenantId,
            userId,
            action: "UPDATE",
            entity: "GiftCard",
            entityId: id,
            oldData: JSON.parse(JSON.stringify(giftCard)),
            newData: JSON.parse(JSON.stringify(result)),
          },
        });
        return result;
      });

      return {
        success: true,
        message: "Gift card reloaded successfully.",
        giftCard: updated,
      };
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({ amount: t.Number({ minimum: 1 }) }),
    },
  )

  .patch(
    "/:id/status",
    async ({ params: { id }, body, tenantId, userId, role, set }) => {
      requireRoles(role, ["ADMIN", "MANAGER", "SUPER_ADMIN"], set);

      const giftCard = await prisma.giftCard.findFirst({
        where: { id, tenantId },
      });
      if (!giftCard) {
        set.status = 404;
        return { success: false, message: "Gift card not found." };
      }

      const updated = await prisma.giftCard.update({
        where: { id },
        data: { status: body.status },
      });

      await prisma.auditLog.create({
        data: {
          tenantId,
          userId,
          action: "UPDATE",
          entity: "GiftCard",
          entityId: id,
          oldData: JSON.parse(JSON.stringify(giftCard)),
          newData: JSON.parse(JSON.stringify(updated)),
        },
      });

      return {
        success: true,
        message: "Gift card status updated successfully.",
        giftCard: updated,
      };
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({ status: t.String() }),
    },
  );

// import { Elysia, t } from "elysia";
// import { prisma } from "../lib/prisma";
// import { tenantAuthMiddleware } from "../../middlewares/tenantAuthMiddleware";
// import { GiftCardStatus } from "@prisma/client";

// export const giftCardRoutes = new Elysia({
//   prefix: "/gift-cards",
// })
//   // 🔐 Multi-Tenant Authentication Middleware ချိတ်ဆက်ခြင်း
//   .use(tenantAuthMiddleware)

//   /**
//    * 1. GET ALL GIFT CARDS WITH TENANT ISOLATION & PAGINATION
//    */
//   .get(
//     "/",
//     async ({ tenantId, query }) => {
//       const page = query.page ? parseInt(query.page as string) : 1;
//       const limit = query.limit ? parseInt(query.limit as string) : 20;
//       const skip = (page - 1) * limit;

//       const whereCondition: any = {
//         tenantId,
//         ...(query.status ? { status: query.status as GiftCardStatus } : {}),
//         ...(query.customerId ? { customerId: query.customerId as string } : {}),
//         ...(query.search
//           ? {
//               cardNumber: {
//                 contains: query.search as string,
//                 mode: "insensitive",
//               },
//             }
//           : {}),
//       };

//       const [total, giftCards] = await prisma.$transaction([
//         prisma.giftCard.count({ where: whereCondition }),
//         prisma.giftCard.findMany({
//           where: whereCondition,
//           include: {
//             customer: { select: { id: true, name: true, code: true } },
//             transactions: { take: 5, orderBy: { createdAt: "desc" } }, // နောက်ဆုံး Transaction ၅ ခုသာ တွဲပြမည်
//           },
//           orderBy: { createdAt: "desc" },
//           skip,
//           take: limit,
//         }),
//       ]);

//       return {
//         success: true,
//         meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
//         giftCards,
//       };
//     },
//     {
//       query: t.Optional(
//         t.Object({
//           page: t.Optional(t.String()),
//           limit: t.Optional(t.String()),
//           status: t.Optional(t.String()), // Schema GiftCardStatus Enum
//           customerId: t.Optional(t.String()),
//           search: t.Optional(t.String()), // Gift Card နံပါတ်ဖြင့် ရှာဖွေရန်
//         }),
//       ),
//     },
//   )

//   /**
//    * 2. LOOKUP GIFT CARD BY CARD NUMBER
//    */
//   .get(
//     "/lookup/:cardNumber",
//     async ({ params: { cardNumber }, tenantId, set }) => {
//       const giftCard = await prisma.giftCard.findFirst({
//         where: {
//           tenantId,
//           cardNumber: cardNumber.trim().toUpperCase(),
//         },
//         include: {
//           customer: { select: { id: true, name: true, phone: true } },
//           transactions: { orderBy: { createdAt: "desc" }, take: 20 },
//         },
//       });

//       if (!giftCard) {
//         set.status = 404;
//         return {
//           success: false,
//           message: "Gift card not found or invalid card number.",
//         };
//       }

//       return { success: true, giftCard };
//     },
//     { params: t.Object({ cardNumber: t.String() }) },
//   )

//   /**
//    * 3. POST: ISSUE NEW GIFT CARD (လက်ဆောင်ကတ်အသစ် ထုတ်ပေးခြင်း)
//    */
//   .post(
//     "/",
//     async ({ body, tenantId, userId, set }) => {
//       const generatedCardNumber = body.cardNumber
//         ? body.cardNumber.trim().toUpperCase()
//         : `GC-${Date.now()}`;

//       // စနစ်ထဲတွင် ကတ်နံပါတ် တူညီမှု ရှိမရှိ ကြိုတင်စစ်ဆေးခြင်း
//       const existingCard = await prisma.giftCard.findFirst({
//         where: { tenantId, cardNumber: generatedCardNumber },
//       });

//       if (existingCard) {
//         set.status = 400;
//         return {
//           success: false,
//           message: `Gift card number '${generatedCardNumber}' is already generated.`,
//         };
//       }

//       try {
//         const giftCardResult = await prisma.$transaction(async (tx) => {
//           // (က) လက်ဆောင်ကတ်အသစ် ဆောက်ခြင်း
//           const createdCard = await tx.giftCard.create({
//             data: {
//               tenantId,
//               customerId: body.customerId ?? null,
//               cardNumber: generatedCardNumber,
//               pinCode: body.pinCode ? body.pinCode.trim() : null,
//               initialAmount: body.initialAmount,
//               currentBalance: body.initialAmount,
//               expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
//               status: GiftCardStatus.ACTIVE,
//             },
//           });

//           // (ခ) ကတ်စတင်ထုတ်ပေးကြောင်း Ledger Transaction ထဲသို့ သွင်းခြင်း (ISSUE)
//           await tx.giftCardTransaction.create({
//             data: {
//               tenantId,
//               giftCardId: createdCard.id,
//               amount: body.initialAmount,
//               type: "ISSUE",
//             },
//           });

//           // (ဂ) System Audit Log သမိုင်းမှတ်တမ်း သိမ်းဆည်းခြင်း
//           await tx.auditLog.create({
//             data: {
//               tenantId,
//               userId,
//               action: "CREATE",
//               entity: "GiftCard",
//               entityId: createdCard.id,
//               newData: JSON.parse(JSON.stringify(createdCard)),
//             },
//           });

//           return createdCard;
//         });

//         set.status = 201;
//         return {
//           success: true,
//           message: "Gift card issued successfully.",
//           giftCard: giftCardResult,
//         };
//       } catch (error: any) {
//         set.status = 400;
//         return {
//           success: false,
//           message: error.message || "Failed to issue new gift card.",
//         };
//       }
//     },
//     {
//       body: t.Object({
//         initialAmount: t.Number({ minimum: 1 }), // အနည်းဆုံး ၁ ကျပ်/ဝမ်/ဒေါ်လာ နှင့်အထက် ဖြစ်ရမည်
//         cardNumber: t.Optional(t.String()),
//         pinCode: t.Optional(t.String()),
//         customerId: t.Optional(t.String()),
//         expiresAt: t.Optional(t.String()),
//       }),
//     },
//   )

//   /**
//    * 4. POST: RELOAD GIFT CARD BALANCE (လက်ဆောင်ကတ်ထဲသို့ ငွေပြန်လည်ဖြည့်သွင်းခြင်း)
//    */
//   .post(
//     "/:id/reload",
//     async ({ params: { id }, body, tenantId, userId, set }) => {
//       try {
//         const giftCard = await prisma.$transaction(async (tx) => {
//           // 🚨 လုံခြုံရေးအရ အဆိုပါ Gift Card သည် မိမိ Tenant ပိုင် ဟုတ်မဟုတ် အရင်စစ်ဆေးခြင်း
//           const currentCard = await tx.giftCard.findFirst({
//             where: { id, tenantId },
//           });

//           if (!currentCard) {
//             throw new Error("Gift card not found or access denied.");
//           }

//           // (က) Balance တိုးမြှင့်ပြီး ကတ်အား Active ပြန်လုပ်ခြင်း
//           const updated = await tx.giftCard.update({
//             where: { id },
//             data: {
//               currentBalance: { increment: body.amount },
//               status: GiftCardStatus.ACTIVE,
//             },
//           });

//           // (ခ) ငွေဖြည့်သွင်းမှုမှတ်တမ်းအား ရေးသွင်းခြင်း (RELOAD)
//           await tx.giftCardTransaction.create({
//             data: {
//               tenantId,
//               giftCardId: updated.id,
//               amount: body.amount,
//               type: "RELOAD",
//             },
//           });

//           // (ဂ) Audit Trail Track
//           await tx.auditLog.create({
//             data: {
//               tenantId,
//               userId,
//               action: "UPDATE",
//               entity: "GiftCard",
//               entityId: id,
//               oldData: JSON.parse(JSON.stringify(currentCard)),
//               newData: JSON.parse(JSON.stringify(updated)),
//             },
//           });

//           return updated;
//         });

//         set.status = 201;
//         return {
//           success: true,
//           message: `Successfully reloaded balance by adding ${body.amount}.`,
//           giftCard,
//         };
//       } catch (error: any) {
//         set.status = 400;
//         return {
//           success: false,
//           message: error.message || "Failed to reload gift card balance.",
//         };
//       }
//     },
//     {
//       body: t.Object({ amount: t.Number({ minimum: 1 }) }),
//       params: t.Object({ id: t.String() }),
//     },
//   )

//   /**
//    * 5. PATCH: UPDATE GIFT CARD STATUS (ကတ်အား ပိတ်သိမ်းခြင်း/ယာယီရပ်ဆိုင်းခြင်း)
//    */
//   .patch(
//     "/:id/status",
//     async ({ params: { id }, body, tenantId, userId, set }) => {
//       // 🚨 အခြား Tenant မှ လှမ်းပိတ်၍မရအောင် Security Validation စစ်ဆေးခြင်း
//       const currentCard = await prisma.giftCard.findFirst({
//         where: { id, tenantId },
//       });

//       if (!currentCard) {
//         set.status = 404;
//         return {
//           success: false,
//           message: "Gift card not found or access denied.",
//         };
//       }

//       const updatedCard = await prisma.$transaction(async (tx) => {
//         const updated = await tx.giftCard.update({
//           where: { id },
//           data: { status: body.status as GiftCardStatus },
//         });

//         // Track Status Change in Logs
//         await tx.auditLog.create({
//           data: {
//             tenantId,
//             userId,
//             action: "UPDATE",
//             entity: "GiftCard",
//             entityId: id,
//             oldData: JSON.parse(JSON.stringify(currentCard)),
//             newData: JSON.parse(JSON.stringify(updated)),
//           },
//         });

//         return updated;
//       });

//       return {
//         success: true,
//         message: `Gift card status has been changed to '${body.status}'.`,
//         giftCard: updatedCard,
//       };
//     },
//     {
//       params: t.Object({ id: t.String() }),
//       body: t.Object({ status: t.String() }), // Schema GiftCardStatus Enum Mapping (ACTIVE, DISABLED, EXPIRED)
//     },
//   );
