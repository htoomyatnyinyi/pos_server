import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";

export const productRoutes = new Elysia({
  prefix: "/products",
})
  .get("/", async ({ query }) => {
    return prisma.product.findMany({
      where: {
        storeId: (query.storeId as string) || undefined,
      },
      include: {
        category: true,
        supplier: true,
        // variants: true,
        variantsOption: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });
  })
  .get("/barcode/:barcode", async ({ params, set }) => {
    const product = await prisma.product.findUnique({
      where: { barcode: params.barcode },
      include: { category: true, supplier: true, variantsOption: true },
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
      include: { category: true, supplier: true, variantsOption: true },
    });
    if (!product) {
      set.status = 404;
      return "Product not found";
    }
    return product;
  })
  .post(
    "/",
    async ({ body, set }) => {
      let categoryId = body.categoryId;

      // Auto-create category if name is provided instead of ID
      if (!categoryId && body.categoryName) {
        let category = await prisma.category.findFirst({
          where: {
            slug: body.categoryName.toLowerCase().replace(/\s+/g, "-"),
            storeId: body.storeId || null,
          },
        });
        if (!category) {
          category = await prisma.category.create({
            data: {
              name: body.categoryName,
              slug: body.categoryName.toLowerCase().replace(/\s+/g, "-"),
              storeId: body.storeId,
            },
          });
        }
        categoryId = category.id;
      }

      if (!categoryId) {
        set.status = 400;
        return { error: "Category ID or Name is required" };
      }

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
          categoryId: categoryId,
          supplierId: body.supplierId,
          manufacturingDate: body.manufacturingDate,
          expiryDate: body.expiryDate,
          storeId: body.storeId,
          variants: body.variants,
          // variantsOption: body. ,
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
        categoryId: t.Optional(t.String()),
        categoryName: t.Optional(t.String()),
        manufacturingDate: t.Optional(t.Date()),
        expiryDate: t.Optional(t.Date()),
        supplierId: t.Optional(t.String()),
        storeId: t.String(),
        variants: t.Optional(
          t.Array(
            t.Object({
              name: t.String(),
              price: t.Number(),
              stockQuantity: t.Integer(),
              color: t.Optional(t.String()),
              size: t.Optional(t.String()),
              weight: t.Optional(t.Number()),
              unitPrice: t.Number(),
              costPrice: t.Number(),
              isActive: t.Boolean(),
              sku: t.String(),
              barcode: t.Optional(t.String()),
              storeId: t.String(),
            }),
          ),
        ),
      }),
    },
  )
  .put(
    "/:id",
    async ({ params, body }) => {
      let categoryId = body.categoryId;

      if (!categoryId && body.categoryName) {
        const existingProduct = await prisma.product.findUnique({
          where: { id: params.id },
          select: { storeId: true },
        });
        const storeId = existingProduct?.storeId || null;

        let category = await prisma.category.findFirst({
          where: {
            slug: body.categoryName.toLowerCase().replace(/\s+/g, "-"),
            storeId: storeId,
          },
        });
        if (!category) {
          category = await prisma.category.create({
            data: {
              name: body.categoryName,
              slug: body.categoryName.toLowerCase().replace(/\s+/g, "-"),
              storeId: storeId,
            },
          });
        }
        categoryId = category.id;
      }

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
          categoryId: categoryId,
          supplierId: body.supplierId,
          manufacturingDate: body.manufacturingDate,
          expiryDate: body.expiryDate,
        },
      });
    },
    {
      body: t.Partial(
        t.Object({
          sku: t.String(),
          barcode: t.Optional(t.String()),
          name: t.String(),
          description: t.Optional(t.String()),
          brand: t.Optional(t.String()),
          costPrice: t.Number(),
          sellingPrice: t.Number(),
          stockQuantity: t.Integer(),
          categoryId: t.Optional(t.String()),
          categoryName: t.Optional(t.String()),
          manufacturingDate: t.Optional(t.Date()),
          expiryDate: t.Optional(t.Date()),
          supplierId: t.Optional(t.String()),
        }),
      ),
    },
  )
  .delete("/:id", async ({ params }) => {
    return prisma.product.delete({
      where: { id: params.id },
    });
  });
