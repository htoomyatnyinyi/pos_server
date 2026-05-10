import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";

export const promotionRoutes = new Elysia({
  prefix: "/promotions",
})
  .get("/", async () => {
    return prisma.promotion.findMany({
      include: {
        products: {
          include: {
            product: true,
          },
        },
        categories: {
          include: {
            category: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });
  })
  .get("/:id", async ({ params, set }) => {
    const promotion = await prisma.promotion.findUnique({
      where: { id: params.id },
      include: {
        products: {
          include: {
            product: true,
          },
        },
        categories: {
          include: {
            category: true,
          },
        },
      },
    });
    if (!promotion) { set.status = 404; return "Promotion not found"; }return promotion;
  })
  .post(
    "/",
    async ({ body, set }) => {
      set.status = 201;
      return prisma.promotion.create({
        data: {
          code: body.code,
          name: body.name,
          description: body.description,
          discountType: body.discountType,
          discountValue: body.discountValue,
          minPurchase: body.minPurchase,
          startDate: new Date(body.startDate),
          endDate: new Date(body.endDate),
          usageLimit: body.usageLimit,
          perUserLimit: body.perUserLimit,
          isActive: body.isActive ?? true,
          products: body.productIds ? {
            create: body.productIds.map((id) => ({
              productId: id,
            })),
          } : undefined,
          categories: body.categoryIds ? {
            create: body.categoryIds.map((id) => ({
              categoryId: id,
            })),
          } : undefined,
        },
      });
    },
    {
      body: t.Object({
        code: t.String(),
        name: t.String(),
        description: t.Optional(t.String()),
        discountType: t.String(),
        discountValue: t.Number(),
        minPurchase: t.Optional(t.Number()),
        startDate: t.String(),
        endDate: t.String(),
        usageLimit: t.Optional(t.Integer()),
        perUserLimit: t.Optional(t.Integer()),
        isActive: t.Optional(t.Boolean()),
        productIds: t.Optional(t.Array(t.String())),
        categoryIds: t.Optional(t.Array(t.String())),
      }),
    },
  )
  .put(
    "/:id",
    async ({ params, body }) => {
      // Simplistic update - in reality, updating relations might need more care
      return prisma.promotion.update({
        where: { id: params.id },
        data: {
          ...body,
          startDate: body.startDate ? new Date(body.startDate) : undefined,
          endDate: body.endDate ? new Date(body.endDate) : undefined,
        },
      });
    },
    {
      body: t.Partial(
        t.Object({
          code: t.String(),
          name: t.String(),
          description: t.String(),
          discountType: t.String(),
          discountValue: t.Number(),
          minPurchase: t.Number(),
          startDate: t.String(),
          endDate: t.String(),
          usageLimit: t.Integer(),
          perUserLimit: t.Integer(),
          isActive: t.Boolean(),
        }),
      ),
    },
  )
  .delete("/:id", async ({ params }) => {
    return prisma.promotion.delete({
      where: { id: params.id },
    });
  });
