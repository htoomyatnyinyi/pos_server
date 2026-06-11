import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";
import { tenantAuthMiddleware } from "../../middlewares/tenantAuthMiddleware";
import { Decimal } from "@prisma/client/runtime/client";

export const sessionRoutes = new Elysia({
  prefix: "/sessions",
})
  // 🔐 Multi-Tenant Authentication Middleware ချိတ်ဆက်ခြင်း
  .use(tenantAuthMiddleware)

  /**
   * 1. GET ALL SESSIONS WITH TENANT ISOLATION
   */
  .get(
    "/",
    async ({ tenantId, query }) => {
      const page = query.page ? parseInt(query.page as string) : 1;
      const limit = query.limit ? parseInt(query.limit as string) : 20;
      const skip = (page - 1) * limit;

      const whereCondition: any = {
        tenantId,
        ...(query.storeId ? { storeId: query.storeId as string } : {}),
        ...(query.status ? { status: query.status as string } : {}),
      };

      const [total, sessions] = await prisma.$transaction([
        prisma.session.count({ where: whereCondition }),
        prisma.session.findMany({
          where: whereCondition,
          include: {
            user: { select: { id: true, name: true, email: true } },
            register: true,
            store: true,
          },
          orderBy: { openedAt: "desc" },
          skip,
          take: limit,
        }),
      ]);

      return {
        success: true,
        meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
        sessions,
      };
    },
    {
      query: t.Optional(
        t.Object({
          page: t.Optional(t.String()),
          limit: t.Optional(t.String()),
          storeId: t.Optional(t.String()),
          status: t.Optional(t.String()),
        }),
      ),
    },
  )

  /**
   * 2. GET ACTIVE SESSION FOR CURRENT LOGGED IN USER
   * PATH: /api/tenant/sessions/active/:userId
   */
  .get(
    "/active/:userId",
    async ({ params: { userId }, tenantId, query, set }) => {
      const session = await prisma.session.findFirst({
        where: {
          tenantId,
          userId,
          status: "OPEN",
          ...(query.storeId ? { storeId: query.storeId as string } : {}),
        },
        include: { register: true, store: true },
      });

      if (!session) {
        set.status = 404;
        return {
          success: false,
          message: "No active register session found for this user.",
        };
      }

      return { success: true, session };
    },
    {
      params: t.Object({ userId: t.String() }),
      query: t.Optional(t.Object({ storeId: t.Optional(t.String()) })),
    },
  )

  /**
   * 3. POST: OPEN CASH REGISTER SESSION (ငွေသိမ်းကောင်တာ အဖွင့်စာရင်းသွင်းခြင်း)
   */
  .post(
    "/open",
    async ({ body, tenantId, userId, set }) => {
      // ၁။ 🚨 ဖွင့်လက်စ ကောင်တာစာရင်း ရှိမရှိ အရင်စစ်ဆေးခြင်း (Double Open Guard)
      const existingActiveSession = await prisma.session.findFirst({
        where: {
          tenantId,
          userId,
          status: "OPEN",
        },
      });

      if (existingActiveSession) {
        set.status = 400;
        return {
          success: false,
          message:
            "You already have an active session open. Please close it first.",
          sessionId: existingActiveSession.id,
        };
      }

      let storeId = body.storeId;

      // ၂။ Store ID မပါလာပါက User ချိတ်ဆက်ထားသော ဆိုင်ခွဲကို Auto ရှာဖွေခြင်း
      if (!storeId) {
        const userWithStores = await prisma.user.findUnique({
          where: { id: userId },
          include: { stores: { take: 1 } },
        });
        storeId = userWithStores?.stores?.[0]?.storeId;
      }

      if (!storeId) {
        set.status = 400;
        return {
          success: false,
          message: "storeId is required to open a register session.",
        };
      }

      return await prisma.$transaction(async (tx) => {
        const session = await tx.session.create({
          data: {
            tenantId,
            userId, // Auth Middleware မှရရှိလာသော Cashier User ID
            openingBalance: body.openingBalance,
            storeId,
            registerId: body.registerId ?? null,
            status: "OPEN",
            notes: body.notes,
            openedAt: new Date(),
          },
        });

        // Audit Log မှတ်တမ်းတင်ခြင်း
        await tx.auditLog.create({
          data: {
            tenantId,
            userId,
            action: "CREATE",
            entity: "Session",
            entityId: session.id,
            newData: JSON.parse(JSON.stringify(session)),
          },
        });

        set.status = 201;
        return {
          success: true,
          message: "Cash register session opened successfully.",
          session,
        };
      });
    },
    {
      body: t.Object({
        openingBalance: t.Number(),
        storeId: t.Optional(t.String()),
        registerId: t.Optional(t.String()),
        notes: t.Optional(t.String()),
      }),
    },
  )

  /**
   * 4. POST: CLOSE REGISTER SESSION (အရောင်းစာရင်းများ တွက်ချက်၍ နေ့စဉ်ကောင်တာပိတ်ခြင်း)
   */
  .post(
    "/:id/close",
    async ({ params: { id }, body, tenantId, userId, set }) => {
      // ၁။ ပိတ်မည့် Session ရှိမရှိ စစ်ဆေးခြင်း
      const currentSession = await prisma.session.findFirst({
        where: { id, tenantId, status: "OPEN" },
      });

      if (!currentSession) {
        set.status = 404;
        return {
          success: false,
          message: "Open session not found or already closed.",
        };
      }

      return await prisma.$transaction(async (tx) => {
        // ၂။ 💡 ခေါ်ယူမထားပါက လက်ရှိ DB ထဲက အရောင်းတန်ဖိုးများကို Dynamic ယူသုံးခြင်း
        const finalCashSales = body.cashSales ?? currentSession.cashSales;
        const finalCardSales = body.cardSales ?? currentSession.cardSales;
        const finalDigitalSales =
          body.digitalSales ?? currentSession.digitalSales;

        // ၃။ Auto Expected Balance Calculator (မျှော်မှန်းထားသော ငွေသားပမာဏ တွက်ချက်မှု Logic)
        // Formula: မျှော်မှန်းငွေ = အဖွင့်ငွေ + Cash အရောင်းတန်ဖိုး (အသုံးစရိတ်များရှိပါက နှုတ်ရန်)
        // const computedExpected =
        //   body.expectedBalance ??
        //   currentSession.openingBalance + finalCashSales;
        // 💡 ရှင်းလင်းချက် - currentSession.openingBalance က Decimal ဖြစ်နေပါက
        // ရိုးရိုး + အစား .plus() ကို သုံးပြီး finalCashSales (number သို့မဟုတ် Decimal) ကို လှမ်းပေါင်းရပါမည်
        const computedExpected =
          body.expectedBalance ??
          new Decimal(currentSession.openingBalance)
            .plus(finalCashSales)
            .toNumber();

        // ကွာဟချက် ရှာဖွေခြင်း (Discrepancy = ကောင်တာထဲရှိငွေအမှန် - စနစ်ကတွက်ပေးသောငွေ)
        const computedDiscrepancy =
          body.discrepancy ?? body.closingBalance - computedExpected;

        const closedSession = await tx.session.update({
          where: { id },
          data: {
            closedAt: new Date(),
            closingBalance: body.closingBalance,
            expectedBalance: computedExpected,
            discrepancy: computedDiscrepancy,
            cashSales: finalCashSales,
            cardSales: finalCardSales,
            digitalSales: finalDigitalSales,
            notes: body.notes,
            status: "CLOSED",
          },
        });

        // Create System Audit Log
        await tx.auditLog.create({
          data: {
            tenantId,
            userId,
            action: "UPDATE",
            entity: "Session",
            entityId: id,
            oldData: JSON.parse(JSON.stringify(currentSession)),
            newData: JSON.parse(JSON.stringify(closedSession)),
          },
        });

        return {
          success: true,
          message:
            "Session closed successfully and financial discrepancy calculated.",
          session: closedSession,
        };
      });
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        closingBalance: t.Number(), // 👈 ညနေပိုင်း ကောင်တာပိတ်ချိန် လက်ထဲတွင် လက်တွေ့ရေတွက်လို့ရသော ငွေသားပမာဏ
        expectedBalance: t.Optional(t.Number()),
        discrepancy: t.Optional(t.Number()),
        cashSales: t.Optional(t.Number()),
        cardSales: t.Optional(t.Number()),
        digitalSales: t.Optional(t.Number()),
        notes: t.Optional(t.String()),
      }),
    },
  );
// import { Elysia, t } from "elysia";
// import { prisma } from "../lib/prisma";
// import { requireTenantId } from "../lib/tenant";

// export const sessionRoutes = new Elysia({
//   prefix: "/sessions",
// })
//   .get("/", async ({ query, set }) => {
//     const tenantId = requireTenantId({ query, set });
//     if (!tenantId) return { message: "tenantId is required" };

//     return prisma.session.findMany({
//       where: {
//         tenantId,
//         ...(query.storeId ? { storeId: query.storeId } : {}),
//       },
//       include: {
//         user: { select: { id: true, name: true } },
//         register: true,
//         store: true,
//       },
//       orderBy: { openedAt: "desc" },
//     });
//   })
//   .get("/active/:userId", async ({ params, query, set }) => {
//     const tenantId = requireTenantId({ query, set });
//     if (!tenantId) return { message: "tenantId is required" };

//     return prisma.session.findFirst({
//       where: {
//         tenantId,
//         userId: params.userId,
//         status: "OPEN",
//         ...(query.storeId ? { storeId: query.storeId } : {}),
//       },
//       include: { register: true, store: true },
//     });
//   })
//   .post(
//     "/open",
//     async ({ body, set }) => {
//       console.log(body, "body");
//       let storeId = body.storeId;

//       if (!storeId) {
//         const userWithStores = await prisma.user.findUnique({
//           where: { id: body.userId },
//           include: { stores: { take: 1 } },
//         });
//         storeId = userWithStores?.stores?.[0]?.storeId;
//       }

//       if (!storeId) {
//         set.status = 400;
//         return { message: "storeId is required" };
//       }

//       const session = await prisma.session.create({
//         data: {
//           tenantId: body.tenantId,
//           userId: body.userId,
//           openingBalance: body.openingBalance,
//           storeId,
//           registerId: body.registerId,
//           status: "OPEN",
//           notes: body.notes,
//         },
//       });

//       set.status = 201;
//       return session;
//     },
//     {
//       body: t.Object({
//         tenantId: t.String(),
//         userId: t.String(),
//         openingBalance: t.Number(),
//         storeId: t.Optional(t.String()),
//         registerId: t.Optional(t.String()),
//         notes: t.Optional(t.String()),
//       }),
//     },
//   )
//   .post(
//     "/:id/close",
//     async ({ params, body }) => {
//       return prisma.session.update({
//         where: { id: params.id },
//         data: {
//           closedAt: new Date(),
//           closingBalance: body.closingBalance,
//           expectedBalance: body.expectedBalance,
//           discrepancy: body.discrepancy,
//           cashSales: body.cashSales,
//           cardSales: body.cardSales,
//           digitalSales: body.digitalSales,
//           notes: body.notes,
//           status: "CLOSED",
//         },
//       });
//     },
//     {
//       body: t.Object({
//         closingBalance: t.Number(),
//         expectedBalance: t.Optional(t.Number()),
//         discrepancy: t.Optional(t.Number()),
//         cashSales: t.Optional(t.Number()),
//         cardSales: t.Optional(t.Number()),
//         digitalSales: t.Optional(t.Number()),
//         notes: t.Optional(t.String()),
//       }),
//     },
//   );
