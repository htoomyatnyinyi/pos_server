import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";

export const categoryRoutes = new Elysia({
  prefix: "/categories",
})
  .get("/", async () => {
    return prisma.category.findMany({
      include: {
        parent: true,
        children: true,
      },
      orderBy: {
        sortOrder: "asc",
      },
    });
  })
  .get("/:id", async ({ params }) => {
    const category = await prisma.category.findUnique({
      where: { id: params.id },
      include: {
        parent: true,
        children: true,
        products: true,
      },
    });
    if (!category) throw new Error("Category not found");
    return category;
  })
  .post(
    "/",
    async ({ body }) => {
      return prisma.category.create({
        data: body,
      });
    },
    {
      body: t.Object({
        name: t.String(),
        slug: t.String(),
        description: t.Optional(t.String()),
        parentId: t.Optional(t.String()),
        sortOrder: t.Optional(t.Integer()),
      }),
    },
  )
  .put(
    "/:id",
    async ({ params, body }) => {
      return prisma.category.update({
        where: { id: params.id },
        data: body,
      });
    },
    {
      body: t.Partial(
        t.Object({
          name: t.String(),
          slug: t.String(),
          description: t.String(),
          parentId: t.String(),
          sortOrder: t.Integer(),
          isActive: t.Boolean(),
        }),
      ),
    },
  )
  .delete("/:id", async ({ params }) => {
    return prisma.category.delete({
      where: { id: params.id },
    });
  });
