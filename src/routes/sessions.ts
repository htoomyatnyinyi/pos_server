import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";

export const sessionRoutes = new Elysia({
  prefix: "/sessions",
})
  .get("/", async ({ query }) => {
    const where: any = {};
    if (query.storeId) {
      where.storeId = query.storeId;
    }

    return prisma.session.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        openedAt: "desc",
      },
    });
  })
  .get("/active/:userId", async ({ params, query }) => {
    const where: any = {
      userId: params.userId,
      status: "OPEN",
    };
    if (query.storeId) {
      where.storeId = query.storeId;
    }
    return prisma.session.findFirst({
      where,
    });
  })
  .post(
    "/open",
    async ({ body, set }) => {
      let storeId = body.storeId;
      
      // Auto-detect store if not provided
      if (!storeId) {
        console.log(`[SESSION] No storeId provided for user ${body.userId}, attempting auto-detection...`);
        const userWithStores = await prisma.user.findUnique({
          where: { id: body.userId },
          include: { stores: { take: 1 } }
        });
        
        if (userWithStores?.stores?.[0]) {
          storeId = userWithStores.stores[0].storeId;
          console.log(`[SESSION] Auto-detected store: ${storeId}`);
        }
      }

      console.log(`[SESSION] Opening shift for user: ${body.userId} in store: ${storeId}`);
      try {
        const session = await prisma.session.create({
          data: {
            userId: body.userId,
            openingBalance: body.openingBalance,
            storeId: storeId,
            status: "OPEN",
          },
        });
        console.log(`[SESSION] Shift opened successfully: ${session.id}`);
        set.status = 201;
        return session;
      } catch (error: any) {
        console.error(`[SESSION] Failed to open shift:`, error);
        set.status = 500;
        return { message: "Failed to open shift", error: error.message };
      }
    },
    {
      body: t.Object({
        userId: t.String(),
        openingBalance: t.Number(),
        storeId: t.Optional(t.String()),
        notes: t.Optional(t.String()),
      }),
    },
  )
  .post(
    "/:id/close",
    async ({ params, body, set }) => {
      set.status = 201;
      return prisma.session.update({
        where: { id: params.id },
        data: {
          closedAt: new Date(),
          closingBalance: body.closingBalance,
          expectedBalance: body.expectedBalance,
          discrepancy: body.discrepancy,
          cashSales: body.cashSales,
          cardSales: body.cardSales,
          digitalSales: body.digitalSales,
          notes: body.notes,
          status: "CLOSED",
        },
      });
    },
    {
      body: t.Object({
        closingBalance: t.Number(),
        expectedBalance: t.Optional(t.Number()),
        discrepancy: t.Optional(t.Number()),
        cashSales: t.Optional(t.Number()),
        cardSales: t.Optional(t.Number()),
        digitalSales: t.Optional(t.Number()),
        notes: t.Optional(t.String()),
      }),
    },
  );
