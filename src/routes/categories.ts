import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";
import { tenantAuthMiddleware } from "../../middlewares/tenantAuthMiddleware";

// Name ကို URL Slug ပုံစံပြောင်းရန် Function
function slugify(name: string) {
  return name.toLowerCase().replace(/\s+/g, "-");
}

export const categoryRoutes = new Elysia({ prefix: "/categories" })
  .use(tenantAuthMiddleware)

  /**
   * 1. READ ALL WITH PAGINATION & SEARCH
   * GET /api/tenant/categories?page=1&limit=20&search=cloth
   */
  .get(
    "/",
    async ({ tenantId, query }) => {
      const page = query.page ? parseInt(query.page as string) : 1;
      const limit = query.limit ? parseInt(query.limit as string) : 50;
      const skip = (page - 1) * limit;
      const search = query.search as string;

      // Search Filter Builder
      const whereCondition: any = {
        tenantId,
        deletedAt: null,
      };

      if (search) {
        whereCondition.OR = [
          { name: { contains: search, mode: "insensitive" } },
          { slug: { contains: search, mode: "insensitive" } },
        ];
      }

      // Total count နှင့် ဒေတာကို Parallel ရှာဖွေခြင်း (Performance ကောင်းမွန်စေရန်)
      const [total, categories] = await prisma.$transaction([
        prisma.category.count({ where: whereCondition }),
        prisma.category.findMany({
          where: whereCondition,
          include: {
            parent: true,
            _count: { select: { products: true } },
          },
          orderBy: { sortOrder: "asc" },
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
        categories,
      };
    },
    {
      query: t.Optional(
        t.Object({
          page: t.Optional(t.String()),
          limit: t.Optional(t.String()),
          search: t.Optional(t.String()),
        }),
      ),
    },
  )

  /**
   * 2. READ SINGLE
   * GET /api/tenant/categories/:id
   */
  .get(
    "/:id",
    async ({ params: { id }, tenantId, set }) => {
      const category = await prisma.category.findFirst({
        where: { id, tenantId, deletedAt: null },
        include: { parent: true, children: true, products: true },
      });

      if (!category) {
        set.status = 404;
        return {
          success: false,
          message: "Category not found or access denied.",
        };
      }

      return { success: true, category };
    },
    { params: t.Object({ id: t.String() }) },
  )

  /**
   * 3. CREATE CATEGORY
   * POST /api/tenant/categories
   */
  .post(
    "/",
    async ({ body, tenantId, role, set }) => {
      if (role !== "ADMIN" && role !== "SUPER_ADMIN" && role !== "MANAGER") {
        set.status = 403;
        return { success: false, message: "Forbidden: Access denied." };
      }

      const generatedSlug = body.slug || slugify(body.name);

      // Slug တူညီမှု ရှိမရှိ စစ်ဆေးခြင်း
      const existingSlug = await prisma.category.findFirst({
        where: { tenantId, slug: generatedSlug, deletedAt: null },
      });

      if (existingSlug) {
        set.status = 400;
        return {
          success: false,
          message: "Category slug or name already exists.",
        };
      }

      // Parent ID ထည့်ထားရင် အမှန်တကယ် ရှိမရှိ စစ်ဆေးခြင်း
      if (body.parentId) {
        const parentCategory = await prisma.category.findFirst({
          where: { id: body.parentId, tenantId, deletedAt: null },
        });
        if (!parentCategory) {
          set.status = 400;
          return {
            success: false,
            message: "Specified parent category does not exist.",
          };
        } else {
          // parentId မပါရင် သို့မဟုတ် "null" ပို့ရင် null အဖြစ် ပြောင်းပေးပါ
          body.parentId = undefined;
        }
      }

      const newCategory = await prisma.category.create({
        data: {
          tenantId,
          name: body.name.trim(),
          slug: generatedSlug,
          description: body.description,
          parentId: body.parentId,
          sortOrder: body.sortOrder ?? 0,
        },
      });

      set.status = 201;
      return {
        success: true,
        message: "Category created successfully.",
        category: newCategory,
      };
    },
    {
      body: t.Object({
        name: t.String({ error: "Category name is required" }),
        slug: t.Optional(t.String()),
        description: t.Optional(t.String()),
        parentId: t.Optional(t.String()),
        sortOrder: t.Optional(t.Integer()),
      }),
    },
  )

  /**
   * 4. UPDATE CATEGORY
   * PUT /api/tenant/categories/:id
   */
  .put(
    "/:id",
    async ({ params: { id }, body, tenantId, role, set }) => {
      if (role !== "ADMIN" && role !== "SUPER_ADMIN" && role !== "MANAGER") {
        set.status = 403;
        return { success: false, message: "Forbidden: Access denied." };
      }

      // Category ရှိမရှိ အရင်စစ်ဆေးခြင်း
      const category = await prisma.category.findFirst({
        where: { id, tenantId, deletedAt: null },
      });

      if (!category) {
        set.status = 404;
        return { success: false, message: "Category not found." };
      }

      // နာမည်အသစ် ပြောင်းရင် Slug collision ရှိမရှိ ထပ်မံ စစ်ဆေးခြင်း
      let generatedSlug = body.slug;
      if (body.name) {
        generatedSlug = slugify(body.name);
        const existingSlug = await prisma.category.findFirst({
          where: {
            tenantId,
            slug: generatedSlug,
            deletedAt: null,
            NOT: { id }, // မိမိ ID ကို ချန်လှပ်၍ စစ်ဆေးမည်
          },
        });

        if (existingSlug) {
          set.status = 400;
          return {
            success: false,
            message: "Category name or slug already exists.",
          };
        }
      }

      // Cyclic Relationship (မိမိကိုယ်ကို Parent ပြန်လုပ်ခြင်း) ကာကွယ်ရန် စစ်ဆေးခြင်း
      if (body.parentId) {
        if (body.parentId === id) {
          set.status = 400;
          return {
            success: false,
            message: "A category cannot be its own parent.",
          };
        }

        const parentCategory = await prisma.category.findFirst({
          where: { id: body.parentId, tenantId, deletedAt: null },
        });
        if (!parentCategory) {
          set.status = 400;
          return {
            success: false,
            message: "Specified parent category does not exist.",
          };
        }
      }

      // ဒေတာ ပြင်ဆင်ခြင်း
      const updatedCategory = await prisma.category.update({
        where: { id },
        data: {
          name: body.name?.trim(),
          slug: generatedSlug,
          description: body.description,
          parentId: body.parentId,
          sortOrder: body.sortOrder,
          isActive: body.isActive,
        },
      });

      return {
        success: true,
        message: "Category updated successfully.",
        category: updatedCategory,
      };
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Partial(
        t.Object({
          name: t.Optional(t.String()),
          slug: t.Optional(t.String()),
          description: t.Optional(t.String()),
          parentId: t.Optional(t.String()),
          sortOrder: t.Optional(t.Integer()),
          isActive: t.Optional(t.Boolean()),
        }),
      ),
    },
  )

  /**
   * 5. SAFE DELETE (SOFT DELETE WITH CHILD PROTECTION)
   * DELETE /api/tenant/categories/:id
   */
  .delete(
    "/:id",
    async ({ params: { id }, tenantId, role, set }) => {
      if (role !== "ADMIN" && role !== "SUPER_ADMIN" && role !== "MANAGER") {
        set.status = 403;
        return { success: false, message: "Forbidden: Access denied." };
      }

      const category = await prisma.category.findFirst({
        where: { id, tenantId, deletedAt: null },
      });

      if (!category) {
        set.status = 404;
        return {
          success: false,
          message: "Category not found or already deleted.",
        };
      }

      // 🛡️ Safe Shield: ၎င်းအောက်တွင် Sub-categories ရှိနေပါက ဖျက်ခွင့်မပြုရန် တားမြစ်ခြင်း
      const hasChildren = await prisma.category.findFirst({
        where: { parentId: id, deletedAt: null },
      });

      if (hasChildren) {
        set.status = 400;
        return {
          success: false,
          message:
            "Cannot delete category. It contains sub-categories. Please move or delete them first.",
        };
      }

      // Soft Delete ပြုလုပ်ခြင်း
      await prisma.category.update({
        where: { id },
        data: {
          deletedAt: new Date(),
          isActive: false,
        },
      });

      return { success: true, message: "Category deleted successfully." };
    },
    { params: t.Object({ id: t.String() }) },
  );

// may be same, I didn't use it in the project
// import { Elysia, t } from "elysia";
// import { prisma } from "../lib/prisma";
// import { tenantAuthMiddleware } from "../../middlewares/tenantAuthMiddleware";

// // Name ကို URL Slug ပုံစံပြောင်းရန် Function
// function slugify(name: string) {
//   return name.toLowerCase().replace(/\s+/g, "-");
// }

// export const categoryRoutes = new Elysia({ prefix: "/categories" })
//   // 🔐 မစ်ဒယ်ဝဲလ်အား ချိတ်ဆက်ပြီး tenantId, role တို့ကို ရယူမည်
//   .use(tenantAuthMiddleware)

//   /**
//    * 1. READ ALL - မိမိ Tenant အောက်ရှိ ကဏ္ဍ (Categories) အားလုံးကို ကြည့်ရှုခြင်း
//    * GET /api/tenant/categories
//    */
//   .get("/", async ({ tenantId }) => {
//     const categories = await prisma.category.findMany({
//       where: {
//         tenantId,
//         deletedAt: null,
//       },
//       include: {
//         parent: true,
//         _count: { select: { products: true } },
//       },
//       orderBy: { sortOrder: "asc" },
//     });

//     return { success: true, categories };
//   })

//   /**
//    * 2. READ SINGLE - ကဏ္ဍတစ်ခုတည်း၏ အသေးစိတ်အား ID ဖြင့် ကြည့်ရှုခြင်း
//    * GET /api/tenant/categories/:id
//    */
//   .get(
//     "/:id",
//     async ({ params: { id }, tenantId, set }) => {
//       // 🛡️ လုံခြုံရေးအတွက် မိမိ Tenant ID နှင့် ကိုက်ညီမှုကိုပါ ထည့်သွင်းစစ်ဆေးပါသည်
//       const category = await prisma.category.findFirst({
//         where: { id, tenantId, deletedAt: null },
//         include: { parent: true, children: true, products: true },
//       });

//       if (!category) {
//         set.status = 404;
//         return {
//           success: false,
//           message: "Category not found or access denied.",
//         };
//       }

//       return { success: true, category };
//     },
//     { params: t.Object({ id: t.String() }) },
//   )

//   /**
//    * 3. CREATE - ကဏ္ဍအသစ် တည်ဆောက်ခြင်း
//    * POST /api/tenant/categories
//    */
//   .post(
//     "/",
//     async ({ body, tenantId, role, set }) => {
//       // 🛑 ADMIN နှင့် MANAGER သာ Category ဆောက်ခွင့်ပြုမည် (Cashier ကို ပိတ်ထားပါသည်)
//       if (role !== "ADMIN" && role !== "SUPER_ADMIN" && role !== "MANAGER") {
//         set.status = 403;
//         return {
//           success: false,
//           message: "Forbidden: Only admins or managers can create categories.",
//         };
//       }

//       const generatedSlug = body.slug || slugify(body.name);

//       // Slug တူညီမှု ရှိမရှိ စစ်ဆေးခြင်း
//       const existingSlug = await prisma.category.findFirst({
//         where: { tenantId, slug: generatedSlug, deletedAt: null },
//       });

//       if (existingSlug) {
//         set.status = 400;
//         return {
//           success: false,
//           message: "Category slug or name already exists.",
//         };
//       }

//       const newCategory = await prisma.category.create({
//         data: {
//           tenantId, // Middleware မှ ရလာသော စိတ်ချရသည့် tenantId ကို တိုက်ရိုက်သုံးပါသည်
//           name: body.name.trim(),
//           slug: generatedSlug,
//           description: body.description,
//           parentId: body.parentId,
//           sortOrder: body.sortOrder ?? 0,
//         },
//       });

//       set.status = 201;
//       return {
//         success: true,
//         message: "Category created successfully.",
//         category: newCategory,
//       };
//     },
//     {
//       body: t.Object({
//         name: t.String({ error: "Category name is required" }),
//         slug: t.Optional(t.String()),
//         description: t.Optional(t.String()),
//         parentId: t.Optional(t.String()),
//         sortOrder: t.Optional(t.Integer()),
//       }),
//     },
//   )

//   /**
//    * 4. UPDATE - ကဏ္ဍအချက်အလက် ပြင်ဆင်ခြင်း
//    * PUT /api/tenant/categories/:id
//    */
//   .put(
//     "/:id",
//     async ({ params: { id }, body, tenantId, role, set }) => {
//       if (role !== "ADMIN" && role !== "SUPER_ADMIN" && role !== "MANAGER") {
//         set.status = 403;
//         return { success: false, message: "Forbidden: Access denied." };
//       }

//       // ပြင်ဆင်မည့် Category သည် မိမိ Tenant ပိုင် ဟုတ်မဟုတ် အရင်စစ်ဆေးခြင်း
//       const category = await prisma.category.findFirst({
//         where: { id, tenantId, deletedAt: null },
//       });

//       if (!category) {
//         set.status = 404;
//         return { success: false, message: "Category not found." };
//       }

//       // အချက်အလက်များအား ပြင်ဆင်ခြင်း
//       const updatedCategory = await prisma.category.update({
//         where: { id },
//         data: {
//           name: body.name?.trim(),
//           slug: body.name ? slugify(body.name) : body.slug,
//           description: body.description,
//           parentId: body.parentId,
//           sortOrder: body.sortOrder,
//           isActive: body.isActive,
//         },
//       });

//       return {
//         success: true,
//         message: "Category updated successfully.",
//         category: updatedCategory,
//       };
//     },
//     {
//       params: t.Object({ id: t.String() }),
//       body: t.Partial(
//         t.Object({
//           name: t.Optional(t.String()),
//           slug: t.Optional(t.String()),
//           description: t.Optional(t.String()),
//           parentId: t.Optional(t.String()),
//           sortOrder: t.Optional(t.Integer()),
//           isActive: t.Optional(t.Boolean()),
//         }),
//       ),
//     },
//   )

//   /**
//    * 5. DELETE - ကဏ္ဍအား ဖျက်သိမ်းခြင်း (Soft Delete)
//    * DELETE /api/tenant/categories/:id
//    */
//   .delete(
//     "/:id",
//     async ({ params: { id }, tenantId, role, set }) => {
//       if (role !== "ADMIN" && role !== "SUPER_ADMIN" && role !== "MANAGER") {
//         set.status = 403;
//         return { success: false, message: "Forbidden: Access denied." };
//       }

//       const category = await prisma.category.findFirst({
//         where: { id, tenantId, deletedAt: null },
//       });

//       if (!category) {
//         set.status = 404;
//         return {
//           success: false,
//           message: "Category not found or already deleted.",
//         };
//       }

//       // Soft Delete ပြုလုပ်ခြင်း
//       await prisma.category.update({
//         where: { id },
//         data: {
//           deletedAt: new Date(),
//           isActive: false,
//         },
//       });

//       return { success: true, message: "Category deleted successfully." };
//     },
//     { params: t.Object({ id: t.String() }) },
//   );
