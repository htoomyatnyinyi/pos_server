import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";
import { tenantAuthMiddleware } from "../../middlewares/tenantAuthMiddleware";
import { adjustInventory } from "../lib/inventory";
import { validateStore, requireRoles } from "../lib/security";

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
        products,
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
      const product = await prisma.product.findFirst({
        where: { tenantId, barcode, deletedAt: null },
        include: {
          category: true,
          brand: true,
          supplier: true,
          variants: true,
        },
      });
      if (!product) {
        set.status = 404;
        return {
          success: false,
          found: false,
          message: "No product found with this barcode.",
        };
      }
      return { success: true, found: true, product };
    },
    { params: t.Object({ barcode: t.String() }) },
  )

  // -------------------------------------------------------------------
  // 3. GET SINGLE PRODUCT BY ID
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
      return { success: true, product };
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

      // Check existing SKU or barcode
      const existingProduct = await prisma.product.findFirst({
        where: {
          tenantId,
          deletedAt: null,
          OR: [
            { sku: body.sku },
            ...(body.barcode ? [{ barcode: body.barcode }] : []),
          ],
        },
      });
      if (existingProduct) {
        set.status = 400;
        return {
          success: false,
          message: "Product SKU or Barcode already exists in this tenant.",
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
            variants: body.variants
              ? {
                  create: body.variants.map((v) => ({
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
            newPrice: body.sellingPrice || body.variants?.[0]?.price!,
            changedById: userId,
            reason: "Initial product creation",
          },
        });

        // If initial stock is provided
        if (body.storeId && body.initialStock && body.initialStock > 0) {
          await adjustInventory(tx, {
            tenantId,
            storeId: body.storeId,
            productId: product.id,
            quantityDelta: body.initialStock,
            userId,
            type: "OPENING_STOCK",
            referenceId: product.id,
            referenceType: "Product",
            reason: "Initial stock on product creation.",
            variantId: null, // No variant for product-level initial stock
          });
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
        initialStock: t.Optional(t.Integer()),
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
            }),
          ),
        ),
      }),
    },
  )

  // -------------------------------------------------------------------
  // 5. UPDATE PRODUCT (with price history tracking)
  // -------------------------------------------------------------------
  .put(
    "/:id",
    async ({ params: { id }, body, tenantId, role, userId, set }) => {
      requireRoles(role, ["ADMIN", "MANAGER", "SUPER_ADMIN"], set);

      const currentProduct = await prisma.product.findFirst({
        where: { id, tenantId, deletedAt: null },
      });
      if (!currentProduct) {
        set.status = 404;
        return { success: false, message: "Product not found." };
      }

      // Check duplicate SKU/barcode
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

      return await prisma.$transaction(async (tx: any) => {
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
            expiryDate: body.expiryDate ? new Date(body.expiryDate) : undefined,
            bestBeforeDate: body.bestBeforeDate
              ? new Date(body.bestBeforeDate)
              : undefined,
            promoPrice: body.promoPrice,
            promoStartAt: body.promoStartAt
              ? new Date(body.promoStartAt)
              : undefined,
            promoEndAt: body.promoEndAt ? new Date(body.promoEndAt) : undefined,
            isTaxable: body.isTaxable,
            isActive: body.isActive,
            isReturnable: body.isReturnable,
          },
        });

        return {
          success: true,
          message: "Product updated successfully.",
          product: updatedProduct,
        };
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
        }),
      ),
    },
  )

  // -------------------------------------------------------------------
  // 6. SOFT DELETE PRODUCT
  // -------------------------------------------------------------------
  .delete(
    "/:id",
    async ({ params: { id }, tenantId, role, set }) => {
      requireRoles(role, ["ADMIN", "MANAGER", "SUPER_ADMIN"], set);

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

// import { Elysia, t } from "elysia";
// import { prisma } from "../lib/prisma";
// import { tenantAuthMiddleware } from "../../middlewares/tenantAuthMiddleware";
// import { adjustInventory } from "../lib/inventory";

// // Name ကို URL Slug ပုံစံပြောင်းရန် Function
// function slugify(name: string) {
//   return name.toLowerCase().replace(/\s+/g, "-");
// }

// export const productRoutes = new Elysia({ prefix: "/products" })
//   // 🔐 မစ်ဒယ်ဝဲလ်ချိတ်ဆက်ပြီး tenantId, role, userId တို့ကို ရယူမည်
//   .use(tenantAuthMiddleware)

//   /**
//    * 1. READ ALL PRODUCTS WITH PAGINATION, SEARCH & FILTER
//    */
//   .get(
//     "/",
//     async ({ tenantId, query }) => {
//       const page = query.page ? parseInt(query.page as string) : 1;
//       const limit = query.limit ? parseInt(query.limit as string) : 20;
//       const skip = (page - 1) * limit;
//       const search = query.search as string;
//       const categoryId = query.categoryId as string;
//       const storeId = query.storeId as string;

//       const whereCondition: any = {
//         tenantId,
//         deletedAt: null,
//       };

//       if (categoryId) {
//         whereCondition.categoryId = categoryId;
//       }

//       if (search) {
//         whereCondition.OR = [
//           { name: { contains: search, mode: "insensitive" } },
//           { sku: { contains: search, mode: "insensitive" } },
//           { barcode: { contains: search, mode: "insensitive" } },
//           { brand: { name: { contains: search, mode: "insensitive" } } },
//         ];
//       }

//       const [total, products] = await prisma.$transaction([
//         prisma.product.count({ where: whereCondition }),
//         prisma.product.findMany({
//           where: whereCondition,
//           include: {
//             category: true,
//             brand: true,
//             supplier: true,
//             variants: true,
//             inventories: storeId ? { where: { storeId } } : true,
//           },
//           orderBy: { createdAt: "desc" },
//           skip,
//           take: limit,
//         }),
//       ]);

//       return {
//         success: true,
//         meta: {
//           total,
//           page,
//           limit,
//           totalPages: Math.ceil(total / limit),
//         },
//         products,
//       };
//     },
//     {
//       query: t.Optional(
//         t.Object({
//           page: t.Optional(t.String()),
//           limit: t.Optional(t.String()),
//           search: t.Optional(t.String()),
//           categoryId: t.Optional(t.String()),
//           storeId: t.Optional(t.String()),
//         }),
//       ),
//     },
//   )

//   /**
//    * 2. READ BY BARCODE
//    */
//   .get(
//     "/barcode/:barcode",
//     async ({ params: { barcode }, tenantId, set }) => {
//       const product = await prisma.product.findFirst({
//         where: { tenantId, barcode, deletedAt: null },
//         include: {
//           category: true,
//           brand: true,
//           supplier: true,
//           variants: true,
//         },
//       });

//       if (!product) {
//         set.status = 404;
//         return {
//           success: false,
//           found: false,
//           message: "No product found with this barcode.",
//         };
//       }

//       return { success: true, found: true, product };
//     },
//     { params: t.Object({ barcode: t.String() }) },
//   )

//   /**
//    * 3. READ SINGLE
//    */
//   .get(
//     "/:id",
//     async ({ params: { id }, tenantId, set }) => {
//       const product = await prisma.product.findFirst({
//         where: { id, tenantId, deletedAt: null },
//         include: {
//           category: true,
//           brand: true,
//           supplier: true,
//           variants: true,
//           inventories: { include: { store: true } },
//           priceHistory: { take: 10, orderBy: { changedAt: "desc" } },
//         },
//       });

//       if (!product) {
//         set.status = 404;
//         return {
//           success: false,
//           message: "Product not found or access denied.",
//         };
//       }

//       return { success: true, product };
//     },
//     { params: t.Object({ id: t.String() }) },
//   )

//   /**
//    * 4. CREATE PRODUCT & VARIANTS
//    */
//   .post(
//     "/",
//     async ({ body, tenantId, role, userId, set }) => {
//       if (role !== "ADMIN" && role !== "SUPER_ADMIN" && role !== "MANAGER") {
//         set.status = 403;
//         return { success: false, message: "Forbidden: Access denied." };
//       }

//       const existingProduct = await prisma.product.findFirst({
//         where: {
//           tenantId,
//           deletedAt: null,
//           OR: [
//             { sku: body.sku },
//             ...(body.barcode ? [{ barcode: body.barcode }] : []),
//           ],
//         },
//       });

//       if (existingProduct) {
//         set.status = 400;
//         return {
//           success: false,
//           message: "Product SKU or Barcode already exists in this tenant.",
//         };
//       }

//       return await prisma.$transaction(async (tx: any) => {
//         let categoryId = body.categoryId;
//         if (!categoryId && body.categoryName) {
//           const categorySlug = slugify(body.categoryName);
//           let category = await tx.category.findFirst({
//             where: { tenantId, slug: categorySlug, deletedAt: null },
//           });
//           if (!category) {
//             category = await tx.category.create({
//               data: {
//                 tenantId,
//                 name: body.categoryName.trim(),
//                 slug: categorySlug,
//               },
//             });
//           }
//           categoryId = category.id;
//         }

//         if (!categoryId) {
//           throw new Error("Category ID or Category Name is required.");
//         }

//         const product = await tx.product.create({
//           data: {
//             tenantId,
//             sku: body.sku?.trim(),
//             barcode: body.barcode?.trim(),
//             name: body.name.trim(),
//             description: body.description,
//             brandId: body.brandId,
//             costPrice: body.costPrice,
//             sellingPrice: body.sellingPrice,
//             wholesalePrice: body.wholesalePrice,
//             categoryId,
//             supplierId: body.supplierId,
//             manufacturingDate: body.manufacturingDate
//               ? new Date(body.manufacturingDate)
//               : undefined,
//             expiryDate: body.expiryDate ? new Date(body.expiryDate) : undefined,
//             bestBeforeDate: body.bestBeforeDate
//               ? new Date(body.bestBeforeDate)
//               : undefined,
//             promoPrice: body.promoPrice,
//             promoStartAt: body.promoStartAt
//               ? new Date(body.promoStartAt)
//               : undefined,
//             promoEndAt: body.promoEndAt ? new Date(body.promoEndAt) : undefined,
//             isTaxable: body.isTaxable ?? true,
//             isActive: body.isActive ?? true,
//             isReturnable: body.isReturnable ?? true,
//             variants: body.variants
//               ? {
//                   create: body.variants.map((v) => ({
//                     tenantId,
//                     name: v.name.trim(),
//                     sku: v.sku
//                       ? v.sku.trim()
//                       : `${body.sku?.trim()}-${slugify(v.name)}`,
//                     barcode: v.barcode?.trim() || body.barcode?.trim(),
//                     price: v.price ?? body.sellingPrice,
//                     costPrice: v.costPrice ?? body.costPrice,
//                     color: v.color,
//                     size: v.size,
//                     weight: v.weight,
//                     isActive: v.isActive ?? true,
//                   })),
//                 }
//               : undefined,
//           },
//           include: { variants: true },
//         });

//         // 📝 Schema ကိုက်ညီအောင် 'priceHistory' နှင့် 'oldPrice/newPrice/changedById' ပြင်ဆင်ပြီး
//         await tx.priceHistory.create({
//           data: {
//             tenantId,
//             productId: product.id,
//             oldPrice: 0,
//             newPrice: body.sellingPrice || body.variants?.[0]?.price!,
//             changedById: userId,
//             reason: "Initial product creation",
//           },
//         });

//         if (body.storeId && body.initialStock && body.initialStock > 0) {
//           await adjustInventory(tx, {
//             tenantId,
//             storeId: body.storeId,
//             productId: product.id,
//             quantityDelta: body.initialStock,
//             userId,
//             type: "OPENING_STOCK",
//             referenceId: product.id,
//             referenceType: "Product",
//             reason: "Initial stock on product creation.",
//           });
//         }

//         set.status = 201;
//         return {
//           success: true,
//           message: "Product created successfully.",
//           product,
//         };
//       });
//     },
//     {
//       body: t.Object({
//         sku: t.Optional(t.String()),
//         barcode: t.Optional(t.String()),
//         name: t.String(),
//         description: t.Optional(t.String()),
//         brandId: t.Optional(t.String()),
//         costPrice: t.Optional(t.Number()),
//         sellingPrice: t.Optional(t.Number()),
//         wholesalePrice: t.Optional(t.Number()),
//         categoryId: t.Optional(t.String()),
//         categoryName: t.Optional(t.String()),
//         manufacturingDate: t.Optional(t.String()),
//         expiryDate: t.Optional(t.String()),
//         bestBeforeDate: t.Optional(t.String()),
//         promoPrice: t.Optional(t.Number()),
//         promoStartAt: t.Optional(t.String()),
//         promoEndAt: t.Optional(t.String()),
//         isTaxable: t.Optional(t.Boolean()),
//         isActive: t.Optional(t.Boolean()),
//         isReturnable: t.Optional(t.Boolean()),
//         supplierId: t.Optional(t.String()),
//         storeId: t.Optional(t.String()),
//         initialStock: t.Optional(t.Integer()),
//         variants: t.Optional(
//           t.Array(
//             t.Object({
//               name: t.String(),
//               price: t.Optional(t.Number()),
//               color: t.Optional(t.String()),
//               size: t.Optional(t.String()),
//               weight: t.Optional(t.Number()),
//               costPrice: t.Optional(t.Number()),
//               isActive: t.Optional(t.Boolean()),
//               sku: t.Optional(t.String()),
//               barcode: t.Optional(t.String()),
//             }),
//           ),
//         ),
//       }),
//     },
//   )

//   /**
//    * 5. UPDATE PRODUCT & TRACK PRICE CHANGES
//    */
//   .put(
//     "/:id",
//     async ({ params: { id }, body, tenantId, role, userId, set }) => {
//       if (role !== "ADMIN" && role !== "SUPER_ADMIN" && role !== "MANAGER") {
//         set.status = 403;
//         return { success: false, message: "Forbidden: Access denied." };
//       }

//       const currentProduct = await prisma.product.findFirst({
//         where: { id, tenantId, deletedAt: null },
//       });

//       if (!currentProduct) {
//         set.status = 404;
//         return { success: false, message: "Product not found." };
//       }

//       if (body.sku || body.barcode) {
//         const duplicateCheck = await prisma.product.findFirst({
//           where: {
//             tenantId,
//             deletedAt: null,
//             NOT: { id },
//             OR: [
//               ...(body.sku ? [{ sku: body.sku }] : []),
//               ...(body.barcode ? [{ barcode: body.barcode }] : []),
//             ],
//           },
//         });
//         if (duplicateCheck) {
//           set.status = 400;
//           return {
//             success: false,
//             message: "SKU or Barcode is already in use.",
//           };
//         }
//       }

//       return await prisma.$transaction(async (tx: any) => {
//         let categoryId = body.categoryId;
//         if (!categoryId && body.categoryName) {
//           const categorySlug = slugify(body.categoryName);
//           let category = await tx.category.findFirst({
//             where: { tenantId, slug: categorySlug, deletedAt: null },
//           });
//           if (!category) {
//             category = await tx.category.create({
//               data: {
//                 tenantId,
//                 name: body.categoryName.trim(),
//                 slug: categorySlug,
//               },
//             });
//           }
//           categoryId = category.id;
//         }

//         // 📝 စျေးနှုန်းပြောင်းလဲမှုကို စစ်ဆေးပြီး priceHistory ထဲ ထည့်သွင်းခြင်း
//         const sellingChanged =
//           body.sellingPrice !== undefined &&
//           body.sellingPrice !== Number(currentProduct.sellingPrice);

//         if (sellingChanged) {
//           await tx.priceHistory.create({
//             data: {
//               tenantId,
//               productId: id,
//               oldPrice: currentProduct.sellingPrice,
//               newPrice: body.sellingPrice!,
//               changedById: userId,
//               reason: "Product selling price updated.",
//             },
//           });
//         }

//         const updatedProduct = await tx.product.update({
//           where: { id },
//           data: {
//             sku: body.sku?.trim(),
//             barcode: body.barcode?.trim(),
//             name: body.name?.trim(),
//             description: body.description,
//             brandId: body.brandId,
//             costPrice: body.costPrice,
//             sellingPrice: body.sellingPrice,
//             wholesalePrice: body.wholesalePrice,
//             categoryId: categoryId ?? undefined,
//             supplierId: body.supplierId,
//             manufacturingDate: body.manufacturingDate
//               ? new Date(body.manufacturingDate)
//               : undefined,
//             expiryDate: body.expiryDate ? new Date(body.expiryDate) : undefined,
//             bestBeforeDate: body.bestBeforeDate
//               ? new Date(body.bestBeforeDate)
//               : undefined,
//             promoPrice: body.promoPrice,
//             promoStartAt: body.promoStartAt
//               ? new Date(body.promoStartAt)
//               : undefined,
//             promoEndAt: body.promoEndAt ? new Date(body.promoEndAt) : undefined,
//             isTaxable: body.isTaxable,
//             isActive: body.isActive,
//             isReturnable: body.isReturnable,
//           },
//         });

//         return {
//           success: true,
//           message: "Product updated successfully.",
//           product: updatedProduct,
//         };
//       });
//     },
//     {
//       params: t.Object({ id: t.String() }),
//       body: t.Partial(
//         t.Object({
//           sku: t.String(),
//           barcode: t.Optional(t.String()),
//           name: t.String(),
//           description: t.Optional(t.String()),
//           brandId: t.Optional(t.String()),
//           costPrice: t.Number(),
//           sellingPrice: t.Number(),
//           wholesalePrice: t.Optional(t.Number()),
//           categoryId: t.Optional(t.String()),
//           categoryName: t.Optional(t.String()),
//           manufacturingDate: t.Optional(t.String()),
//           expiryDate: t.Optional(t.String()),
//           bestBeforeDate: t.Optional(t.String()),
//           promoPrice: t.Optional(t.Number()),
//           promoStartAt: t.Optional(t.String()),
//           promoEndAt: t.Optional(t.String()),
//           isTaxable: t.Optional(t.Boolean()),
//           isReturnable: t.Optional(t.Boolean()),
//           supplierId: t.Optional(t.String()),
//           isActive: t.Optional(t.Boolean()),
//         }),
//       ),
//     },
//   )

//   /**
//    * 6. SOFT DELETE PRODUCT
//    */
//   .delete(
//     "/:id",
//     async ({ params: { id }, tenantId, role, set }) => {
//       if (role !== "ADMIN" && role !== "SUPER_ADMIN" && role !== "MANAGER") {
//         set.status = 403;
//         return { success: false, message: "Forbidden: Access denied." };
//       }

//       const product = await prisma.product.findFirst({
//         where: { id, tenantId, deletedAt: null },
//       });

//       if (!product) {
//         set.status = 404;
//         return {
//           success: false,
//           message: "Product not found or already deleted.",
//         };
//       }

//       await prisma.product.update({
//         where: { id },
//         data: {
//           deletedAt: new Date(),
//           isActive: false,
//         },
//       });

//       return { success: true, message: "Product soft-deleted successfully." };
//     },
//     { params: t.Object({ id: t.String() }) },
//   );
