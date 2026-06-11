import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";
import { tenantAuthMiddleware } from "../../middlewares/tenantAuthMiddleware";
import { adjustInventory } from "../lib/inventory";

// Name ကို URL Slug ပုံစံပြောင်းရန် Function
function slugify(name: string) {
  return name.toLowerCase().replace(/\s+/g, "-");
}

export const productRoutes = new Elysia({ prefix: "/products" })
  // 🔐 မစ်ဒယ်ဝဲလ်ချိတ်ဆက်ပြီး tenantId, role, userId တို့ကို ရယူမည်
  .use(tenantAuthMiddleware)

  /**
   * 1. READ ALL PRODUCTS WITH PAGINATION, SEARCH & FILTER
   */
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

      if (categoryId) {
        whereCondition.categoryId = categoryId;
      }

      if (search) {
        whereCondition.OR = [
          { name: { contains: search, mode: "insensitive" } },
          { sku: { contains: search, mode: "insensitive" } },
          { barcode: { contains: search, mode: "insensitive" } },
          { brand: { contains: search, mode: "insensitive" } },
        ];
      }

      const [total, products] = await prisma.$transaction([
        prisma.product.count({ where: whereCondition }),
        prisma.product.findMany({
          where: whereCondition,
          include: {
            category: true,
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

  /**
   * 2. READ BY BARCODE
   */
  .get(
    "/barcode/:barcode",
    async ({ params: { barcode }, tenantId, set }) => {
      const product = await prisma.product.findFirst({
        where: { tenantId, barcode, deletedAt: null },
        include: { category: true, supplier: true, variants: true },
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

  /**
   * 3. READ SINGLE
   */
  .get(
    "/:id",
    async ({ params: { id }, tenantId, set }) => {
      const product = await prisma.product.findFirst({
        where: { id, tenantId, deletedAt: null },
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
        return {
          success: false,
          message: "Product not found or access denied.",
        };
      }

      return { success: true, product };
    },
    { params: t.Object({ id: t.String() }) },
  )

  /**
   * 4. CREATE PRODUCT & VARIANTS
   */
  .post(
    "/",
    async ({ body, tenantId, role, userId, set }) => {
      if (role !== "ADMIN" && role !== "SUPER_ADMIN" && role !== "MANAGER") {
        set.status = 403;
        return { success: false, message: "Forbidden: Access denied." };
      }

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

      return await prisma.$transaction(async (tx) => {
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
            sku: body.sku.trim(),
            barcode: body.barcode?.trim(),
            name: body.name.trim(),
            description: body.description,
            brand: body.brand,
            costPrice: body.costPrice,
            sellingPrice: body.sellingPrice,
            wholesalePrice: body.wholesalePrice,
            categoryId,
            supplierId: body.supplierId,
            manufacturingDate: body.manufacturingDate,
            expiryDate: body.expiryDate,
            variants: body.variants
              ? {
                  create: body.variants.map((v) => ({
                    tenantId,
                    name: v.name.trim(),
                    sku: v.sku.trim(),
                    barcode: v.barcode?.trim(),
                    price: v.price, // 📝 Schema အတိုင်း 'price' ကို သုံးထားပါတယ်
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

        // 📝 Schema ကိုက်ညီအောင် 'priceHistory' နှင့် 'oldPrice/newPrice/changedById' ပြင်ဆင်ပြီး
        await tx.priceHistory.create({
          data: {
            tenantId,
            productId: product.id,
            oldPrice: 0,
            newPrice: body.sellingPrice,
            changedById: userId,
            reason: "Initial product creation",
          },
        });

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
        sku: t.String(),
        barcode: t.Optional(t.String()),
        name: t.String(),
        description: t.Optional(t.String()),
        brand: t.Optional(t.String()),
        costPrice: t.Number(),
        sellingPrice: t.Number(),
        wholesalePrice: t.Optional(t.Number()),
        categoryId: t.Optional(t.String()),
        categoryName: t.Optional(t.String()),
        manufacturingDate: t.Optional(t.Date()),
        expiryDate: t.Optional(t.Date()),
        supplierId: t.Optional(t.String()),
        storeId: t.Optional(t.String()),
        initialStock: t.Optional(t.Integer()),
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

  /**
   * 5. UPDATE PRODUCT & TRACK PRICE CHANGES
   */
  .put(
    "/:id",
    async ({ params: { id }, body, tenantId, role, userId, set }) => {
      if (role !== "ADMIN" && role !== "SUPER_ADMIN" && role !== "MANAGER") {
        set.status = 403;
        return { success: false, message: "Forbidden: Access denied." };
      }

      const currentProduct = await prisma.product.findFirst({
        where: { id, tenantId, deletedAt: null },
      });

      if (!currentProduct) {
        set.status = 404;
        return { success: false, message: "Product not found." };
      }

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

      return await prisma.$transaction(async (tx) => {
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

        // 📝 စျေးနှုန်းပြောင်းလဲမှုကို စစ်ဆေးပြီး priceHistory ထဲ ထည့်သွင်းခြင်း
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
            brand: body.brand,
            costPrice: body.costPrice,
            sellingPrice: body.sellingPrice,
            wholesalePrice: body.wholesalePrice,
            categoryId: categoryId ?? undefined,
            supplierId: body.supplierId,
            manufacturingDate: body.manufacturingDate,
            expiryDate: body.expiryDate,
            isActive: body.isActive,
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
          brand: t.Optional(t.String()),
          costPrice: t.Number(),
          sellingPrice: t.Number(),
          wholesalePrice: t.Optional(t.Number()),
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

  /**
   * 6. SOFT DELETE PRODUCT
   */
  .delete(
    "/:id",
    async ({ params: { id }, tenantId, role, set }) => {
      if (role !== "ADMIN" && role !== "SUPER_ADMIN" && role !== "MANAGER") {
        set.status = 403;
        return { success: false, message: "Forbidden: Access denied." };
      }

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
//   // 🔐 မစ်ဒယ်ဝဲလ်အား ချိတ်ဆက်ပြီး tenantId, role, userId တို့ကို ရယူမည်
//   .use(tenantAuthMiddleware)

//   /**
//    * 1. READ ALL PRODUCTS WITH PAGINATION, SEARCH & FILTER
//    * GET /api/tenant/products?page=1&limit=20&search=apple&categoryId=xxx&storeId=yyy
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

//       // Filter Builder
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
//           { brand: { contains: search, mode: "insensitive" } },
//         ];
//       }

//       // Total count နှင့် ဒေတာကို Parallel ရှာဖွေခြင်း (Performance မြန်ဆန်စေရန်)
//       const [total, products] = await prisma.$transaction([
//         prisma.product.count({ where: whereCondition }),
//         prisma.product.findMany({
//           where: whereCondition,
//           include: {
//             category: true,
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
//    * 2. READ BY BARCODE (POS Scanner များအတွက် သီးသန့် endpoint)
//    * GET /api/tenant/products/barcode/:barcode
//    */
//   .get(
//     "/barcode/:barcode",
//     async ({ params: { barcode }, tenantId, set }) => {
//       const product = await prisma.product.findFirst({
//         where: { tenantId, barcode, deletedAt: null },
//         include: { category: true, supplier: true, variants: true },
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
//    * 3. READ SINGLE (ID ဖြင့် အသေးစိတ်ကြည့်ခြင်း)
//    * GET /api/tenant/products/:id
//    */
//   .get(
//     "/:id",
//     async ({ params: { id }, tenantId, set }) => {
//       const product = await prisma.product.findFirst({
//         where: { id, tenantId, deletedAt: null },
//         include: {
//           category: true,
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
//    * 4. CREATE PRODUCT & VARIANTS WITH TRANSACTION
//    * POST /api/tenant/products
//    */
//   .post(
//     "/",
//     async ({ body, tenantId, role, userId, set }) => {
//       // Role Validation
//       if (role !== "ADMIN" && role !== "SUPER_ADMIN" && role !== "MANAGER") {
//         set.status = 403;
//         return { success: false, message: "Forbidden: Access denied." };
//       }

//       // SKU & Barcode Collision Check (ထပ်မထပ် စစ်ဆေးခြင်း)
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

//       return await prisma.$transaction(async (tx) => {
//         // Category resolution logic (ID မပါလျှင် Name ဖြင့် ရှာ/ဆောက်မည်)
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

//         // Product တည်ဆောက်ခြင်း
//         const product = await tx.product.create({
//           data: {
//             tenantId,
//             sku: body.sku.trim(),
//             barcode: body.barcode?.trim(),
//             name: body.name.trim(),
//             description: body.description,
//             brand: body.brand,
//             costPrice: body.costPrice,
//             sellingPrice: body.sellingPrice,
//             categoryId,
//             supplierId: body.supplierId,
//             manufacturingDate: body.manufacturingDate,
//             expiryDate: body.expiryDate,
//             variants: body.variants
//               ? {
//                   create: body.variants.map((v) => ({
//                     tenantId,
//                     name: v.name.trim(),
//                     sku: v.sku.trim(),
//                     barcode: v.barcode?.trim(),
//                     price: v.price,
//                     costPrice: v.costPrice,
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

//         // ကနဦးစျေးနှုန်း သမိုင်းမှတ်တမ်း (Initial Price History) ထည့်သွင်းခြင်း
//         await tx.productPriceHistory.create({
//           data: {
//             productId: product.id,
//             oldCostPrice: 0,
//             newCostPrice: body.costPrice,
//             oldSellingPrice: 0,
//             newSellingPrice: body.sellingPrice,
//             changedBy: userId,
//           },
//         });

//         // ကနဦး Stock တိုးခြင်း Logic (Store ID ပါဝင်မှ လုပ်ဆောင်မည်)
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
//         sku: t.String(),
//         barcode: t.Optional(t.String()),
//         name: t.String(),
//         description: t.Optional(t.String()),
//         brand: t.Optional(t.String()),
//         costPrice: t.Number(),
//         sellingPrice: t.Number(),
//         categoryId: t.Optional(t.String()),
//         categoryName: t.Optional(t.String()),
//         manufacturingDate: t.Optional(t.Date()),
//         expiryDate: t.Optional(t.Date()),
//         supplierId: t.Optional(t.String()),
//         storeId: t.Optional(t.String()),
//         initialStock: t.Optional(t.Integer()),
//         variants: t.Optional(
//           t.Array(
//             t.Object({
//               name: t.String(),
//               price: t.Number(),
//               color: t.Optional(t.String()),
//               size: t.Optional(t.String()),
//               weight: t.Optional(t.Number()),
//               costPrice: t.Number(),
//               isActive: t.Optional(t.Boolean()),
//               sku: t.String(),
//               barcode: t.Optional(t.String()),
//             }),
//           ),
//         ),
//       }),
//     },
//   )

//   /**
//    * 5. UPDATE PRODUCT & TRACK PRICE CHANGES
//    * PUT /api/tenant/products/:id
//    */
//   .put(
//     "/:id",
//     async ({ params: { id }, body, tenantId, role, userId, set }) => {
//       if (role !== "ADMIN" && role !== "SUPER_ADMIN" && role !== "MANAGER") {
//         set.status = 403;
//         return { success: false, message: "Forbidden: Access denied." };
//       }

//       // မပြင်ခင် ပစ္စည်းသည် မိမိ Tenant ပိုင် ဟုတ်မဟုတ် အရင်စစ်ဆေးခြင်း
//       const currentProduct = await prisma.product.findFirst({
//         where: { id, tenantId, deletedAt: null },
//       });

//       if (!currentProduct) {
//         set.status = 404;
//         return { success: false, message: "Product not found." };
//       }

//       // SKU / Barcode တွေကို ပြင်ခဲ့ရင် သူများတွေနဲ့ သွားတူနေလား စစ်ဆေးခြင်း
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
//             message:
//               "The updating SKU or Barcode is already in use by another product.",
//           };
//         }
//       }

//       return await prisma.$transaction(async (tx) => {
//         // Category Resolution
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

//         // စျေးနှုန်း အပြောင်းအလဲ ရှိမရှိ စစ်ဆေးပြီး မှတ်တမ်းတင်ခြင်း
//         const costChanged =
//           body.costPrice !== undefined &&
//           body.costPrice !== currentProduct.costPrice;
//         const sellingChanged =
//           body.sellingPrice !== undefined &&
//           body.sellingPrice !== currentProduct.sellingPrice;

//         if (costChanged || sellingChanged) {
//           await tx.productPriceHistory.create({
//             data: {
//               productId: id,
//               oldCostPrice: currentProduct.costPrice,
//               newCostPrice: body.costPrice ?? currentProduct.costPrice,
//               oldSellingPrice: currentProduct.sellingPrice,
//               newSellingPrice: body.sellingPrice ?? currentProduct.sellingPrice,
//               changedBy: userId,
//             },
//           });
//         }

//         // Product Data Update ပြုလုပ်ခြင်း
//         const updatedProduct = await tx.product.update({
//           where: { id },
//           data: {
//             sku: body.sku?.trim(),
//             barcode: body.barcode?.trim(),
//             name: body.name?.trim(),
//             description: body.description,
//             brand: body.brand,
//             costPrice: body.costPrice,
//             sellingPrice: body.sellingPrice,
//             categoryId: categoryId ?? undefined,
//             supplierId: body.supplierId,
//             manufacturingDate: body.manufacturingDate,
//             expiryDate: body.expiryDate,
//             isActive: body.isActive,
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
//           brand: t.Optional(t.String()),
//           costPrice: t.Number(),
//           sellingPrice: t.Number(),
//           categoryId: t.Optional(t.String()),
//           categoryName: t.Optional(t.String()),
//           manufacturingDate: t.Optional(t.Date()),
//           expiryDate: t.Optional(t.Date()),
//           supplierId: t.Optional(t.String()),
//           isActive: t.Optional(t.Boolean()),
//         }),
//       ),
//     },
//   )

//   /**
//    * 6. SOFT DELETE PRODUCT
//    * DELETE /api/tenant/products/:id
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

//       // Soft Delete ပြုလုပ်ခြင်း
//       await prisma.product.update({
//         where: { id },
//         data: {
//           deletedAt: new Date(),
//           isActive: false,
//         },
//       });

//       return {
//         success: true,
//         message: "Product and its entities soft-deleted successfully.",
//       };
//     },
//     { params: t.Object({ id: t.String() }) },
//   );

// // old version
// // import { Elysia, t } from "elysia";
// // import { prisma } from "../lib/prisma";
// // import { requireTenantId } from "../lib/tenant";
// // import { adjustInventory } from "../lib/inventory";

// // function slugify(name: string) {
// //   return name.toLowerCase().replace(/\s+/g, "-");
// // }

// // export const productRoutes = new Elysia({
// //   prefix: "/products",
// // })
// //   .get("/", async ({ query, set }) => {
// //     const tenantId = requireTenantId({ query, set });
// //     if (!tenantId) return { message: "tenantId is required" };

// //     return prisma.product.findMany({
// //       where: {
// //         tenantId,
// //         deletedAt: null,
// //         ...(query.categoryId ? { categoryId: query.categoryId } : {}),
// //       },
// //       include: {
// //         category: true,
// //         supplier: true,
// //         variants: true,
// //         inventories: query.storeId
// //           ? { where: { storeId: query.storeId } }
// //           : true,
// //       },
// //       orderBy: { createdAt: "desc" },
// //     });
// //   })
// //   .get("/barcode/:barcode", async ({ params, query, set }) => {
// //     const tenantId = requireTenantId({ query, set });
// //     if (!tenantId) return { message: "tenantId is required" };

// //     const product = await prisma.product.findFirst({
// //       where: { tenantId, barcode: params.barcode, deletedAt: null },
// //       include: { category: true, supplier: true, variants: true },
// //     });
// //     if (!product) {
// //       set.status = 404;
// //       return { found: false, message: "No product found with this barcode" };
// //     }
// //     return { found: true, product };
// //   })
// //   .get("/:id", async ({ params, set }) => {
// //     const product = await prisma.product.findUnique({
// //       where: { id: params.id },
// //       include: {
// //         category: true,
// //         supplier: true,
// //         variants: true,
// //         inventories: { include: { store: true } },
// //         priceHistory: { take: 10, orderBy: { changedAt: "desc" } },
// //       },
// //     });
// //     if (!product) {
// //       set.status = 404;
// //       return { message: "Product not found" };
// //     }
// //     return product;
// //   })
// //   .post(
// //     "/",
// //     async ({ body, set }) => {
// //       let categoryId = body.categoryId;

// //       if (!categoryId && body.categoryName) {
// //         let category = await prisma.category.findFirst({
// //           where: {
// //             tenantId: body.tenantId,
// //             slug: slugify(body.categoryName),
// //           },
// //         });
// //         if (!category) {
// //           category = await prisma.category.create({
// //             data: {
// //               tenantId: body.tenantId,
// //               name: body.categoryName,
// //               slug: slugify(body.categoryName),
// //             },
// //           });
// //         }
// //         categoryId = category.id;
// //       }

// //       if (!categoryId) {
// //         set.status = 400;
// //         return { message: "Category ID or Name is required" };
// //       }

// //       set.status = 201;
// //       return prisma.$transaction(async (tx) => {
// //         const product = await tx.product.create({
// //           data: {
// //             tenantId: body.tenantId,
// //             sku: body.sku,
// //             barcode: body.barcode,
// //             name: body.name,
// //             description: body.description,
// //             brand: body.brand,
// //             costPrice: body.costPrice,
// //             sellingPrice: body.sellingPrice,
// //             categoryId,
// //             supplierId: body.supplierId,
// //             manufacturingDate: body.manufacturingDate,
// //             expiryDate: body.expiryDate,
// //             variants: body.variants
// //               ? {
// //                   create: body.variants.map((v) => ({
// //                     tenantId: body.tenantId,
// //                     name: v.name,
// //                     sku: v.sku,
// //                     barcode: v.barcode,
// //                     price: v.price,
// //                     costPrice: v.costPrice,
// //                     color: v.color,
// //                     size: v.size,
// //                     weight: v.weight,
// //                     isActive: v.isActive ?? true,
// //                   })),
// //                 }
// //               : undefined,
// //           },
// //           include: { variants: true },
// //         });

// //         if (body.storeId && body.initialStock && body.initialStock > 0) {
// //           await adjustInventory(tx, {
// //             tenantId: body.tenantId,
// //             storeId: body.storeId,
// //             productId: product.id,
// //             quantityDelta: body.initialStock,
// //             userId: body.userId || body.tenantId,
// //             type: "OPENING_STOCK",
// //             referenceId: product.id,
// //             referenceType: "Product",
// //             reason: "Initial stock on product creation",
// //           });
// //         }

// //         return product;
// //       });
// //     },
// //     {
// //       body: t.Object({
// //         tenantId: t.String(),
// //         sku: t.String(),
// //         barcode: t.Optional(t.String()),
// //         name: t.String(),
// //         description: t.Optional(t.String()),
// //         brand: t.Optional(t.String()),
// //         costPrice: t.Number(),
// //         sellingPrice: t.Number(),
// //         categoryId: t.Optional(t.String()),
// //         categoryName: t.Optional(t.String()),
// //         manufacturingDate: t.Optional(t.Date()),
// //         expiryDate: t.Optional(t.Date()),
// //         supplierId: t.Optional(t.String()),
// //         storeId: t.Optional(t.String()),
// //         initialStock: t.Optional(t.Integer()),
// //         userId: t.Optional(t.String()),
// //         variants: t.Optional(
// //           t.Array(
// //             t.Object({
// //               name: t.String(),
// //               price: t.Number(),
// //               color: t.Optional(t.String()),
// //               size: t.Optional(t.String()),
// //               weight: t.Optional(t.Number()),
// //               costPrice: t.Number(),
// //               isActive: t.Optional(t.Boolean()),
// //               sku: t.String(),
// //               barcode: t.Optional(t.String()),
// //             }),
// //           ),
// //         ),
// //       }),
// //     },
// //   )
// //   .put(
// //     "/:id",
// //     async ({ params, body }) => {
// //       let categoryId = body.categoryId;

// //       if (!categoryId && body.categoryName) {
// //         const existingProduct = await prisma.product.findUnique({
// //           where: { id: params.id },
// //           select: { tenantId: true },
// //         });

// //         let category = await prisma.category.findFirst({
// //           where: {
// //             tenantId: existingProduct!.tenantId,
// //             slug: slugify(body.categoryName),
// //           },
// //         });
// //         if (!category) {
// //           category = await prisma.category.create({
// //             data: {
// //               tenantId: existingProduct!.tenantId,
// //               name: body.categoryName,
// //               slug: slugify(body.categoryName),
// //             },
// //           });
// //         }
// //         categoryId = category.id;
// //       }

// //       return prisma.product.update({
// //         where: { id: params.id },
// //         data: {
// //           sku: body.sku,
// //           barcode: body.barcode,
// //           name: body.name,
// //           description: body.description,
// //           brand: body.brand,
// //           costPrice: body.costPrice,
// //           sellingPrice: body.sellingPrice,
// //           categoryId,
// //           supplierId: body.supplierId,
// //           manufacturingDate: body.manufacturingDate,
// //           expiryDate: body.expiryDate,
// //           isActive: body.isActive,
// //         },
// //       });
// //     },
// //     {
// //       body: t.Partial(
// //         t.Object({
// //           sku: t.String(),
// //           barcode: t.Optional(t.String()),
// //           name: t.String(),
// //           description: t.Optional(t.String()),
// //           brand: t.Optional(t.String()),
// //           costPrice: t.Number(),
// //           sellingPrice: t.Number(),
// //           categoryId: t.Optional(t.String()),
// //           categoryName: t.Optional(t.String()),
// //           manufacturingDate: t.Optional(t.Date()),
// //           expiryDate: t.Optional(t.Date()),
// //           supplierId: t.Optional(t.String()),
// //           isActive: t.Optional(t.Boolean()),
// //         }),
// //       ),
// //     },
// //   )
// //   .delete("/:id", async ({ params }) => {
// //     return prisma.product.update({
// //       where: { id: params.id },
// //       data: { deletedAt: new Date(), isActive: false },
// //     });
// //   });
