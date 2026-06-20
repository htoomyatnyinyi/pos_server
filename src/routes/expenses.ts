import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";
import { tenantAuthMiddleware } from "../../middlewares/tenantAuthMiddleware";

export const expenseRoutes = new Elysia({
  prefix: "/expenses",
})
  .use(tenantAuthMiddleware)

  // --- EXPENSE CATEGORIES GROUP ---
  .group("/categories", (app) =>
    app
      .get("/", async ({ tenantId }) => {
        return prisma.expenseCategory.findMany({
          where: { tenantId, deletedAt: null },
          orderBy: { name: "asc" },
        });
      })
      .post(
        "/",
        async ({ body, tenantId }) => {
          return prisma.expenseCategory.create({
            data: { tenantId, ...body },
          });
        },
        {
          body: t.Object({
            name: t.String(),
            description: t.Optional(t.String()),
          }),
        },
      )
      .put(
        "/:id",
        async ({ params: { id }, body, tenantId }) => {
          return prisma.expenseCategory.update({
            where: { id, tenantId },
            data: {
              name: body.name ?? undefined,
              description: body.description ?? undefined,
            },
          });
        },
        {
          body: t.Partial(
            t.Object({ name: t.String(), description: t.String() }),
          ),
        },
      )
      .delete("/:id", async ({ params: { id }, tenantId }) => {
        return prisma.expenseCategory.update({
          where: { id, tenantId },
          data: { deletedAt: new Date() },
        });
      }),
  )

  // --- EXPENSES CORE ---
  .get("/", async ({ tenantId, query }) => {
    return prisma.expense.findMany({
      where: {
        tenantId,
        deletedAt: null,
        ...(query.storeId ? { storeId: query.storeId as string } : {}),
        ...(query.categoryId ? { categoryId: query.categoryId as string } : {}),
      },
      include: { category: true, store: true },
      orderBy: { expenseDate: "desc" },
    });
  })
  .post(
    "/",
    async ({ body, tenantId, userId, set }) => {
      const expense = await prisma.expense.create({
        data: {
          tenantId,
          storeId: body.storeId,
          categoryId: body.categoryId,
          amount: body.amount,
          description: body.description,
          receiptUrl: body.receiptUrl,
          expenseDate: body.expenseDate
            ? new Date(body.expenseDate)
            : new Date(),
          createdById: userId,
        },
      });
      set.status = 201;
      return expense;
    },
    {
      body: t.Object({
        categoryId: t.String(),
        amount: t.Number(),
        storeId: t.Optional(t.String()),
        description: t.Optional(t.String()),
        receiptUrl: t.Optional(t.String()),
        expenseDate: t.Optional(t.String()),
      }),
    },
  )
  .put(
    "/:id",
    async ({ params: { id }, body, tenantId, userId }) => {
      const current = await prisma.expense.findFirst({
        where: { id, tenantId },
      });
      if (!current) throw new Error("Expense not found");

      return prisma.$transaction(async (tx) => {
        const updated = await tx.expense.update({
          where: { id },
          data: {
            storeId: body.storeId ?? undefined,
            categoryId: body.categoryId ?? undefined,
            amount: body.amount ?? undefined,
            description: body.description ?? undefined,
            receiptUrl: body.receiptUrl ?? undefined,
            expenseDate: body.expenseDate
              ? new Date(body.expenseDate)
              : undefined,
          },
        });

        await tx.auditLog.create({
          data: {
            tenantId,
            userId,
            action: "UPDATE",
            entity: "Expense",
            entityId: id,
            oldData: JSON.parse(JSON.stringify(current)),
            newData: JSON.parse(JSON.stringify(updated)),
          },
        });
        return updated;
      });
    },
    {
      body: t.Partial(
        t.Object({
          storeId: t.String(),
          categoryId: t.String(),
          amount: t.Number(),
          description: t.String(),
          receiptUrl: t.String(),
          expenseDate: t.String(),
        }),
      ),
    },
  )
  .delete("/:id", async ({ params: { id }, tenantId, userId }) => {
    return prisma.$transaction(async (tx) => {
      const deleted = await tx.expense.update({
        where: { id, tenantId },
        data: { deletedAt: new Date() },
      });

      await tx.auditLog.create({
        data: {
          tenantId,
          userId,
          action: "DELETE",
          entity: "Expense",
          entityId: id,
          oldData: JSON.parse(JSON.stringify(deleted)),
        },
      });
      return { success: true };
    });
  });
