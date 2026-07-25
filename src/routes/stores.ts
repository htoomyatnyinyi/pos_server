import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";
import { tenantAuthMiddleware } from "../../middlewares/tenantAuthMiddleware";
import { requireRoles } from "../lib/security";

export const storeRoutes = new Elysia({ prefix: "/stores" })
  .use(tenantAuthMiddleware)

  // -------------------------------------------------------------------
  // 1. CREATE STORE
  // -------------------------------------------------------------------
  .post(
    "/",
    async ({ body, tenantId, role, userId, set }) => {
      requireRoles(role, ["ADMIN", "SUPER_ADMIN"], set);

      // Subscription limit check
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

      // Duplicate code check
      const existingStore = await prisma.store.findFirst({
        where: { tenantId, code: body.code.trim(), deletedAt: null },
      });
      if (existingStore) {
        set.status = 400;
        return { success: false, message: "Store code already exists." };
      }

      // Create store
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
        // Link current user as primary store user
        await tx.storeUser.create({
          data: { storeId: store.id, userId, isPrimary: true },
        });
        // Increment subscription store count
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

  // -------------------------------------------------------------------
  // 2. LIST ALL STORES (TENANT SCOPE)
  // -------------------------------------------------------------------
  .get("/", async ({ tenantId }) => {
    const stores = await prisma.store.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: { createdAt: "desc" },
    });
    return { success: true, stores };
  })

  // -------------------------------------------------------------------
  // 3. GET SINGLE STORE
  // -------------------------------------------------------------------
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

  // -------------------------------------------------------------------
  // 4. UPDATE STORE
  // -------------------------------------------------------------------
  .put(
    "/:id",
    async ({ params: { id }, body, tenantId, role, set }) => {
      requireRoles(role, ["ADMIN", "SUPER_ADMIN"], set);

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

  // -------------------------------------------------------------------
  // 5. DELETE STORE (SOFT DELETE + ACTIVE SESSIONS CHECK)
  // -------------------------------------------------------------------
  .delete(
    "/:id",
    async ({ params: { id }, tenantId, role, set }) => {
      requireRoles(role, ["ADMIN", "SUPER_ADMIN"], set);

      const store = await prisma.store.findFirst({
        where: { id, tenantId, deletedAt: null },
      });
      if (!store) {
        set.status = 404;
        return { success: false, message: "Store not found." };
      }

      // Prevent deletion if there are active orders or open sessions
      const hasOrders = await prisma.order.findFirst({
        where: { storeId: id, deletedAt: null },
      });
      if (hasOrders) {
        set.status = 400;
        return {
          success: false,
          message:
            "Cannot delete store with existing orders. Archive or reassign orders first.",
        };
      }

      const openSessions = await prisma.session.findFirst({
        where: { storeId: id, status: "OPEN" },
      });
      if (openSessions) {
        set.status = 400;
        return {
          success: false,
          message:
            "Cannot delete store with open sessions. Close all sessions first.",
        };
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

  // -------------------------------------------------------------------
  // 6. GET STORE PRODUCTS (FLATTENED – READ ONLY)
  // -------------------------------------------------------------------
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
        inventories: { some: { storeId: id } },
      };
      if (categoryId) whereCondition.categoryId = categoryId;
      if (search) {
        whereCondition.OR = [
          { name: { contains: search, mode: "insensitive" } },
          { sku: { contains: search, mode: "insensitive" } },
          { barcode: { contains: search, mode: "insensitive" } },
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
        meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
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

  // -------------------------------------------------------------------
  // 7. GET SINGLE STORE PRODUCT
  // -------------------------------------------------------------------
  .get(
    "/:id/products/:productId",
    async ({ params: { id, productId }, tenantId, set }) => {
      const product = await prisma.product.findFirst({
        where: { id: productId, tenantId, deletedAt: null },
        include: {
          category: true,
          brand: true,
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

  // -------------------------------------------------------------------
  // 8. GET STORE CATEGORIES (TENANT GLOBAL)
  // -------------------------------------------------------------------
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

  // -------------------------------------------------------------------
  // 9. GET STORE ORDERS
  // -------------------------------------------------------------------
  .get(
    "/:id/orders",
    async ({ tenantId, params: { id }, query, set }) => {
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

      const whereCondition: any = { tenantId, storeId: id };
      if (search) {
        whereCondition.OR = [
          { orderNumber: { contains: search, mode: "insensitive" } },
          { customer: { name: { contains: search, mode: "insensitive" } } },
          { customer: { phone: { contains: search, mode: "insensitive" } } },
        ];
      }

      const [total, orders] = await prisma.$transaction([
        prisma.order.count({ where: whereCondition }),
        prisma.order.findMany({
          where: whereCondition,
          include: { customer: true },
          orderBy: { createdAt: "desc" },
          skip,
          take: limit,
        }),
      ]);

      return {
        success: true,
        meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
        orders,
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
  )

  // -------------------------------------------------------------------
  // 10. GET STORE CUSTOMERS
  // -------------------------------------------------------------------
  .get(
    "/:id/customers",
    async ({ tenantId, query }) => {
      const page = query.page ? parseInt(query.page as string) : 1;
      const limit = query.limit ? parseInt(query.limit as string) : 50;
      const skip = (page - 1) * limit;
      const search = query.search as string;

      const whereCondition: any = {
        tenantId,
        deletedAt: null,
        isActive: true,
      };
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
  )

  // -------------------------------------------------------------------
  // 11. GET STORE BRANDS (TENANT GLOBAL)
  // -------------------------------------------------------------------
  .get(
    "/:id/brands",
    async ({ tenantId }) => {
      const brands = await prisma.brand.findMany({
        where: { tenantId, deletedAt: null, isActive: true },
        orderBy: { name: "asc" },
        include: { _count: { select: { products: true } } },
      });
      return { success: true, brands };
    },
    { params: t.Object({ id: t.String() }) },
  )

  // -------------------------------------------------------------------
  // 12. GET STORE SUPPLIERS (TENANT GLOBAL)
  // -------------------------------------------------------------------
  .get(
    "/:id/suppliers",
    async ({ tenantId, query }) => {
      const page = query.page ? parseInt(query.page as string) : 1;
      const limit = query.limit ? parseInt(query.limit as string) : 50;
      const skip = (page - 1) * limit;
      const search = query.search as string;

      const whereCondition: any = {
        tenantId,
        deletedAt: null,
        isActive: true,
      };
      if (search) {
        whereCondition.OR = [
          { name: { contains: search, mode: "insensitive" } },
          { code: { contains: search, mode: "insensitive" } },
          { contactName: { contains: search, mode: "insensitive" } },
          { phone: { contains: search, mode: "insensitive" } },
        ];
      }

      const [total, suppliers] = await prisma.$transaction([
        prisma.supplier.count({ where: whereCondition }),
        prisma.supplier.findMany({
          where: whereCondition,
          orderBy: { name: "asc" },
          skip,
          take: limit,
        }),
      ]);

      return {
        success: true,
        meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
        suppliers,
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
