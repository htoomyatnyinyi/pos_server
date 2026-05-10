import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";
import { jwt } from "@elysiajs/jwt";

export const categoryRoutes = new Elysia({
  prefix: "/categories",
})
  .use(
    jwt({
      name: "jwt",
      secret: process.env.JWT_SECRET!,
    })
  )
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
  .get("/:id", async ({ params, set }) => {
    const category = await prisma.category.findUnique({
      where: { id: params.id },
      include: {
        parent: true,
        children: true,
        products: true,
      },
    });
    if (!category) { set.status = 404; return "Category not found"; }return category;
  })
  .post(
    "/",
    async ({ body, set }) => {
      set.status = 201;
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
