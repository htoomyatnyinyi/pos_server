import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";

export const sessionRoutes = new Elysia({
  prefix: "/sessions",
})
  .get("/", async () => {
    return prisma.session.findMany({
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
  .get("/active/:userId", async ({ params }) => {
    return prisma.session.findFirst({
      where: {
        userId: params.userId,
        status: "OPEN",
      },
    });
  })
  .post(
    "/open",
    async ({ body }) => {
      // Close any existing open sessions for this user first?
      // For now, just create a new one.
      return prisma.session.create({
        data: {
          userId: body.userId,
          openingBalance: body.openingBalance,
          status: "OPEN",
        },
      });
    },
    {
      body: t.Object({
        userId: t.String(),
        openingBalance: t.Number(),
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
        expectedBalance: t.Number(),
        discrepancy: t.Number(),
        cashSales: t.Number(),
        cardSales: t.Number(),
        digitalSales: t.Number(),
        notes: t.Optional(t.String()),
      }),
    },
  );
