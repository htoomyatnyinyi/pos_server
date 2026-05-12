import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";

export const productRoutes = new Elysia({
  prefix: "/products",
})
  .get("/", async () => {
    return prisma.product.findMany({
      orderBy: {
        createdAt: "desc",
      },
    });
  })
  .get("/barcode/:barcode", async ({ params, set }) => {
    const product = await prisma.product.findUnique({
      where: { barcode: params.barcode },
      include: { category: true },
    });
    if (!product) {
      set.status = 404;
      return { found: false, message: "No product found with this barcode" };
    }
    return { found: true, product };
  })
  .get("/:id", async ({ params, set }) => {
    const product = await prisma.product.findUnique({
      where: {
        id: params.id,
      },
    });
    if (!product) { set.status = 404; return "Product not found"; }return product;
  })
  .post(
    "/",
    async ({ body, set }) => {
      set.status = 201;
      return prisma.product.create({
        data: {
          sku: body.sku,
          barcode: body.barcode,
          name: body.name,
          description: body.description,
          brand: body.brand,
          costPrice: body.costPrice,
          sellingPrice: body.sellingPrice,
          stockQuantity: body.stockQuantity,
          categoryId: body.categoryId,
          supplierId: body.supplierId,
        },
      });
    },
    {
      body: t.Object({
        sku: t.String(),
        barcode: t.Optional(t.String()),
        name: t.String(),
        description: t.Optional(t.String()),
        brand: t.Optional(t.String()),
        costPrice: t.Number(),
        sellingPrice: t.Number(),
        stockQuantity: t.Integer(),
        categoryId: t.String(),
        supplierId: t.Optional(t.String()),
      }),
    },
  )
  .put(
    "/:id",
    async ({ params, body }) => {
      return prisma.product.update({
        where: { id: params.id },
        data: {
          sku: body.sku,
          barcode: body.barcode,
          name: body.name,
          description: body.description,
          brand: body.brand,
          costPrice: body.costPrice,
          sellingPrice: body.sellingPrice,
          stockQuantity: body.stockQuantity,
          categoryId: body.categoryId,
          supplierId: body.supplierId,
        },
      });
    },
    {
      body: t.Partial(
        t.Object({
          sku: t.String(),
          barcode: t.String(),
          name: t.String(),
          description: t.String(),
          brand: t.String(),
          costPrice: t.Number(),
          sellingPrice: t.Number(),
          stockQuantity: t.Integer(),
          categoryId: t.String(),
          supplierId: t.String(),
        }),
      ),
    },
  )
  .delete("/:id", async ({ params }) => {
    return prisma.product.delete({
      where: { id: params.id },
    });
  });
