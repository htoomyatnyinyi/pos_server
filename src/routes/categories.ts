import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";
import { tenantAuthMiddleware } from "../../middlewares/tenantAuthMiddleware";
import { requirePermission, requireRoles } from "../lib/security";

function slugify(name: string) {
  return name.toLowerCase().replace(/\s+/g, "-");
}

export const categoryRoutes = new Elysia({ prefix: "/categories" })
  .use(tenantAuthMiddleware)

  .get(
    "/",
    async ({ tenantId, query }) => {
      const page = query.page ? parseInt(query.page as string) : 1;
      const limit = query.limit ? parseInt(query.limit as string) : 50;
      const skip = (page - 1) * limit;
      const search = query.search as string;

      const whereCondition: any = { tenantId, deletedAt: null };
      if (search) {
        whereCondition.OR = [
          { name: { contains: search, mode: "insensitive" } },
          { slug: { contains: search, mode: "insensitive" } },
        ];
      }

      const [total, categories] = await prisma.$transaction([
        prisma.category.count({ where: whereCondition }),
        prisma.category.findMany({
          where: whereCondition,
          include: {
            parent: true,
            _count: { select: { products: true } },
          },
          orderBy: { sortOrder: "asc" },
          skip,
          take: limit,
        }),
      ]);

      return {
        success: true,
        meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
        categories,
      };
    },
    {
      query: t.Optional(
        t.Object({
          page: t.Optional(t.String()),
          limit: t.Optional(t.String()),
          search: t.Optional(t.String()),
        }),
      ),
    },
  )

  .get(
    "/:id",
    async ({ params: { id }, tenantId, set }) => {
      const category = await prisma.category.findFirst({
        where: { id, tenantId, deletedAt: null },
        include: { parent: true, children: true, products: true },
      });
      if (!category) {
        set.status = 404;
        return {
          success: false,
          message: "Category not found or access denied.",
        };
      }
      return { success: true, category };
    },
    { params: t.Object({ id: t.String() }) },
  )

  .post(
    "/",
    async ({ body, tenantId, userId, role, set }) => {
      requireRoles(role, ["ADMIN", "MANAGER", "SUPER_ADMIN"], set);
      await requirePermission(userId, role, "MANAGE_INVENTORY", set);

      const generatedSlug = body.slug || slugify(body.name);
      const existingSlug = await prisma.category.findFirst({
        where: { tenantId, slug: generatedSlug, deletedAt: null },
      });
      if (existingSlug) {
        set.status = 400;
        return {
          success: false,
          message: "Category slug or name already exists.",
        };
      }

      if (body.parentId) {
        const parent = await prisma.category.findFirst({
          where: { id: body.parentId, tenantId, deletedAt: null },
        });
        if (!parent) {
          set.status = 400;
          return { success: false, message: "Parent category does not exist." };
        }
      }

      const category = await prisma.$transaction(async (tx: any) => {
        const created = await tx.category.create({
          data: {
            tenantId,
            name: body.name.trim(),
            slug: generatedSlug,
            description: body.description,
            parentId: body.parentId,
            sortOrder: body.sortOrder ?? 0,
          },
        });
        await tx.auditLog.create({
          data: {
            tenantId,
            userId,
            action: "CREATE",
            entity: "Category",
            entityId: created.id,
            newData: JSON.parse(JSON.stringify(created)),
          },
        });
        return created;
      });

      set.status = 201;
      return {
        success: true,
        message: "Category created successfully.",
        category,
      };
    },
    {
      body: t.Object({
        name: t.String({ error: "Category name is required" }),
        slug: t.Optional(t.String()),
        description: t.Optional(t.String()),
        parentId: t.Optional(t.String()),
        sortOrder: t.Optional(t.Integer()),
      }),
    },
  )

  .put(
    "/:id",
    async ({ params: { id }, body, tenantId, userId, role, set }) => {
      requireRoles(role, ["ADMIN", "MANAGER", "SUPER_ADMIN"], set);
      await requirePermission(userId, role, "MANAGE_INVENTORY", set);

      const category = await prisma.category.findFirst({
        where: { id, tenantId, deletedAt: null },
      });
      if (!category) {
        set.status = 404;
        return { success: false, message: "Category not found." };
      }

      let generatedSlug = body.slug;
      if (body.name) {
        generatedSlug = slugify(body.name);
        const existing = await prisma.category.findFirst({
          where: {
            tenantId,
            slug: generatedSlug,
            deletedAt: null,
            NOT: { id },
          },
        });
        if (existing) {
          set.status = 400;
          return {
            success: false,
            message: "Category name or slug already exists.",
          };
        }
      }

      if (body.parentId) {
        if (body.parentId === id) {
          set.status = 400;
          return {
            success: false,
            message: "A category cannot be its own parent.",
          };
        }
        const parent = await prisma.category.findFirst({
          where: { id: body.parentId, tenantId, deletedAt: null },
        });
        if (!parent) {
          set.status = 400;
          return { success: false, message: "Parent category does not exist." };
        }
      }

      const updated = await prisma.category.update({
        where: { id },
        data: {
          name: body.name?.trim(),
          slug: generatedSlug,
          description: body.description,
          parentId: body.parentId,
          sortOrder: body.sortOrder,
          isActive: body.isActive,
        },
      });

      await prisma.auditLog.create({
        data: {
          tenantId,
          userId,
          action: "UPDATE",
          entity: "Category",
          entityId: id,
          oldData: JSON.parse(JSON.stringify(category)),
          newData: JSON.parse(JSON.stringify(updated)),
        },
      });

      return {
        success: true,
        message: "Category updated successfully.",
        category: updated,
      };
    },
    {
      params: t.Object({ id: t.String() }),
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

  .delete(
    "/:id",
    async ({ params: { id }, tenantId, userId, role, set }) => {
      requireRoles(role, ["ADMIN", "MANAGER", "SUPER_ADMIN"], set);
      await requirePermission(userId, role, "MANAGE_INVENTORY", set);

      const category = await prisma.category.findFirst({
        where: { id, tenantId, deletedAt: null },
      });
      if (!category) {
        set.status = 404;
        return {
          success: false,
          message: "Category not found or already deleted.",
        };
      }

      const hasChildren = await prisma.category.findFirst({
        where: { parentId: id, deletedAt: null },
      });
      if (hasChildren) {
        set.status = 400;
        return {
          success: false,
          message:
            "Cannot delete category. It contains sub-categories. Please move or delete them first.",
        };
      }

      await prisma.$transaction(async (tx: any) => {
        const deleted = await tx.category.update({
          where: { id },
          data: { deletedAt: new Date(), isActive: false },
        });
        await tx.auditLog.create({
          data: {
            tenantId,
            userId,
            action: "DELETE",
            entity: "Category",
            entityId: id,
            oldData: JSON.parse(JSON.stringify(category)),
            newData: JSON.parse(JSON.stringify(deleted)),
          },
        });
      });

      return { success: true, message: "Category deleted successfully." };
    },
    { params: t.Object({ id: t.String() }) },
  );
