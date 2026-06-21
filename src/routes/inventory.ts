import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";
import { tenantAuthMiddleware } from "../../middlewares/tenantAuthMiddleware";
import { adjustInventory } from "../lib/inventory";
import { MovementType } from "@prisma/client";

export const inventoryRoutes = new Elysia({
  prefix: "/inventory",
})
  // 🔐 Multi-Tenant Authentication Middleware ချိတ်ဆက်ခြင်း
  .use(tenantAuthMiddleware)

  /**
   * 1. GET CURRENT INVENTORY STOCK BALANCES
   */
  .get(
    "/",
    async ({ tenantId, query }) => {
      const page = query.page ? parseInt(query.page as string) : 1;
      const limit = query.limit ? parseInt(query.limit as string) : 20;
      const skip = (page - 1) * limit;

      const whereCondition: any = {
        tenantId,
        ...(query.storeId ? { storeId: query.storeId as string } : {}),
        ...(query.productId ? { productId: query.productId as string } : {}),
      };

      const [total, inventory] = await prisma.$transaction([
        prisma.inventory.count({ where: whereCondition }),
        prisma.inventory.findMany({
          where: whereCondition,
          include: { product: true, variant: true, store: true },
          orderBy: { updatedAt: "desc" },
          skip,
          take: limit,
        }),
      ]);

      return {
        success: true,
        meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
        inventory,
      };
    },
    {
      query: t.Optional(
        t.Object({
          page: t.Optional(t.String()),
          limit: t.Optional(t.String()),
          storeId: t.Optional(t.String()),
          productId: t.Optional(t.String()),
        }),
      ),
    },
  )

  /**
   * 📜 STOCK MOVEMENTS NESTED GROUP (စတော့အဝင်အထွက် မှတ်တမ်းများ)
   */
  .group("/movements", (app) =>
    app
      /**
       * 2. GET ALL STOCK MOVEMENTS (HISTORY Log)
       */
      .get(
        "/",
        async ({ tenantId, query }) => {
          const page = query.page ? parseInt(query.page as string) : 1;
          const limit = query.limit ? parseInt(query.limit as string) : 20;
          const skip = (page - 1) * limit;

          const whereCondition: any = {
            tenantId,
            ...(query.storeId ? { storeId: query.storeId as string } : {}),
            ...(query.type ? { type: query.type as MovementType } : {}),
          };

          const [total, movements] = await prisma.$transaction([
            prisma.stockMovement.count({ where: whereCondition }),
            prisma.stockMovement.findMany({
              where: whereCondition,
              include: {
                product: true,
                variant: true,
                user: { select: { id: true, name: true } },
                store: true,
              },
              orderBy: { createdAt: "desc" },
              skip,
              take: limit,
            }),
          ]);

          return {
            success: true,
            meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
            movements,
          };
        },
        {
          query: t.Optional(
            t.Object({
              page: t.Optional(t.String()),
              limit: t.Optional(t.String()),
              storeId: t.Optional(t.String()),
              type: t.Optional(t.String()),
            }),
          ),
        },
      )

      /**
       * 3. POST: MANUAL STOCK ADJUSTMENT (စတော့ခ်ကို လက်manual တိုး/နှုတ်ခြင်း)
       */
      .post(
        "/",
        async ({ body, tenantId, userId, set }) => {
          if (!body.storeId) {
            set.status = 400;
            return { success: false, message: "storeId is required" };
          }

          const result = await prisma.$transaction(async (tx) => {
            return await adjustInventory(tx, {
              tenantId,
              storeId: body.storeId!,
              productId: body.productId,
              // 💡 TypeScript Safety အတွက် undefined ဖြစ်ခဲ့ပါက explicit null သို့ ပြောင်းလဲပေးခြင်း
              variantId: body.variantId ?? null,
              quantityDelta: body.quantity,
              userId, // Token မှရလာသော User ID ကို တိုက်ရိုက်သုံးသည်
              type: body.type as MovementType,
              referenceId: body.referenceId,
              referenceType: body.referenceType,
              reason: body.reason,
            });
          });

          set.status = 201;
          return {
            success: true,
            message: "Stock adjusted successfully.",
            movement: result.movement,
          };
        },
        {
          body: t.Object({
            storeId: t.String({ minLength: 1 }), // Ensure storeId is not an empty string
            productId: t.String(),
            variantId: t.Optional(t.String()),
            quantity: t.Integer(),
            type: t.String(), // Schema MovementType Enum နဲ့ကိုက်ညီစေရန် string အဖြစ်ပြောင်းလဲလက်ခံထားသည်
            referenceId: t.String(),
            referenceType: t.String(),
            reason: t.Optional(t.String()),
          }),
        },
      ),
  )

  /**
   * 📝 INVENTORY STOCK COUNTS NESTED GROUP (စတော့ခ် စာရင်းစစ်ဆေးခြင်း)
   */
  .group("/counts", (app) =>
    app
      /**
       * 4. GET ALL INVENTORY COUNT AUDITS
       */
      .get(
        "/",
        async ({ tenantId, query }) => {
          const page = query.page ? parseInt(query.page as string) : 1;
          const limit = query.limit ? parseInt(query.limit as string) : 20;
          const skip = (page - 1) * limit;

          const whereCondition = {
            tenantId,
            ...(query.storeId ? { storeId: query.storeId as string } : {}),
          };

          const [total, counts] = await prisma.$transaction([
            prisma.inventoryCount.count({ where: whereCondition }),
            prisma.inventoryCount.findMany({
              where: whereCondition,
              include: {
                store: true,
                created: true,
                approved: true,
                items: true,
              },
              orderBy: { createdAt: "desc" },
              skip,
              take: limit,
            }),
          ]);

          return {
            success: true,
            meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
            counts,
          };
        },
        {
          query: t.Optional(
            t.Object({
              page: t.Optional(t.String()),
              limit: t.Optional(t.String()),
              storeId: t.Optional(t.String()),
            }),
          ),
        },
      )

      /**
       * 5. POST: CREATE NEW INVENTORY COUNT (စတော့ခ်စာရင်းစစ်ဆေးလွှာအသစ်ဖွင့်ခြင်း)
       */
      .post(
        "/",
        async ({ body, tenantId, userId, set }) => {
          if (!body.storeId) {
            set.status = 400;
            return {
              success: false,
              message: "storeId is required to create a stock count sheet.",
            };
          }

          const countNumber = `CNT-${Date.now()}`;

          const inventoryCount = await prisma.$transaction(async (tx) => {
            const createdCount = await tx.inventoryCount.create({
              data: {
                countNumber,
                tenantId,
                storeId: body.storeId,
                scheduledDate: body.scheduledDate
                  ? new Date(body.scheduledDate)
                  : new Date(),
                createdBy: userId, // Current logged-in Auditor/Manager ID
                items: {
                  create: body.items.map((item) => ({
                    tenantId,
                    productId: item.productId,
                    // 💡 Variant ID handling to avoid TS string|null constraint issue
                    variantId: item.variantId ?? null,
                    systemQuantity: item.systemQuantity,
                    countedQuantity: item.countedQuantity,
                    variance: item.countedQuantity - item.systemQuantity, // ကွာဟချက်ကို စနစ်က Auto တွက်ချက်ခြင်း
                    reason: item.reason,
                  })),
                },
              },
              include: { items: true },
            });

            // စနစ်ထဲသို့ သမိုင်းမှတ်တမ်း ရေးသွင်းခြင်း
            await tx.auditLog.create({
              data: {
                tenantId,
                userId,
                action: "CREATE",
                entity: "InventoryCount",
                entityId: createdCount.id,
                newData: JSON.parse(JSON.stringify(createdCount)),
              },
            });

            return createdCount;
          });

          set.status = 201;
          return {
            success: true,
            message: "Inventory Stock Count created successfully.",
            inventoryCount,
          };
        },
        {
          body: t.Object({
            storeId: t.String(),
            scheduledDate: t.Optional(t.String()),
            items: t.Array(
              t.Object({
                productId: t.String(),
                variantId: t.Optional(t.String()),
                systemQuantity: t.Integer(),
                countedQuantity: t.Integer(),
                reason: t.Optional(t.String()),
              }),
            ),
          }),
        },
      ),
  );
