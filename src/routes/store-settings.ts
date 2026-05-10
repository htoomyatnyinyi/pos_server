import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";

export const storeSettingRoutes = new Elysia({
  prefix: "/store-settings",
})
  .get("/", async ({ query }) => {
    return prisma.storeSetting.findMany({
      where: {
        storeId: query.storeId,
      },
      include: {
        store: true,
      },
    });
  })
  .get("/:id", async ({ params, set }) => {
    const setting = await prisma.storeSetting.findUnique({
      where: { id: params.id },
      include: {
        store: true,
      },
    });
    if (!setting) { set.status = 404; return "Store setting not found"; }return setting;
  })
  .post(
    "/",
    async ({ body, set }) => {
      set.status = 201;
      return prisma.storeSetting.upsert({
        where: {
          storeId_settingKey: {
            storeId: body.storeId || "", // Handle global settings if storeId is null
            settingKey: body.settingKey,
          },
        },
        update: {
          settingValue: body.settingValue,
          description: body.description,
          updatedBy: body.userId,
        },
        create: {
          storeId: body.storeId,
          settingKey: body.settingKey,
          settingValue: body.settingValue,
          description: body.description,
          updatedBy: body.userId,
        },
      });
    },
    {
      body: t.Object({
        storeId: t.Optional(t.String()),
        settingKey: t.String(),
        settingValue: t.Any(),
        description: t.Optional(t.String()),
        userId: t.String(),
      }),
    },
  )
  .delete("/:id", async ({ params }) => {
    return prisma.storeSetting.delete({
      where: { id: params.id },
    });
  });
