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
