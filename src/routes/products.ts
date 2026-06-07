import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";
import { requireTenantId } from "../lib/tenant";
import { adjustInventory } from "../lib/inventory";

function slugify(name: string) {
  return name.toLowerCase().replace(/\s+/g, "-");
}

export const productRoutes = new Elysia({
  prefix: "/products",
})
  .get("/", async ({ query, set }) => {
    const tenantId = requireTenantId({ query, set });
    if (!tenantId) return { message: "tenantId is required" };

    return prisma.product.findMany({
      where: {
        tenantId,
        deletedAt: null,
        ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      },
      include: {
        category: true,
        supplier: true,
        variants: true,
        inventories: query.storeId
          ? { where: { storeId: query.storeId } }
          : true,
      },
      orderBy: { createdAt: "desc" },
    });
  })
  .get("/barcode/:barcode", async ({ params, query, set }) => {
    const tenantId = requireTenantId({ query, set });
    if (!tenantId) return { message: "tenantId is required" };

    const product = await prisma.product.findFirst({
      where: { tenantId, barcode: params.barcode, deletedAt: null },
      include: { category: true, supplier: true, variants: true },
    });
    if (!product) {
      set.status = 404;
      return { found: false, message: "No product found with this barcode" };
    }
    return { found: true, product };
  })
  .get("/:id", async ({ params, set }) => {
    const product = await prisma.product.findUnique({
      where: { id: params.id },
      include: {
        category: true,
        supplier: true,
        variants: true,
        inventories: { include: { store: true } },
        priceHistory: { take: 10, orderBy: { changedAt: "desc" } },
      },
    });
    if (!product) {
      set.status = 404;
      return { message: "Product not found" };
    }
    return product;
  })
  .post(
    "/",
    async ({ body, set }) => {
      let categoryId = body.categoryId;

      if (!categoryId && body.categoryName) {
        let category = await prisma.category.findFirst({
          where: {
            tenantId: body.tenantId,
            slug: slugify(body.categoryName),
          },
        });
        if (!category) {
          category = await prisma.category.create({
            data: {
              tenantId: body.tenantId,
              name: body.categoryName,
              slug: slugify(body.categoryName),
            },
          });
        }
        categoryId = category.id;
      }

      if (!categoryId) {
        set.status = 400;
        return { message: "Category ID or Name is required" };
      }

      set.status = 201;
      return prisma.$transaction(async (tx) => {
        const product = await tx.product.create({
          data: {
            tenantId: body.tenantId,
            sku: body.sku,
            barcode: body.barcode,
            name: body.name,
            description: body.description,
            brand: body.brand,
            costPrice: body.costPrice,
            sellingPrice: body.sellingPrice,
            categoryId,
            supplierId: body.supplierId,
            manufacturingDate: body.manufacturingDate,
            expiryDate: body.expiryDate,
            variants: body.variants
              ? {
                  create: body.variants.map((v) => ({
                    tenantId: body.tenantId,
                    name: v.name,
                    sku: v.sku,
                    barcode: v.barcode,
                    price: v.price,
                    costPrice: v.costPrice,
                    color: v.color,
                    size: v.size,
                    weight: v.weight,
                    isActive: v.isActive ?? true,
                  })),
                }
              : undefined,
          },
          include: { variants: true },
        });

        if (body.storeId && body.initialStock && body.initialStock > 0) {
          await adjustInventory(tx, {
            tenantId: body.tenantId,
            storeId: body.storeId,
            productId: product.id,
            quantityDelta: body.initialStock,
            userId: body.userId || body.tenantId,
            type: "OPENING_STOCK",
            referenceId: product.id,
            referenceType: "Product",
            reason: "Initial stock on product creation",
          });
        }

        return product;
      });
    },
    {
      body: t.Object({
        tenantId: t.String(),
        sku: t.String(),
        barcode: t.Optional(t.String()),
        name: t.String(),
        description: t.Optional(t.String()),
        brand: t.Optional(t.String()),
        costPrice: t.Number(),
        sellingPrice: t.Number(),
        categoryId: t.Optional(t.String()),
        categoryName: t.Optional(t.String()),
        manufacturingDate: t.Optional(t.Date()),
        expiryDate: t.Optional(t.Date()),
        supplierId: t.Optional(t.String()),
        storeId: t.Optional(t.String()),
        initialStock: t.Optional(t.Integer()),
        userId: t.Optional(t.String()),
        variants: t.Optional(
          t.Array(
            t.Object({
              name: t.String(),
              price: t.Number(),
              color: t.Optional(t.String()),
              size: t.Optional(t.String()),
              weight: t.Optional(t.Number()),
              costPrice: t.Number(),
              isActive: t.Optional(t.Boolean()),
              sku: t.String(),
              barcode: t.Optional(t.String()),
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
          select: { tenantId: true },
        });

        let category = await prisma.category.findFirst({
          where: {
            tenantId: existingProduct!.tenantId,
            slug: slugify(body.categoryName),
          },
        });
        if (!category) {
          category = await prisma.category.create({
            data: {
              tenantId: existingProduct!.tenantId,
              name: body.categoryName,
              slug: slugify(body.categoryName),
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
          categoryId,
          supplierId: body.supplierId,
          manufacturingDate: body.manufacturingDate,
          expiryDate: body.expiryDate,
          isActive: body.isActive,
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
          categoryId: t.Optional(t.String()),
          categoryName: t.Optional(t.String()),
          manufacturingDate: t.Optional(t.Date()),
          expiryDate: t.Optional(t.Date()),
          supplierId: t.Optional(t.String()),
          isActive: t.Optional(t.Boolean()),
        }),
      ),
    },
  )
  .delete("/:id", async ({ params }) => {
    return prisma.product.update({
      where: { id: params.id },
      data: { deletedAt: new Date(), isActive: false },
    });
  });
