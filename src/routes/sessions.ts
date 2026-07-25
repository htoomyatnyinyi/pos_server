import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";
import { tenantAuthMiddleware } from "../../middlewares/tenantAuthMiddleware";
import { Decimal } from "@prisma/client/runtime/client";
import { validateStore, requireRoles } from "../lib/security";

export const sessionRoutes = new Elysia({ prefix: "/sessions" })
  .use(tenantAuthMiddleware)

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

  .get(
    "/active/:userId",
    async ({
      params: { userId },
      tenantId,
      query,
      set,
      userId: currentUserId,
      role,
    }) => {
      // Restrict: only self or admin/manager
      if (
        userId !== currentUserId &&
        !["ADMIN", "MANAGER", "SUPER_ADMIN"].includes(role)
      ) {
        set.status = 403;
        return {
          success: false,
          message: "Forbidden: You can only view your own session.",
        };
      }
      // Ensure user belongs to tenant
      const userExists = await prisma.user.findFirst({
        where: { id: userId, tenantId },
      });
      if (!userExists) {
        set.status = 404;
        return { success: false, message: "User not found." };
      }
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

  .post(
    "/open",
    async ({ body, tenantId, userId, set }) => {
      let storeId = body.storeId;
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
      await validateStore(storeId, tenantId);

      const existingActiveSession = await prisma.session.findFirst({
        where: {
          tenantId,
          userId,
          storeId,
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

      const session = await prisma.$transaction(async (tx: any) => {
        const created = await tx.session.create({
          data: {
            tenantId,
            userId,
            openingBalance: body.openingBalance,
            storeId,
            registerId: body.registerId ?? null,
            status: "OPEN",
            notes: body.notes,
            openedAt: new Date(),
          },
        });
        await tx.auditLog.create({
          data: {
            tenantId,
            userId,
            action: "CREATE",
            entity: "Session",
            entityId: created.id,
            newData: JSON.parse(JSON.stringify(created)),
          },
        });
        return created;
      });

      set.status = 201;
      return {
        success: true,
        message: "Cash register session opened successfully.",
        session,
      };
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

  .post(
    "/:id/close",
    async ({ params: { id }, body, tenantId, userId, set }) => {
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

      const finalCashSales = body.cashSales ?? currentSession.cashSales;
      const finalCardSales = body.cardSales ?? currentSession.cardSales;
      const finalDigitalSales =
        body.digitalSales ?? currentSession.digitalSales;

      const computedExpected =
        body.expectedBalance ??
        new Decimal(currentSession.openingBalance)
          .plus(finalCashSales)
          .toNumber();

      const computedDiscrepancy =
        body.discrepancy ?? body.closingBalance - computedExpected;

      const closedSession = await prisma.$transaction(async (tx: any) => {
        const updated = await tx.session.update({
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
        await tx.auditLog.create({
          data: {
            tenantId,
            userId,
            action: "UPDATE",
            entity: "Session",
            entityId: id,
            oldData: JSON.parse(JSON.stringify(currentSession)),
            newData: JSON.parse(JSON.stringify(updated)),
          },
        });
        return updated;
      });

      return {
        success: true,
        message:
          "Session closed successfully and financial discrepancy calculated.",
        session: closedSession,
      };
    },
    {
      params: t.Object({ id: t.String() }),
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
