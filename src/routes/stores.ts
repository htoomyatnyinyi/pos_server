import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";
// import { tenantAuthMiddleware } from "../../middlewares/tenantAuthMiddleware";
import { tenantAuthMiddleware } from "../../middlewares/tenantAuthMiddleware";

export const storeRoutes = new Elysia({ prefix: "/stores" })
  .use(tenantAuthMiddleware) // 🔐 Middleware ကို ချိတ်ဆက်ခြင်း

  /**
   * 1. CREATE - ဆိုင်ခွဲအသစ် တိုးခြင်း
   */
  .post(
    "/",
    async ({ body, tenantId, role, userId, set }) => {
      // Role Check
      if (role !== "ADMIN" && role !== "SUPER_ADMIN") {
        set.status = 403;
        return {
          success: false,
          message: "Forbidden: Only Organization Admins can create stores.",
        };
      }

      // Subscription Limit Check
      const subscription = await prisma.tenantSubscription.findFirst({
        where: { tenantId },
        include: { plan: true },
      });

      if (
        subscription &&
        subscription.currentStores >= subscription.plan.maxStores
      ) {
        set.status = 403;
        return {
          success: false,
          message: `Upgrade Required: Your plan only allows ${subscription.plan.maxStores} stores.`,
        };
      }

      // Duplicate Code Check
      const existingStore = await prisma.store.findFirst({
        where: { tenantId, code: body.code.trim(), deletedAt: null },
      });

      if (existingStore) {
        set.status = 400;
        return { success: false, message: "Store code already exists." };
      }

      // Database Transaction
      const newStore = await prisma.$transaction(async (tx: any) => {
        const store = await tx.store.create({
          data: {
            tenantId,
            code: body.code.trim(),
            name: body.name,
            address: body.address,
            phone: body.phone,
            email: body.email,
            taxNumber: body.taxNumber,
          },
        });

        // StoreUser Junction Table ထဲသို့ Owner အား ချိတ်ဆက်ခြင်း
        await tx.storeUser.create({
          data: { storeId: store.id, userId, isPrimary: true },
        });

        // Subscription Count တိုးခြင်း
        await tx.tenantSubscription.updateMany({
          where: { tenantId },
          data: { currentStores: { increment: 1 } },
        });

        return store;
      });

      return {
        success: true,
        message: "Store created successfully.",
        store: newStore,
      };
    },
    {
      body: t.Object({
        code: t.String(),
        name: t.String(),
        address: t.Optional(t.String()),
        phone: t.Optional(t.String()),
        email: t.Optional(t.String()),
        taxNumber: t.Optional(t.String()),
      }),
    },
  )

  /**
   * 2. READ ALL - ဆိုင်ခွဲအားလုံးကို ကြည့်ရှုခြင်း (Manager/Cashier များပါ ခွင့်ပြုသည်)
   */
  .get("/", async ({ tenantId }) => {
    const stores = await prisma.store.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: { createdAt: "desc" },
    });
    return { success: true, stores };
  })

  /**
   * 3. READ SINGLE - ဆိုင်ခွဲတစ်ခုချင်းစီအား ID ဖြင့် အသေးစိတ်ကြည့်ခြင်း
   */
  .get(
    "/:id",
    async ({ params: { id }, tenantId, set }) => {
      const store = await prisma.store.findFirst({
        where: { id, tenantId, deletedAt: null },
      });
      if (!store) {
        set.status = 404;
        return { success: false, message: "Store not found." };
      }
      return { success: true, store };
    },
    { params: t.Object({ id: t.String() }) },
  )

  /**
   * 4. UPDATE - ဆိုင်ခွဲအချက်အလက် ပြင်ဆင်ခြင်း
   */
  .put(
    "/:id",
    async ({ params: { id }, body, tenantId, role, set }) => {
      if (role !== "ADMIN" && role !== "SUPER_ADMIN") {
        set.status = 403;
        return { success: false, message: "Forbidden: Access denied." };
      }

      const store = await prisma.store.findFirst({
        where: { id, tenantId, deletedAt: null },
      });

      if (!store) {
        set.status = 404;
        return { success: false, message: "Store not found." };
      }

      const updatedStore = await prisma.store.update({
        where: { id },
        data: {
          code: body.code?.trim(),
          name: body.name,
          address: body.address,
          phone: body.phone,
          email: body.email,
          taxNumber: body.taxNumber,
          isActive: body.isActive,
        },
      });

      return {
        success: true,
        message: "Store updated successfully.",
        store: updatedStore,
      };
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        code: t.Optional(t.String()),
        name: t.Optional(t.String()),
        address: t.Optional(t.String()),
        phone: t.Optional(t.String()),
        email: t.Optional(t.String()),
        taxNumber: t.Optional(t.String()),
        isActive: t.Optional(t.Boolean()),
      }),
    },
  )

  /**
   * 5. DELETE - ဆိုင်ခွဲအား Soft Delete လုပ်ခြင်း
   */
  .delete(
    "/:id",
    async ({ params: { id }, tenantId, role, set }) => {
      if (role !== "ADMIN" && role !== "SUPER_ADMIN") {
        set.status = 403;
        return { success: false, message: "Forbidden: Access denied." };
      }

      const store = await prisma.store.findFirst({
        where: { id, tenantId, deletedAt: null },
      });

      if (!store) {
        set.status = 404;
        return { success: false, message: "Store not found." };
      }

      await prisma.$transaction(async (tx: any) => {
        await tx.store.update({
          where: { id },
          data: { deletedAt: new Date(), isActive: false },
        });

        await tx.tenantSubscription.updateMany({
          where: { tenantId },
          data: { currentStores: { decrement: 1 } },
        });
      });

      return { success: true, message: "Store deleted successfully." };
    },
    { params: t.Object({ id: t.String() }) },
  )

  /**
   * 6. READ STORE PRODUCTS - ဆိုင်ခွဲရှိ Product များကို ကြည့်ရှုခြင်း (Pagination & Search)
   */
  .get(
    "/:id/products",
    async ({ params: { id }, query, tenantId, set }) => {
      const store = await prisma.store.findFirst({
        where: { id, tenantId, deletedAt: null },
      });

      if (!store) {
        set.status = 404;
        return { success: false, message: "Store not found." };
      }

      const page = query.page ? parseInt(query.page as string) : 1;
      const limit = query.limit ? parseInt(query.limit as string) : 20;
      const skip = (page - 1) * limit;
      const search = query.search as string;
      const categoryId = query.categoryId as string;

      const whereCondition: any = {
        tenantId,
        deletedAt: null,
        inventories: {
          some: { storeId: id },
        },
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
            variants: { include: { inventories: { where: { storeId: id } } } },
            inventories: { where: { storeId: id } },
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
      params: t.Object({ id: t.String() }),
      query: t.Optional(
        t.Object({
          page: t.Optional(t.String()),
          limit: t.Optional(t.String()),
          search: t.Optional(t.String()),
          categoryId: t.Optional(t.String()),
        }),
      ),
    },
  )

  /**
   * 7. READ SINGLE STORE PRODUCT - ဆိုင်ခွဲရှိ Product တစ်ခုချင်းစီကို ကြည့်ရှုခြင်း
   */
  .get(
    "/:id/products/:productId",
    async ({ params: { id, productId }, tenantId, set }) => {
      const product = await prisma.product.findFirst({
        where: { id: productId, tenantId, deletedAt: null },
        include: {
          category: true,
          supplier: true,
          variants: { include: { inventories: { where: { storeId: id } } } },
          inventories: { where: { storeId: id } },
        },
      });

      if (!product) {
        set.status = 404;
        return { success: false, message: "Product not found." };
      }

      return { success: true, product };
    },
    { params: t.Object({ id: t.String(), productId: t.String() }) },
  )

  /**
   * 9. READ STORE CATEGORIES - ဆိုင်ခွဲအတွက် Category များကို ကြည့်ရှုခြင်း (Global to tenant)
   */
  .get(
    "/:id/categories",
    async ({ tenantId }) => {
      const categories = await prisma.category.findMany({
        where: { tenantId, deletedAt: null, isActive: true },
        orderBy: { sortOrder: "asc" },
        include: { _count: { select: { products: true } } },
      });
      return { success: true, categories };
    },
    { params: t.Object({ id: t.String() }) },
  )

  /**
   * 10. READ STORE CUSTOMERS - ဆိုင်ခွဲအတွက် Customer များကို ကြည့်ရှုခြင်း (Global to tenant)
   */
  .get(
    "/:id/customers",
    async ({ tenantId, query }) => {
      const page = query.page ? parseInt(query.page as string) : 1;
      const limit = query.limit ? parseInt(query.limit as string) : 50;
      const skip = (page - 1) * limit;
      const search = query.search as string;

      const whereCondition: any = { tenantId, deletedAt: null, isActive: true };

      if (search) {
        whereCondition.OR = [
          { name: { contains: search, mode: "insensitive" } },
          { phone: { contains: search, mode: "insensitive" } },
          { code: { contains: search, mode: "insensitive" } },
        ];
      }

      const [total, customers] = await prisma.$transaction([
        prisma.customer.count({ where: whereCondition }),
        prisma.customer.findMany({
          where: whereCondition,
          orderBy: { createdAt: "desc" },
          skip,
          take: limit,
        }),
      ]);

      return {
        success: true,
        meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
        customers,
      };
    },
    {
      params: t.Object({ id: t.String() }),
      query: t.Optional(
        t.Object({
          page: t.Optional(t.String()),
          limit: t.Optional(t.String()),
          search: t.Optional(t.String()),
        }),
      ),
    },
  );
