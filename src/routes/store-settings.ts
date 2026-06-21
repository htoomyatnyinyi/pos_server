import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";
import { tenantAuthMiddleware } from "../../middlewares/tenantAuthMiddleware";

export const storeSettingRoutes = new Elysia({
  prefix: "/store-settings",
})
  // 🔐 Multi-Tenant Authentication Middleware ချိတ်ဆက်ခြင်း
  .use(tenantAuthMiddleware)

  /**
   * 1. GET ALL STORE SETTINGS WITH TENANT ISOLATION
   */
  .get(
    "/",
    async ({ tenantId, query }) => {
      return prisma.storeSetting.findMany({
        where: {
          tenantId,
          ...(query.storeId ? { storeId: query.storeId as string } : {}),
          ...(query.settingKey
            ? { settingKey: query.settingKey as string }
            : {}),
        },
        include: {
          store: true,
          updatedBy: { select: { id: true, name: true, email: true } },
        },
        orderBy: { settingKey: "asc" },
      });
    },
    {
      query: t.Optional(
        t.Object({
          storeId: t.Optional(t.String()),
          settingKey: t.Optional(t.String()),
        }),
      ),
    },
  )

  /**
   * 2. GET SINGLE STORE SETTING BY ID
   */
  .get(
    "/:id",
    async ({ params: { id }, tenantId, set }) => {
      const setting = await prisma.storeSetting.findFirst({
        // 🚨 Security Boundary Constraint စစ်ဆေးခြင်း
        where: { id, tenantId },
        include: {
          store: true,
          updatedBy: { select: { id: true, name: true } },
        },
      });

      if (!setting) {
        set.status = 404;
        return {
          success: false,
          message: "Store configuration setting not found.",
        };
      }

      return { success: true, setting };
    },
    { params: t.Object({ id: t.String() }) },
  )

  /**
   * 3. POST: UPSERT STORE SETTING (CREATE OR UPDATE CONFIGURATION KEY)
   */
  .post(
    "/",
    async ({ body, tenantId, userId, set }) => {
      if (!body.storeId) {
        set.status = 400;
        return {
          success: false,
          message: "storeId is required to map setting configuration.",
        };
      }

      // ၁။ ဒေတာဘေ့စ်ထဲမှာ ယခု Key ရှိနှင့်ပြီးသားလား ကြိုတင်စစ်ဆေးခြင်း (For Accurate Audit Logging)
      const currentSetting = await prisma.storeSetting.findFirst({
        where: {
          storeId: body.storeId,
          settingKey: body.settingKey,
          tenantId,
        },
      });

      // ၂။ JSON Data Normalization Handling
      // တကယ်လို့ ပေးပို့လိုက်တဲ့ value က string မဟုတ်ဘဲ Array သို့မဟုတ် Object ဖြစ်နေခဲ့ရင် Safe ဖြစ်အောင် Stringify လုပ်ပါမည်
      const finalValue =
        typeof body.settingValue === "object"
          ? JSON.stringify(body.settingValue)
          : String(body.settingValue);

      const setting = await prisma.$transaction(async (tx) => {
        const result = await tx.storeSetting.upsert({
          where: {
            // Prisma Composite Unique Index Field ကို အသုံးပြုခြင်း
            storeId_settingKey: {
              storeId: body.storeId,
              settingKey: body.settingKey,
            },
          },
          update: {
            settingValue: finalValue,
            description: body.description ?? null,
            updatedById: userId, // Current Logged In User
          },
          create: {
            tenantId,
            storeId: body.storeId,
            settingKey: body.settingKey,
            settingValue: finalValue,
            description: body.description ?? null,
            updatedById: userId,
          },
        });

        // ၃။ System Action Audit Trail မှတ်တမ်းသွင်းခြင်း
        await tx.auditLog.create({
          data: {
            tenantId,
            userId,
            action: currentSetting ? "UPDATE" : "CREATE", // 💡 အသစ်ဆောက်တာလား၊ အဟောင်းပြင်တာလား ခွဲခြားသတ်မှတ်ခြင်း
            entity: "StoreSetting",
            entityId: result.id,
            oldData: currentSetting
              ? JSON.parse(JSON.stringify(currentSetting))
              : null,
            newData: JSON.parse(JSON.stringify(result)),
          },
        });

        return result;
      });

      set.status = currentSetting ? 200 : 201;
      return {
        success: true,
        message: currentSetting
          ? "Configuration key updated successfully."
          : "New configuration key registered.",
        setting,
      };
    },
    {
      body: t.Object({
        storeId: t.String({ minLength: 1 }),
        settingKey: t.String({ minLength: 1 }),
        settingValue: t.Any(), // Supports dynamic structures like numbers, strings, or toggles
        description: t.Optional(t.String()),
      }),
    },
  )

  /**
   * 4. DELETE: RESET/REMOVE STORE CONFIGURATION KEY
   */
  .delete(
    "/:id",
    async ({ params: { id }, tenantId, userId, set }) => {
      const setting = await prisma.storeSetting.findFirst({
        where: { id, tenantId },
      });

      if (!setting) {
        set.status = 404;
        return {
          success: false,
          message: "Configuration key not found or access denied.",
        };
      }

      const deletedSetting = await prisma.$transaction(async (tx) => {
        const removed = await tx.storeSetting.delete({
          where: { id },
        });

        // Track configuration deletion inside history log
        await tx.auditLog.create({
          data: {
            tenantId,
            userId,
            action: "DELETE",
            entity: "StoreSetting",
            entityId: id,
            oldData: JSON.parse(JSON.stringify(setting)),
          },
        });

        return removed;
      });

      return {
        success: true,
        message: "Store configuration key successfully reset/removed.",
      };
    },
    { params: t.Object({ id: t.String() }) },
  );
