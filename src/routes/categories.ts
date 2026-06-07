import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";
import { requireTenantId } from "../lib/tenant";

function slugify(name: string) {
  return name.toLowerCase().replace(/\s+/g, "-");
}

export const categoryRoutes = new Elysia({
  prefix: "/categories",
})
  .get("/", async ({ query, set }) => {
    const tenantId = requireTenantId({ query, set });
    if (!tenantId) return { message: "tenantId is required" };

    return prisma.category.findMany({
      where: { tenantId, deletedAt: null },
      include: { parent: true, children: true },
      orderBy: { sortOrder: "asc" },
    });
  })
  .get("/:id", async ({ params, set }) => {
    const category = await prisma.category.findUnique({
      where: { id: params.id },
      include: { parent: true, children: true, products: true },
    });
    if (!category) {
      set.status = 404;
      return { message: "Category not found" };
    }
    return category;
  })
  .post(
    "/",
    async ({ body, set }) => {
      set.status = 201;
      return prisma.category.create({
        data: {
          tenantId: body.tenantId,
          name: body.name,
          slug: body.slug || slugify(body.name),
          description: body.description,
          parentId: body.parentId,
          sortOrder: body.sortOrder ?? 0,
        },
      });
    },
    {
      body: t.Object({
        tenantId: t.String(),
        name: t.String(),
        slug: t.Optional(t.String()),
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
          name: t.Optional(t.String()),
          slug: t.Optional(t.String()),
          description: t.Optional(t.String()),
          parentId: t.Optional(t.String()),
          sortOrder: t.Optional(t.Integer()),
          isActive: t.Optional(t.Boolean()),
        }),
      ),
    },
  )
  .delete("/:id", async ({ params }) => {
    return prisma.category.update({
      where: { id: params.id },
      data: { deletedAt: new Date(), isActive: false },
    });
  });
