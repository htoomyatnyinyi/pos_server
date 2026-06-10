import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";
import { requireTenantId } from "../lib/tenant";

export const sessionRoutes = new Elysia({
  prefix: "/sessions",
})
  .get("/", async ({ query, set }) => {
    const tenantId = requireTenantId({ query, set });
    if (!tenantId) return { message: "tenantId is required" };

    return prisma.session.findMany({
      where: {
        tenantId,
        ...(query.storeId ? { storeId: query.storeId } : {}),
      },
      include: {
        user: { select: { id: true, name: true } },
        register: true,
        store: true,
      },
      orderBy: { openedAt: "desc" },
    });
  })
  .get("/active/:userId", async ({ params, query, set }) => {
    const tenantId = requireTenantId({ query, set });
    if (!tenantId) return { message: "tenantId is required" };

    return prisma.session.findFirst({
      where: {
        tenantId,
        userId: params.userId,
        status: "OPEN",
        ...(query.storeId ? { storeId: query.storeId } : {}),
      },
      include: { register: true, store: true },
    });
  })
  .post(
    "/open",
    async ({ body, set }) => {
      console.log(body, "body");
      let storeId = body.storeId;

      if (!storeId) {
        const userWithStores = await prisma.user.findUnique({
          where: { id: body.userId },
          include: { stores: { take: 1 } },
        });
        storeId = userWithStores?.stores?.[0]?.storeId;
      }

      if (!storeId) {
        set.status = 400;
        return { message: "storeId is required" };
      }

      const session = await prisma.session.create({
        data: {
          tenantId: body.tenantId,
          userId: body.userId,
          openingBalance: body.openingBalance,
          storeId,
          registerId: body.registerId,
          status: "OPEN",
          notes: body.notes,
        },
      });

      set.status = 201;
      return session;
    },
    {
      body: t.Object({
        tenantId: t.String(),
        userId: t.String(),
        openingBalance: t.Number(),
        storeId: t.Optional(t.String()),
        registerId: t.Optional(t.String()),
        notes: t.Optional(t.String()),
      }),
    },
  )
  .post(
    "/:id/close",
    async ({ params, body }) => {
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
