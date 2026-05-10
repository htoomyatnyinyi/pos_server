import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";

export const storeRoutes = new Elysia({
  prefix: "/stores",
})
  .get("/", async () => {
    return prisma.store.findMany({
      orderBy: {
        createdAt: "desc",
      },
    });
  })
  .get("/:id", async ({ params, set }) => {
    const store = await prisma.store.findUnique({
      where: { id: params.id },
      include: {
        users: true,
      },
    });
    if (!store) { set.status = 404; return "Store not found"; }return store;
  })
  .post(
    "/",
    async ({ body, set }) => {
      set.status = 201;
      return prisma.store.create({
        data: body,
      });
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
  .put(
    "/:id",
    async ({ params, body }) => {
      return prisma.store.update({
        where: { id: params.id },
        data: body,
      });
    },
    {
      body: t.Partial(
        t.Object({
          code: t.String(),
          name: t.String(),
          address: t.String(),
          phone: t.String(),
          email: t.String(),
          taxNumber: t.String(),
          isActive: t.Boolean(),
        }),
      ),
    },
  )
  .delete("/:id", async ({ params, set }) => {
    return prisma.store.delete({
      where: { id: params.id },
    });
  });
