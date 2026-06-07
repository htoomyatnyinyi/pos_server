import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";
import { requireTenantId } from "../lib/tenant";
import { discountTypeSchema } from "../lib/schemas";

export const promotionRoutes = new Elysia({
  prefix: "/promotions",
})
  .get("/", async ({ query, set }) => {
    const tenantId = requireTenantId({ query, set });
    if (!tenantId) return { message: "tenantId is required" };

    return prisma.promotion.findMany({
      where: { tenantId, deletedAt: null },
      include: {
        products: { include: { product: true } },
        categories: { include: { category: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  })
  .get("/:id", async ({ params, set }) => {
    const promotion = await prisma.promotion.findUnique({
      where: { id: params.id },
      include: {
        products: { include: { product: true } },
        categories: { include: { category: true } },
      },
    });
    if (!promotion) {
      set.status = 404;
      return { message: "Promotion not found" };
    }
    return promotion;
  })
  .post(
    "/",
    async ({ body, set }) => {
      set.status = 201;
      return prisma.promotion.create({
        data: {
          tenantId: body.tenantId,
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
          products: body.productIds
            ? { create: body.productIds.map((productId) => ({ productId })) }
            : undefined,
          categories: body.categoryIds
            ? { create: body.categoryIds.map((categoryId) => ({ categoryId })) }
            : undefined,
        },
      });
    },
    {
      body: t.Object({
        tenantId: t.String(),
        code: t.String(),
        name: t.String(),
        description: t.Optional(t.String()),
        discountType: discountTypeSchema,
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
          discountType: discountTypeSchema,
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
    return prisma.promotion.update({
      where: { id: params.id },
      data: { deletedAt: new Date(), isActive: false },
    });
  });
