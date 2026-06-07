import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";
import { requireTenantId } from "../lib/tenant";

export const storeSettingRoutes = new Elysia({
  prefix: "/store-settings",
})
  .get("/", async ({ query, set }) => {
    const tenantId = requireTenantId({ query, set });
    if (!tenantId) return { message: "tenantId is required" };

    return prisma.storeSetting.findMany({
      where: {
        tenantId,
        ...(query.storeId ? { storeId: query.storeId } : {}),
      },
      include: { store: true, updatedBy: { select: { id: true, name: true } } },
    });
  })
  .get("/:id", async ({ params, set }) => {
    const setting = await prisma.storeSetting.findUnique({
      where: { id: params.id },
      include: { store: true, updatedBy: true },
    });
    if (!setting) {
      set.status = 404;
      return { message: "Store setting not found" };
    }
    return setting;
  })
  .post(
    "/",
    async ({ body, set }) => {
      if (!body.storeId) {
        set.status = 400;
        return { message: "storeId is required" };
      }

      set.status = 201;
      return prisma.storeSetting.upsert({
        where: {
          storeId_settingKey: {
            storeId: body.storeId,
            settingKey: body.settingKey,
          },
        },
        update: {
          settingValue: body.settingValue,
          description: body.description,
          updatedById: body.userId,
        },
        create: {
          tenantId: body.tenantId,
          storeId: body.storeId,
          settingKey: body.settingKey,
          settingValue: body.settingValue,
          description: body.description,
          updatedById: body.userId,
        },
      });
    },
    {
      body: t.Object({
        tenantId: t.String(),
        storeId: t.String(),
        settingKey: t.String(),
        settingValue: t.Any(),
        description: t.Optional(t.String()),
        userId: t.String(),
      }),
    },
  )
  .delete("/:id", async ({ params }) => {
    return prisma.storeSetting.delete({ where: { id: params.id } });
  });
