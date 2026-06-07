import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";
import { requireTenantId } from "../lib/tenant";

export const expenseRoutes = new Elysia({
  prefix: "/expenses",
})
  .group("/categories", (app) =>
    app
      .get("/", async ({ query, set }) => {
        const tenantId = requireTenantId({ query, set });
        if (!tenantId) return { message: "tenantId is required" };

        return prisma.expenseCategory.findMany({
          where: { tenantId, deletedAt: null },
          orderBy: { name: "asc" },
        });
      })
      .post(
        "/",
        async ({ body, set }) => {
          set.status = 201;
          return prisma.expenseCategory.create({
            data: {
              tenantId: body.tenantId,
              name: body.name,
              description: body.description,
            },
          });
        },
        {
          body: t.Object({
            tenantId: t.String(),
            name: t.String(),
            description: t.Optional(t.String()),
          }),
        },
      )
      .put(
        "/:id",
        async ({ params, body }) => {
          return prisma.expenseCategory.update({
            where: { id: params.id },
            data: body,
          });
        },
        {
          body: t.Partial(
            t.Object({
              name: t.Optional(t.String()),
              description: t.Optional(t.String()),
              isActive: t.Optional(t.Boolean()),
            }),
          ),
        },
      )
      .delete("/:id", async ({ params }) => {
        return prisma.expenseCategory.update({
          where: { id: params.id },
          data: { deletedAt: new Date(), isActive: false },
        });
      }),
  )
  .get("/", async ({ query, set }) => {
    const tenantId = requireTenantId({ query, set });
    if (!tenantId) return { message: "tenantId is required" };

    return prisma.expense.findMany({
      where: {
        tenantId,
        ...(query.storeId ? { storeId: query.storeId } : {}),
        ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      },
      include: {
        category: true,
        store: true,
        createdBy: { select: { id: true, name: true } },
      },
      orderBy: { expenseDate: "desc" },
    });
  })
  .get("/:id", async ({ params, set }) => {
    const expense = await prisma.expense.findUnique({
      where: { id: params.id },
      include: { category: true, store: true, createdBy: true },
    });
    if (!expense) {
      set.status = 404;
      return { message: "Expense not found" };
    }
    return expense;
  })
  .post(
    "/",
    async ({ body, set }) => {
      set.status = 201;
      return prisma.expense.create({
        data: {
          tenantId: body.tenantId,
          storeId: body.storeId,
          categoryId: body.categoryId,
          amount: body.amount,
          description: body.description,
          receiptUrl: body.receiptUrl,
          expenseDate: body.expenseDate ? new Date(body.expenseDate) : new Date(),
          createdById: body.userId,
        },
      });
    },
    {
      body: t.Object({
        tenantId: t.String(),
        categoryId: t.String(),
        amount: t.Number(),
        userId: t.String(),
        storeId: t.Optional(t.String()),
        description: t.Optional(t.String()),
        receiptUrl: t.Optional(t.String()),
        expenseDate: t.Optional(t.String()),
      }),
    },
  )
  .put(
    "/:id",
    async ({ params, body }) => {
      return prisma.expense.update({
        where: { id: params.id },
        data: {
          ...body,
          expenseDate: body.expenseDate ? new Date(body.expenseDate) : undefined,
        },
      });
    },
    {
      body: t.Partial(
        t.Object({
          storeId: t.Optional(t.String()),
          categoryId: t.Optional(t.String()),
          amount: t.Optional(t.Number()),
          description: t.Optional(t.String()),
          receiptUrl: t.Optional(t.String()),
          expenseDate: t.Optional(t.String()),
        }),
      ),
    },
  )
  .delete("/:id", async ({ params }) => {
    return prisma.expense.delete({ where: { id: params.id } });
  });
