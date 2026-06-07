import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";

export const tenantRoutes = new Elysia({
  prefix: "/tenants",
})
  .get("/", async () => {
    return prisma.tenant.findMany({
      where: { deletedAt: null },
      include: { subscription: { include: { plan: true } } },
      orderBy: { createdAt: "desc" },
    });
  })
  .get("/:id", async ({ params, set }) => {
    const tenant = await prisma.tenant.findUnique({
      where: { id: params.id },
      include: {
        subscription: { include: { plan: true } },
        stores: { where: { deletedAt: null } },
        tenantFeatures: { include: { feature: true } },
      },
    });
    if (!tenant) {
      set.status = 404;
      return { message: "Tenant not found" };
    }
    return tenant;
  })
  .post(
    "/",
    async ({ body, set }) => {
      set.status = 201;
      return prisma.tenant.create({
        data: {
          code: body.code || `TNT-${Date.now()}`,
          name: body.name,
          email: body.email,
          phone: body.phone,
        },
      });
    },
    {
      body: t.Object({
        code: t.Optional(t.String()),
        name: t.String(),
        email: t.Optional(t.String()),
        phone: t.Optional(t.String()),
      }),
    },
  )
  .put(
    "/:id",
    async ({ params, body }) => {
      return prisma.tenant.update({
        where: { id: params.id },
        data: body,
      });
    },
    {
      body: t.Partial(
        t.Object({
          name: t.Optional(t.String()),
          email: t.Optional(t.String()),
          phone: t.Optional(t.String()),
          isActive: t.Optional(t.Boolean()),
        }),
      ),
    },
  )
  .delete("/:id", async ({ params }) => {
    return prisma.tenant.update({
      where: { id: params.id },
      data: { deletedAt: new Date(), isActive: false },
    });
  });
