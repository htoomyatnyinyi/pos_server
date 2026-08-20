import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";
import { tenantAuthMiddleware } from "../../middlewares/tenantAuthMiddleware";
import { adjustInventory, getProductTotalStock } from "../lib/inventory";
import { validateStore, requireAnyPermission, requirePermission, requireRoles } from "../lib/security";

function slugify(name: string) {
  return name.toLowerCase().replace(/\s+/g, "-");
}

export const productRoutes = new Elysia({ prefix: "/products" })
  .use(tenantAuthMiddleware)

  // -------------------------------------------------------------------
  // 1. GET ALL PRODUCTS (with pagination, search, category, store filter)
  // -------------------------------------------------------------------
  .get(
    "/",
    async ({ tenantId, query }) => {
      const page = query.page ? parseInt(query.page as string) : 1;
      const limit = query.limit ? parseInt(query.limit as string) : 20;
      const skip = (page - 1) * limit;
      const search = query.search as string;
      const categoryId = query.categoryId as string;
      const storeId = query.storeId as string;

      const whereCondition: any = {
        tenantId,
        deletedAt: null,
      };
      if (categoryId) whereCondition.categoryId = categoryId;
      if (search) {
        whereCondition.OR = [
          { name: { contains: search, mode: "insensitive" } },
          { sku: { contains: search, mode: "insensitive" } },
          { barcode: { contains: search, mode: "insensitive" } },
          { brand: { name: { contains: search, mode: "insensitive" } } },
        ];
      }

      const [total, products] = await prisma.$transaction([
        prisma.product.count({ where: whereCondition }),
        prisma.product.findMany({
          where: whereCondition,
          include: {
            category: true,
            brand: true,
            supplier: true,
            variants: true,
            inventories: storeId ? { where: { storeId } } : true,
          },
          orderBy: { createdAt: "desc" },
          skip,
          take: limit,
        }),
      ]);

      return {
        success: true,
        meta: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
        products: products.map((product: any) => ({
          ...product,
          totalStock: getProductTotalStock(product),
        })),
      };
    },
    {
      query: t.Optional(
        t.Object({
          page: t.Optional(t.String()),
          limit: t.Optional(t.String()),
          search: t.Optional(t.String()),
          categoryId: t.Optional(t.String()),
          storeId: t.Optional(t.String()),
        }),
      ),
    },
  )

  // -------------------------------------------------------------------
  // 2. GET PRODUCT BY BARCODE
  // -------------------------------------------------------------------
  .get(
    "/barcode/:barcode",
    async ({ params: { barcode }, tenantId, set }) => {
      // 1. Try matching a parent product barcode
      const product = await prisma.product.findFirst({
        where: { tenantId, barcode, deletedAt: null },
        include: {
          category: true,
          brand: true,
          supplier: true,
          variants: true,
          inventories: true,
        },
      });
      if (product) {
        return { success: true, found: true, product, matchedVariant: null };
      }

      // 2. Try matching a variant barcode
      const variant = await prisma.productVariant.findFirst({
        where: { tenantId, barcode },
        include: {
          product: {
            include: {
              category: true,
              brand: true,
              supplier: true,
              variants: true,
              inventories: true,
            },
          },
        },
      });
      if (variant) {
        return {
          success: true,
          found: true,
          product: variant.product,
          matchedVariant: {
            id: variant.id,
            name: variant.name,
            sku: variant.sku,
            barcode: variant.barcode,
            price: variant.price,
            costPrice: variant.costPrice,
            color: variant.color,
            size: variant.size,
          },
        };
      }

      set.status = 404;
      return {
        success: false,
        found: false,
        message: "No product or variant found with this barcode.",
      };
    },
    { params: t.Object({ barcode: t.String() }) },
  )

  // -------------------------------------------------------------------
  // 3. ALLOCATE EXISTING PRODUCT STOCK TO VARIANTS
  // -------------------------------------------------------------------
  .post(
    "/:id/stock-allocation",
    async ({ params: { id }, body, tenantId, role, userId, set }) => {
      requireRoles(role, ["ADMIN", "MANAGER", "SUPER_ADMIN"], set);
      await requirePermission(userId, role, "MANAGE_INVENTORY", set);
      await validateStore(body.storeId, tenantId);

      const result = await prisma.$transaction(async (tx: any) => {
        const product = await tx.product.findFirst({
          where: { id, tenantId, deletedAt: null },
          include: { variants: true },
        });
        if (!product) throw new Error("Product not found.");
        if (product.variants.length === 0) {
          throw new Error("Only products with variants can be allocated.");
        }

        const requestedIds = body.allocations.map((a) => a.variantId);
        const productVariantIds = product.variants.map((v: any) => v.id);
        if (
          new Set(requestedIds).size !== requestedIds.length ||
          requestedIds.length !== productVariantIds.length ||
          requestedIds.some(
            (variantId) => !productVariantIds.includes(variantId),
          )
        ) {
          throw new Error(
            "Allocations must contain every product variant exactly once.",
          );
        }
        if (body.allocations.some((a) => a.quantity < 0)) {
          throw new Error("Allocation quantities cannot be negative.");
        }

        // The legacy product-level row is the only source that may be split.
        const productStock = await tx.inventory.findFirst({
          where: {
            tenantId,
            storeId: body.storeId,
            productId: id,
            variantId: null,
            lotId: null,
          },
        });
        if (!productStock)
          throw new Error("No unallocated product stock was found.");
        const totalAllocated = body.allocations.reduce(
          (sum, a) => sum + a.quantity,
          0,
        );
        if (totalAllocated !== productStock.quantity) {
          throw new Error(
            `Allocation total must equal the unallocated stock (${productStock.quantity}).`,
          );
        }

        for (const allocation of body.allocations) {
          const existingVariantStock = await tx.inventory.findFirst({
            where: {
              tenantId,
              storeId: body.storeId,
              productId: id,
              variantId: allocation.variantId,
              lotId: null,
            },
          });
          if (existingVariantStock && existingVariantStock.quantity !== 0) {
            throw new Error(
              `Variant ${allocation.variantId} already has allocated stock.`,
            );
          }
          if (allocation.quantity > 0) {
            await adjustInventory(tx, {
              tenantId,
              storeId: body.storeId,
              productId: id,
              variantId: allocation.variantId,
              quantityDelta: allocation.quantity,
              userId,
              type: "ADJUSTMENT",
              referenceId: id,
              referenceType: "VariantStockAllocation",
              reason: "Manual allocation of legacy product stock to variants.",
            });
          } else if (!existingVariantStock) {
            await tx.inventory.create({
              data: {
                tenantId,
                storeId: body.storeId,
                productId: id,
                variantId: allocation.variantId,
                quantity: 0,
              },
            });
          }
        }

        await tx.inventory.delete({ where: { id: productStock.id } });
        return tx.inventory.findMany({
          where: {
            tenantId,
            storeId: body.storeId,
            productId: id,
            lotId: null,
          },
          include: { variant: true },
          orderBy: { variantId: "asc" },
        });
      });

      return {
        success: true,
        message: "Product stock allocated to variants.",
        inventory: result,
      };
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        storeId: t.String({ minLength: 1 }),
        allocations: t.Array(
          t.Object({
            variantId: t.String(),
            quantity: t.Integer({ minimum: 0 }),
          }),
        ),
      }),
    },
  )

  // -------------------------------------------------------------------
  // 4. GET SINGLE PRODUCT BY ID
  // -------------------------------------------------------------------
  .get(
    "/:id",
    async ({ params: { id }, tenantId, set }) => {
      const product = await prisma.product.findFirst({
        where: { id, tenantId, deletedAt: null },
        include: {
          category: true,
          brand: true,
          supplier: true,
          variants: true,
          inventories: { include: { store: true } },
          priceHistory: { take: 10, orderBy: { changedAt: "desc" } },
        },
      });
      if (!product) {
        set.status = 404;
        return {
          success: false,
          message: "Product not found or access denied.",
        };
      }
      return {
        success: true,
        product: { ...product, totalStock: getProductTotalStock(product) },
      };
    },
    { params: t.Object({ id: t.String() }) },
  )

  // -------------------------------------------------------------------
  // 4. CREATE PRODUCT (with variants, initial stock, and price history)
  // -------------------------------------------------------------------
  .post(
    "/",
    async ({ body, tenantId, role, userId, set }) => {
      requireRoles(role, ["ADMIN", "MANAGER", "SUPER_ADMIN"], set);
      await requireAnyPermission(userId, role, ["MANAGE_INVENTORY", "EDIT_PRICES"], set);

      const variants = body.variants ?? [];
      const optionSkus = variants
        .map((variant) => variant.sku?.trim())
        .filter(Boolean) as string[];
      const optionNames = variants.map((variant) =>
        variant.name.trim().toLowerCase(),
      );
      if (
        variants.some(
          (variant) => !variant.name.trim() || !variant.sku?.trim(),
        ) ||
        new Set(optionSkus).size !== optionSkus.length ||
        new Set(optionNames).size !== optionNames.length
      ) {
        set.status = 400;
        return {
          success: false,
          message: "Each product option needs a unique name and SKU.",
        };
      }

      // Product identifiers are optional for a master product with options.
      // Never pass an undefined SKU to Prisma: `{ sku: undefined }` becomes
      // an empty filter and can incorrectly match every product.
      const productIdentifiers = [
        ...(body.sku?.trim() ? [{ sku: body.sku.trim() }] : []),
        ...(body.barcode?.trim() ? [{ barcode: body.barcode.trim() }] : []),
      ];
      const optionIdentifiers = variants.flatMap((variant) => [
        ...(variant.sku?.trim() ? [{ sku: variant.sku.trim() }] : []),
        ...(variant.barcode?.trim()
          ? [{ barcode: variant.barcode.trim() }]
          : []),
      ]);
      const allIdentifiers = [...productIdentifiers, ...optionIdentifiers];

      const [existingProduct, existingVariant] = await Promise.all([
        allIdentifiers.length
          ? prisma.product.findFirst({
              where: { tenantId, deletedAt: null, OR: allIdentifiers },
            })
          : null,
        allIdentifiers.length
          ? prisma.productVariant.findFirst({
              where: { tenantId, OR: allIdentifiers },
            })
          : null,
      ]);
      if (existingProduct || existingVariant) {
        set.status = 400;
        return {
          success: false,
          message:
            "A product or option SKU/barcode already exists in this tenant.",
        };
      }

      // If storeId is provided, validate it
      if (body.storeId) {
        await validateStore(body.storeId, tenantId);
      }

      return await prisma.$transaction(async (tx: any) => {
        let categoryId = body.categoryId;
        if (!categoryId && body.categoryName) {
          const categorySlug = slugify(body.categoryName);
          let category = await tx.category.findFirst({
            where: { tenantId, slug: categorySlug, deletedAt: null },
          });
          if (!category) {
            category = await tx.category.create({
              data: {
                tenantId,
                name: body.categoryName.trim(),
                slug: categorySlug,
              },
            });
          }
          categoryId = category.id;
        }

        if (!categoryId) {
          throw new Error("Category ID or Category Name is required.");
        }

        const product = await tx.product.create({
          data: {
            tenantId,
            sku: body.sku?.trim(),
            barcode: body.barcode?.trim(),
            name: body.name.trim(),
            description: body.description,
            brandId: body.brandId,
            costPrice: body.costPrice,
            sellingPrice: body.sellingPrice,
            wholesalePrice: body.wholesalePrice,
            categoryId,
            supplierId: body.supplierId,
            manufacturingDate: body.manufacturingDate
              ? new Date(body.manufacturingDate)
              : undefined,
            expiryDate: body.expiryDate ? new Date(body.expiryDate) : undefined,
            bestBeforeDate: body.bestBeforeDate
              ? new Date(body.bestBeforeDate)
              : undefined,
            promoPrice: body.promoPrice,
            promoStartAt: body.promoStartAt
              ? new Date(body.promoStartAt)
              : undefined,
            promoEndAt: body.promoEndAt ? new Date(body.promoEndAt) : undefined,
            isTaxable: body.isTaxable ?? true,
            isActive: body.isActive ?? true,
            isReturnable: body.isReturnable ?? true,
            variants:
              variants.length > 0
                ? {
                    create: variants.map((v) => ({
                      tenantId,
                      name: v.name.trim(),
                      sku: v.sku
                        ? v.sku.trim()
                        : `${body.sku?.trim()}-${slugify(v.name)}`,
                      barcode: v.barcode?.trim() || body.barcode?.trim(),
                      price: v.price ?? body.sellingPrice,
                      costPrice: v.costPrice ?? body.costPrice,
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

        // Price history record for initial price
        await tx.priceHistory.create({
          data: {
            tenantId,
            productId: product.id,
            oldPrice: 0,
            newPrice: body.sellingPrice || variants[0]?.price || 0,
            changedById: userId,
            reason: "Initial product creation",
          },
        });

        if (body.storeId) {
          const createdVariants = product.variants;
          if (createdVariants.length > 0) {
            const variantStocks = variants.map((v) => v.initialStock ?? 0);
            if (
              (body.initialStock ?? 0) > 0 &&
              variantStocks.every((stock) => stock === 0)
            ) {
              throw new Error(
                "Products with variants require initialStock on each variant; stock cannot be inferred.",
              );
            }
            if (
              variantStocks.reduce((sum, stock) => sum + stock, 0) !==
              (body.initialStock ?? 0)
            ) {
              throw new Error(
                "Product initialStock must equal the sum of variant initialStock values.",
              );
            }
            for (let index = 0; index < createdVariants.length; index++) {
              const stock = variantStocks[index] ?? 0;
              await tx.inventory.create({
                data: {
                  tenantId,
                  storeId: body.storeId,
                  productId: product.id,
                  variantId: createdVariants[index].id,
                  quantity: stock,
                },
              });
              if (stock > 0) {
                await tx.stockMovement.create({
                  data: {
                    tenantId,
                    storeId: body.storeId,
                    productId: product.id,
                    variantId: createdVariants[index].id,
                    userId,
                    quantity: stock,
                    previousStock: 0,
                    newStock: stock,
                    type: "OPENING_STOCK",
                    referenceId: product.id,
                    referenceType: "Product",
                    reason: "Initial stock on product creation.",
                  },
                });
              }
            }
          } else {
            await adjustInventory(tx, {
              tenantId,
              storeId: body.storeId,
              productId: product.id,
              quantityDelta: body.initialStock ?? 0,
              userId,
              type: "OPENING_STOCK",
              referenceId: product.id,
              referenceType: "Product",
              reason: "Initial stock on product creation.",
              variantId: null,
            });
          }
        }

        set.status = 201;
        return {
          success: true,
          message: "Product created successfully.",
          product,
        };
      });
    },
    {
      body: t.Object({
        sku: t.Optional(t.String()),
        barcode: t.Optional(t.String()),
        name: t.String(),
        description: t.Optional(t.String()),
        brandId: t.Optional(t.String()),
        costPrice: t.Optional(t.Number()),
        sellingPrice: t.Optional(t.Number()),
        wholesalePrice: t.Optional(t.Number()),
        categoryId: t.Optional(t.String()),
        categoryName: t.Optional(t.String()),
        manufacturingDate: t.Optional(t.String()),
        expiryDate: t.Optional(t.String()),
        bestBeforeDate: t.Optional(t.String()),
        promoPrice: t.Optional(t.Number()),
        promoStartAt: t.Optional(t.String()),
        promoEndAt: t.Optional(t.String()),
        isTaxable: t.Optional(t.Boolean()),
        isActive: t.Optional(t.Boolean()),
        isReturnable: t.Optional(t.Boolean()),
        supplierId: t.Optional(t.String()),
        storeId: t.Optional(t.String()),
        initialStock: t.Optional(t.Integer({ minimum: 0 })),
        variants: t.Optional(
          t.Array(
            t.Object({
              name: t.String(),
              price: t.Optional(t.Number()),
              color: t.Optional(t.String()),
              size: t.Optional(t.String()),
              weight: t.Optional(t.Number()),
              costPrice: t.Optional(t.Number()),
              isActive: t.Optional(t.Boolean()),
              sku: t.Optional(t.String()),
              barcode: t.Optional(t.String()),
              initialStock: t.Optional(t.Integer({ minimum: 0 })),
            }),
          ),
        ),
      }),
    },
  )

  // -------------------------------------------------------------------
  // 5. UPDATE PRODUCT (with price history tracking and variant sync)
  // -------------------------------------------------------------------
  .put(
    "/:id",
    async ({ params: { id }, body, tenantId, role, userId, set }) => {
      requireRoles(role, ["ADMIN", "MANAGER", "SUPER_ADMIN"], set);
      await requireAnyPermission(userId, role, ["MANAGE_INVENTORY", "EDIT_PRICES"], set);

      const currentProduct = await prisma.product.findFirst({
        where: { id, tenantId, deletedAt: null },
        include: { variants: true },
      });
      if (!currentProduct) {
        set.status = 404;
        return { success: false, message: "Product not found." };
      }

      // Check duplicate SKU/barcode at the product level
      if (body.sku || body.barcode) {
        const duplicateCheck = await prisma.product.findFirst({
          where: {
            tenantId,
            deletedAt: null,
            NOT: { id },
            OR: [
              ...(body.sku ? [{ sku: body.sku }] : []),
              ...(body.barcode ? [{ barcode: body.barcode }] : []),
            ],
          },
        });
        if (duplicateCheck) {
          set.status = 400;
          return {
            success: false,
            message: "SKU or Barcode is already in use.",
          };
        }
      }

      return await prisma
        .$transaction(async (tx: any) => {
          // Resolve category
          let categoryId = body.categoryId;
          if (!categoryId && body.categoryName) {
            const categorySlug = slugify(body.categoryName);
            let category = await tx.category.findFirst({
              where: { tenantId, slug: categorySlug, deletedAt: null },
            });
            if (!category) {
              category = await tx.category.create({
                data: {
                  tenantId,
                  name: body.categoryName.trim(),
                  slug: categorySlug,
                },
              });
            }
            categoryId = category.id;
          }

          // Track price changes
          const sellingChanged =
            body.sellingPrice !== undefined &&
            body.sellingPrice !== Number(currentProduct.sellingPrice);
          if (sellingChanged) {
            await tx.priceHistory.create({
              data: {
                tenantId,
                productId: id,
                oldPrice: currentProduct.sellingPrice,
                newPrice: body.sellingPrice!,
                changedById: userId,
                reason: "Product selling price updated.",
              },
            });
          }

          const updatedProduct = await tx.product.update({
            where: { id },
            data: {
              sku: body.sku?.trim(),
              barcode: body.barcode?.trim(),
              name: body.name?.trim(),
              description: body.description,
              brandId: body.brandId,
              costPrice: body.costPrice,
              sellingPrice: body.sellingPrice,
              wholesalePrice: body.wholesalePrice,
              categoryId: categoryId ?? undefined,
              supplierId: body.supplierId,
              manufacturingDate: body.manufacturingDate
                ? new Date(body.manufacturingDate)
                : undefined,
              expiryDate: body.expiryDate
                ? new Date(body.expiryDate)
                : undefined,
              bestBeforeDate: body.bestBeforeDate
                ? new Date(body.bestBeforeDate)
                : undefined,
              promoPrice: body.promoPrice,
              promoStartAt: body.promoStartAt
                ? new Date(body.promoStartAt)
                : undefined,
              promoEndAt: body.promoEndAt
                ? new Date(body.promoEndAt)
                : undefined,
              isTaxable: body.isTaxable,
              isActive: body.isActive,
              isReturnable: body.isReturnable,
            },
          });

          // ── Sync variants if provided ──
          if (Array.isArray(body.variants)) {
            const incomingVariants = body.variants;
            const existingVariants = (currentProduct as any).variants ?? [];
            const existingIds = existingVariants.map((v: any) => v.id);

            const keptIds = new Set<string>();

            for (const v of incomingVariants) {
              const targetId = v.remoteId || v.id;
              if (targetId && existingIds.includes(targetId)) {
                // Update existing variant
                keptIds.add(targetId);
                await tx.productVariant.update({
                  where: { id: targetId },
                  data: {
                    name: v.name?.trim(),
                    sku: v.sku?.trim(),
                    barcode: v.barcode?.trim() || null,
                    price: v.price,
                    costPrice: v.costPrice,
                    color: v.color,
                    size: v.size,
                    weight: v.weight,
                    isActive: v.isActive ?? true,
                  },
                });
              } else {
                // Create new variant
                const created = await tx.productVariant.create({
                  data: {
                    tenantId,
                    productId: id,
                    name: v.name.trim(),
                    sku:
                      v.sku?.trim() ||
                      `${updatedProduct.sku}-${slugify(v.name)}`,
                    barcode: v.barcode?.trim() || null,
                    price: v.price ?? updatedProduct.sellingPrice,
                    costPrice: v.costPrice ?? updatedProduct.costPrice,
                    color: v.color,
                    size: v.size,
                    weight: v.weight,
                    isActive: v.isActive ?? true,
                  },
                });
                keptIds.add(created.id);
              }
            }

            // Deactivate variants that were removed
            const removedIds = existingIds.filter(
              (eid: string) => !keptIds.has(eid),
            );
            if (removedIds.length > 0) {
              await tx.productVariant.updateMany({
                where: { id: { in: removedIds } },
                data: { isActive: false },
              });
            }
          }

          // Re-fetch with variants included
          const final = await tx.product.findFirst({
            where: { id },
            include: { variants: true, category: true, brand: true },
          });

          return {
            success: true,
            message: "Product updated successfully.",
            product: final,
          };
        })
        .catch((error: any) => {
          console.error("❌ Error updating product:", error);
          throw error;
        });
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Partial(
        t.Object({
          sku: t.String(),
          barcode: t.Optional(t.String()),
          name: t.String(),
          description: t.Optional(t.String()),
          brandId: t.Optional(t.String()),
          costPrice: t.Number(),
          sellingPrice: t.Number(),
          wholesalePrice: t.Optional(t.Number()),
          categoryId: t.Optional(t.String()),
          categoryName: t.Optional(t.String()),
          manufacturingDate: t.Optional(t.String()),
          expiryDate: t.Optional(t.String()),
          bestBeforeDate: t.Optional(t.String()),
          promoPrice: t.Optional(t.Number()),
          promoStartAt: t.Optional(t.String()),
          promoEndAt: t.Optional(t.String()),
          isTaxable: t.Optional(t.Boolean()),
          isReturnable: t.Optional(t.Boolean()),
          supplierId: t.Optional(t.String()),
          isActive: t.Optional(t.Boolean()),
          variants: t.Optional(
            t.Array(
              t.Object({
                id: t.Optional(t.String()),
                remoteId: t.Optional(t.String()),
                name: t.String(),
                sku: t.Optional(t.String()),
                barcode: t.Optional(t.String()),
                price: t.Optional(t.Number()),
                costPrice: t.Optional(t.Number()),
                color: t.Optional(t.String()),
                size: t.Optional(t.String()),
                weight: t.Optional(t.Number()),
                isActive: t.Optional(t.Boolean()),
              }),
            ),
          ),
        }),
      ),
    },
  )

  // -------------------------------------------------------------------
  // 6. SOFT DELETE PRODUCT
  // -------------------------------------------------------------------
  .delete(
    "/:id",
    async ({ params: { id }, tenantId, role, userId, set }) => {
      requireRoles(role, ["ADMIN", "MANAGER", "SUPER_ADMIN"], set);
      await requirePermission(userId, role, "MANAGE_INVENTORY", set);

      const product = await prisma.product.findFirst({
        where: { id, tenantId, deletedAt: null },
      });
      if (!product) {
        set.status = 404;
        return {
          success: false,
          message: "Product not found or already deleted.",
        };
      }

      await prisma.product.update({
        where: { id },
        data: {
          deletedAt: new Date(),
          isActive: false,
        },
      });

      return { success: true, message: "Product soft-deleted successfully." };
    },
    { params: t.Object({ id: t.String() }) },
  );
