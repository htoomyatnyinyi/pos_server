import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";
import { tenantAuthMiddleware } from "../../middlewares/tenantAuthMiddleware";
import { GiftCardStatus } from "@prisma/client";

export const giftCardRoutes = new Elysia({
  prefix: "/gift-cards",
})
  // 🔐 Multi-Tenant Authentication Middleware ချိတ်ဆက်ခြင်း
  .use(tenantAuthMiddleware)

  /**
   * 1. GET ALL GIFT CARDS WITH TENANT ISOLATION & PAGINATION
   */
  .get(
    "/",
    async ({ tenantId, query }) => {
      const page = query.page ? parseInt(query.page as string) : 1;
      const limit = query.limit ? parseInt(query.limit as string) : 20;
      const skip = (page - 1) * limit;

      const whereCondition: any = {
        tenantId,
        ...(query.status ? { status: query.status as GiftCardStatus } : {}),
        ...(query.customerId ? { customerId: query.customerId as string } : {}),
        ...(query.search
          ? {
              cardNumber: {
                contains: query.search as string,
                mode: "insensitive",
              },
            }
          : {}),
      };

      const [total, giftCards] = await prisma.$transaction([
        prisma.giftCard.count({ where: whereCondition }),
        prisma.giftCard.findMany({
          where: whereCondition,
          include: {
            customer: { select: { id: true, name: true, code: true } },
            transactions: { take: 5, orderBy: { createdAt: "desc" } }, // နောက်ဆုံး Transaction ၅ ခုသာ တွဲပြမည်
          },
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
          status: t.Optional(t.String()), // Schema GiftCardStatus Enum
          customerId: t.Optional(t.String()),
          search: t.Optional(t.String()), // Gift Card နံပါတ်ဖြင့် ရှာဖွေရန်
        }),
      ),
    },
  )

  /**
   * 2. LOOKUP GIFT CARD BY CARD NUMBER
   */
  .get(
    "/lookup/:cardNumber",
    async ({ params: { cardNumber }, tenantId, set }) => {
      const giftCard = await prisma.giftCard.findFirst({
        where: {
          tenantId,
          cardNumber: cardNumber.trim().toUpperCase(),
        },
        include: {
          customer: { select: { id: true, name: true, phone: true } },
          transactions: { orderBy: { createdAt: "desc" }, take: 20 },
        },
      });

      if (!giftCard) {
        set.status = 404;
        return {
          success: false,
          message: "Gift card not found or invalid card number.",
        };
      }

      return { success: true, giftCard };
    },
    { params: t.Object({ cardNumber: t.String() }) },
  )

  /**
   * 3. POST: ISSUE NEW GIFT CARD (လက်ဆောင်ကတ်အသစ် ထုတ်ပေးခြင်း)
   */
  .post(
    "/",
    async ({ body, tenantId, userId, set }) => {
      const generatedCardNumber = body.cardNumber
        ? body.cardNumber.trim().toUpperCase()
        : `GC-${Date.now()}`;

      // စနစ်ထဲတွင် ကတ်နံပါတ် တူညီမှု ရှိမရှိ ကြိုတင်စစ်ဆေးခြင်း
      const existingCard = await prisma.giftCard.findFirst({
        where: { tenantId, cardNumber: generatedCardNumber },
      });

      if (existingCard) {
        set.status = 400;
        return {
          success: false,
          message: `Gift card number '${generatedCardNumber}' is already generated.`,
        };
      }

      try {
        const giftCardResult = await prisma.$transaction(async (tx) => {
          // (က) လက်ဆောင်ကတ်အသစ် ဆောက်ခြင်း
          const createdCard = await tx.giftCard.create({
            data: {
              tenantId,
              customerId: body.customerId ?? null,
              cardNumber: generatedCardNumber,
              pinCode: body.pinCode ? body.pinCode.trim() : null,
              initialAmount: body.initialAmount,
              currentBalance: body.initialAmount,
              expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
              status: GiftCardStatus.ACTIVE,
            },
          });

          // (ခ) ကတ်စတင်ထုတ်ပေးကြောင်း Ledger Transaction ထဲသို့ သွင်းခြင်း (ISSUE)
          await tx.giftCardTransaction.create({
            data: {
              tenantId,
              giftCardId: createdCard.id,
              amount: body.initialAmount,
              type: "ISSUE",
            },
          });

          // (ဂ) System Audit Log သမိုင်းမှတ်တမ်း သိမ်းဆည်းခြင်း
          await tx.auditLog.create({
            data: {
              tenantId,
              userId,
              action: "CREATE",
              entity: "GiftCard",
              entityId: createdCard.id,
              newData: JSON.parse(JSON.stringify(createdCard)),
            },
          });

          return createdCard;
        });

        set.status = 201;
        return {
          success: true,
          message: "Gift card issued successfully.",
          giftCard: giftCardResult,
        };
      } catch (error: any) {
        set.status = 400;
        return {
          success: false,
          message: error.message || "Failed to issue new gift card.",
        };
      }
    },
    {
      body: t.Object({
        initialAmount: t.Number({ minimum: 1 }), // အနည်းဆုံး ၁ ကျပ်/ဝမ်/ဒေါ်လာ နှင့်အထက် ဖြစ်ရမည်
        cardNumber: t.Optional(t.String()),
        pinCode: t.Optional(t.String()),
        customerId: t.Optional(t.String()),
        expiresAt: t.Optional(t.String()),
      }),
    },
  )

  /**
   * 4. POST: RELOAD GIFT CARD BALANCE (လက်ဆောင်ကတ်ထဲသို့ ငွေပြန်လည်ဖြည့်သွင်းခြင်း)
   */
  .post(
    "/:id/reload",
    async ({ params: { id }, body, tenantId, userId, set }) => {
      try {
        const giftCard = await prisma.$transaction(async (tx) => {
          // 🚨 လုံခြုံရေးအရ အဆိုပါ Gift Card သည် မိမိ Tenant ပိုင် ဟုတ်မဟုတ် အရင်စစ်ဆေးခြင်း
          const currentCard = await tx.giftCard.findFirst({
            where: { id, tenantId },
          });

          if (!currentCard) {
            throw new Error("Gift card not found or access denied.");
          }

          // (က) Balance တိုးမြှင့်ပြီး ကတ်အား Active ပြန်လုပ်ခြင်း
          const updated = await tx.giftCard.update({
            where: { id },
            data: {
              currentBalance: { increment: body.amount },
              status: GiftCardStatus.ACTIVE,
            },
          });

          // (ခ) ငွေဖြည့်သွင်းမှုမှတ်တမ်းအား ရေးသွင်းခြင်း (RELOAD)
          await tx.giftCardTransaction.create({
            data: {
              tenantId,
              giftCardId: updated.id,
              amount: body.amount,
              type: "RELOAD",
            },
          });

          // (ဂ) Audit Trail Track
          await tx.auditLog.create({
            data: {
              tenantId,
              userId,
              action: "UPDATE",
              entity: "GiftCard",
              entityId: id,
              oldData: JSON.parse(JSON.stringify(currentCard)),
              newData: JSON.parse(JSON.stringify(updated)),
            },
          });

          return updated;
        });

        set.status = 201;
        return {
          success: true,
          message: `Successfully reloaded balance by adding ${body.amount}.`,
          giftCard,
        };
      } catch (error: any) {
        set.status = 400;
        return {
          success: false,
          message: error.message || "Failed to reload gift card balance.",
        };
      }
    },
    {
      body: t.Object({ amount: t.Number({ minimum: 1 }) }),
      params: t.Object({ id: t.String() }),
    },
  )

  /**
   * 5. PATCH: UPDATE GIFT CARD STATUS (ကတ်အား ပိတ်သိမ်းခြင်း/ယာယီရပ်ဆိုင်းခြင်း)
   */
  .patch(
    "/:id/status",
    async ({ params: { id }, body, tenantId, userId, set }) => {
      // 🚨 အခြား Tenant မှ လှမ်းပိတ်၍မရအောင် Security Validation စစ်ဆေးခြင်း
      const currentCard = await prisma.giftCard.findFirst({
        where: { id, tenantId },
      });

      if (!currentCard) {
        set.status = 404;
        return {
          success: false,
          message: "Gift card not found or access denied.",
        };
      }

      const updatedCard = await prisma.$transaction(async (tx) => {
        const updated = await tx.giftCard.update({
          where: { id },
          data: { status: body.status as GiftCardStatus },
        });

        // Track Status Change in Logs
        await tx.auditLog.create({
          data: {
            tenantId,
            userId,
            action: "UPDATE",
            entity: "GiftCard",
            entityId: id,
            oldData: JSON.parse(JSON.stringify(currentCard)),
            newData: JSON.parse(JSON.stringify(updated)),
          },
        });

        return updated;
      });

      return {
        success: true,
        message: `Gift card status has been changed to '${body.status}'.`,
        giftCard: updatedCard,
      };
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({ status: t.String() }), // Schema GiftCardStatus Enum Mapping (ACTIVE, DISABLED, EXPIRED)
    },
  );

// import { Elysia, t } from "elysia";
// import { prisma } from "../lib/prisma";
// import { requireTenantId } from "../lib/tenant";
// import { giftCardStatusSchema } from "../lib/schemas";

// export const giftCardRoutes = new Elysia({
//   prefix: "/gift-cards",
// })
//   .get("/", async ({ query, set }) => {
//     const tenantId = requireTenantId({ query, set });
//     if (!tenantId) return { message: "tenantId is required" };

//     return prisma.giftCard.findMany({
//       where: {
//         tenantId,
//         ...(query.status ? { status: query.status as any } : {}),
//         ...(query.customerId ? { customerId: query.customerId } : {}),
//       },
//       include: {
//         customer: { select: { id: true, name: true, code: true } },
//         transactions: { take: 5, orderBy: { createdAt: "desc" } },
//       },
//       orderBy: { createdAt: "desc" },
//     });
//   })
//   .get("/lookup/:cardNumber", async ({ params, query, set }) => {
//     const tenantId = requireTenantId({ query, set });
//     if (!tenantId) return { message: "tenantId is required" };

//     const giftCard = await prisma.giftCard.findFirst({
//       where: { tenantId, cardNumber: params.cardNumber },
//       include: {
//         customer: true,
//         transactions: { orderBy: { createdAt: "desc" } },
//       },
//     });
//     if (!giftCard) {
//       set.status = 404;
//       return { message: "Gift card not found" };
//     }
//     return giftCard;
//   })
//   .post(
//     "/",
//     async ({ body, set }) => {
//       set.status = 201;
//       return prisma.$transaction(async (tx) => {
//         const giftCard = await tx.giftCard.create({
//           data: {
//             tenantId: body.tenantId,
//             customerId: body.customerId,
//             cardNumber: body.cardNumber || `GC-${Date.now()}`,
//             pinCode: body.pinCode,
//             initialAmount: body.initialAmount,
//             currentBalance: body.initialAmount,
//             expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
//             status: "ACTIVE",
//           },
//         });

//         await tx.giftCardTransaction.create({
//           data: {
//             tenantId: body.tenantId,
//             giftCardId: giftCard.id,
//             amount: body.initialAmount,
//             type: "ISSUE",
//           },
//         });

//         return giftCard;
//       });
//     },
//     {
//       body: t.Object({
//         tenantId: t.String(),
//         initialAmount: t.Number(),
//         cardNumber: t.Optional(t.String()),
//         pinCode: t.Optional(t.String()),
//         customerId: t.Optional(t.String()),
//         expiresAt: t.Optional(t.String()),
//       }),
//     },
//   )
//   .post(
//     "/:id/reload",
//     async ({ params, body, set }) => {
//       const giftCard = await prisma.$transaction(async (tx) => {
//         const updated = await tx.giftCard.update({
//           where: { id: params.id },
//           data: {
//             currentBalance: { increment: body.amount },
//             status: "ACTIVE",
//           },
//         });

//         await tx.giftCardTransaction.create({
//           data: {
//             tenantId: updated.tenantId,
//             giftCardId: updated.id,
//             amount: body.amount,
//             type: "RELOAD",
//           },
//         });

//         return updated;
//       });

//       set.status = 201;
//       return giftCard;
//     },
//     {
//       body: t.Object({ amount: t.Number() }),
//     },
//   )
//   .patch(
//     "/:id/status",
//     async ({ params, body }) => {
//       return prisma.giftCard.update({
//         where: { id: params.id },
//         data: { status: body.status },
//       });
//     },
//     {
//       body: t.Object({ status: giftCardStatusSchema }),
//     },
//   );
