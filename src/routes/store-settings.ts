import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";
import { tenantAuthMiddleware } from "../../middlewares/tenantAuthMiddleware";
import { validateStore, requireRoles } from "../lib/security";

export const storeSettingRoutes = new Elysia({ prefix: "/store-settings" })
  .use(tenantAuthMiddleware)

  .get(
    "/",
    async ({ tenantId, query }) => {
      const settings = await prisma.storeSetting.findMany({
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
      return settings;
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

  .get(
    "/:id",
    async ({ params: { id }, tenantId, set }) => {
      const setting = await prisma.storeSetting.findFirst({
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

  .post(
    "/",
    async ({ body, tenantId, userId, role, set }) => {
      requireRoles(role, ["ADMIN", "MANAGER", "SUPER_ADMIN"], set);
      if (!body.storeId) {
        set.status = 400;
        return {
          success: false,
          message: "storeId is required to map setting configuration.",
        };
      }
      await validateStore(body.storeId, tenantId);

      const currentSetting = await prisma.storeSetting.findFirst({
        where: {
          storeId: body.storeId,
          settingKey: body.settingKey,
          tenantId,
        },
      });

      const finalValue =
        typeof body.settingValue === "object"
          ? JSON.stringify(body.settingValue)
          : String(body.settingValue);

      const setting = await prisma.$transaction(async (tx: any) => {
        const result = await tx.storeSetting.upsert({
          where: {
            storeId_settingKey: {
              storeId: body.storeId,
              settingKey: body.settingKey,
            },
          },
          update: {
            settingValue: finalValue,
            description: body.description ?? null,
            updatedById: userId,
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
        await tx.auditLog.create({
          data: {
            tenantId,
            userId,
            action: currentSetting ? "UPDATE" : "CREATE",
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
        settingValue: t.Any(),
        description: t.Optional(t.String()),
      }),
    },
  )

  .delete(
    "/:id",
    async ({ params: { id }, tenantId, userId, role, set }) => {
      requireRoles(role, ["ADMIN", "MANAGER", "SUPER_ADMIN"], set);
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
      await prisma.$transaction(async (tx: any) => {
        await tx.storeSetting.delete({ where: { id } });
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
      });
      return {
        success: true,
        message: "Store configuration key successfully reset/removed.",
      };
    },
    { params: t.Object({ id: t.String() }) },
  );
