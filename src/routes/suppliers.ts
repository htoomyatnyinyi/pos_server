import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";
import { tenantAuthMiddleware } from "../../middlewares/tenantAuthMiddleware";
import { requireRoles } from "../lib/security";

export const supplierRoutes = new Elysia({ prefix: "/suppliers" })
  .use(tenantAuthMiddleware)

  .get(
    "/",
    async ({ tenantId, query }) => {
      const page = query.page ? parseInt(query.page as string) : 1;
      const limit = query.limit ? parseInt(query.limit as string) : 20;
      const skip = (page - 1) * limit;

      const whereCondition: any = {
        tenantId,
        deletedAt: null,
      };
      if (query.search) {
        const search = query.search as string;
        whereCondition.OR = [
          { name: { contains: search, mode: "insensitive" } },
          { code: { contains: search, mode: "insensitive" } },
          { contactName: { contains: search, mode: "insensitive" } },
        ];
      }

      const [total, suppliers] = await prisma.$transaction([
        prisma.supplier.count({ where: whereCondition }),
        prisma.supplier.findMany({
          where: whereCondition,
          orderBy: { createdAt: "desc" },
          skip,
          take: limit,
        }),
      ]);

      return {
        success: true,
        meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
        suppliers,
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
      const supplier = await prisma.supplier.findFirst({
        where: { id, tenantId, deletedAt: null },
        include: {
          products: { take: 10 },
          payments: { take: 10, orderBy: { createdAt: "desc" } },
        },
      });
      if (!supplier) {
        set.status = 404;
        return {
          success: false,
          message: "Supplier profile not found or access denied.",
        };
      }
      return { success: true, supplier };
    },
    { params: t.Object({ id: t.String() }) },
  )

  .post(
    "/",
    async ({ body, tenantId, userId, role, set }) => {
      requireRoles(role, ["ADMIN", "MANAGER", "SUPER_ADMIN"], set);

      const generatedCode = body.code
        ? body.code.trim().toUpperCase()
        : `SUP-${Date.now()}`;

      const existing = await prisma.supplier.findFirst({
        where: { tenantId, code: generatedCode, deletedAt: null },
      });
      if (existing) {
        set.status = 400;
        return {
          success: false,
          message: `Supplier code '${generatedCode}' is already in use.`,
        };
      }

      const supplier = await prisma.$transaction(async (tx: any) => {
        const created = await tx.supplier.create({
          data: {
            tenantId,
            code: generatedCode,
            name: body.name.trim(),
            contactName: body.contactName?.trim(),
            phone: body.phone?.trim(),
            email: body.email?.trim().toLowerCase(),
            address: body.address?.trim(),
            taxId: body.taxId?.trim(),
            paymentTerms: body.paymentTerms,
            creditLimit: body.creditLimit,
          },
        });
        await tx.auditLog.create({
          data: {
            tenantId,
            userId,
            action: "CREATE",
            entity: "Supplier",
            entityId: created.id,
            newData: JSON.parse(JSON.stringify(created)),
          },
        });
        return created;
      });

      set.status = 201;
      return {
        success: true,
        message: "Supplier registered successfully.",
        supplier,
      };
    },
    {
      body: t.Object({
        code: t.Optional(t.String()),
        name: t.String({ minLength: 2 }),
        contactName: t.Optional(t.String()),
        phone: t.Optional(t.String()),
        email: t.Optional(t.String()),
        address: t.Optional(t.String()),
        taxId: t.Optional(t.String()),
        paymentTerms: t.Optional(t.Integer()),
        creditLimit: t.Optional(t.Number()),
      }),
    },
  )

  .put(
    "/:id",
    async ({ params: { id }, body, tenantId, userId, role, set }) => {
      requireRoles(role, ["ADMIN", "MANAGER", "SUPER_ADMIN"], set);

      const current = await prisma.supplier.findFirst({
        where: { id, tenantId, deletedAt: null },
      });
      if (!current) {
        set.status = 404;
        return { success: false, message: "Supplier profile not found." };
      }

      const updated = await prisma.$transaction(async (tx: any) => {
        const result = await tx.supplier.update({
          where: { id },
          data: {
            code: body.code?.trim().toUpperCase(),
            name: body.name?.trim(),
            contactName: body.contactName?.trim(),
            phone: body.phone?.trim(),
            email: body.email?.trim().toLowerCase(),
            address: body.address?.trim(),
            taxId: body.taxId?.trim(),
            paymentTerms: body.paymentTerms,
            creditLimit: body.creditLimit,
            isActive: body.isActive,
          },
        });
        await tx.auditLog.create({
          data: {
            tenantId,
            userId,
            action: "UPDATE",
            entity: "Supplier",
            entityId: id,
            oldData: JSON.parse(JSON.stringify(current)),
            newData: JSON.parse(JSON.stringify(result)),
          },
        });
        return result;
      });

      return {
        success: true,
        message: "Supplier profile updated successfully.",
        supplier: updated,
      };
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Partial(
        t.Object({
          code: t.Optional(t.String()),
          name: t.Optional(t.String()),
          contactName: t.Optional(t.String()),
          phone: t.Optional(t.String()),
          email: t.Optional(t.String()),
          address: t.Optional(t.String()),
          taxId: t.Optional(t.String()),
          paymentTerms: t.Optional(t.Integer()),
          creditLimit: t.Optional(t.Number()),
          isActive: t.Optional(t.Boolean()),
        }),
      ),
    },
  )

  .delete(
    "/:id",
    async ({ params: { id }, tenantId, userId, role, set }) => {
      requireRoles(role, ["ADMIN", "MANAGER", "SUPER_ADMIN"], set);

      const supplier = await prisma.supplier.findFirst({
        where: { id, tenantId, deletedAt: null },
      });
      if (!supplier) {
        set.status = 404;
        return {
          success: false,
          message: "Supplier not found or already deleted.",
        };
      }

      await prisma.$transaction(async (tx: any) => {
        const deleted = await tx.supplier.update({
          where: { id },
          data: { deletedAt: new Date(), isActive: false },
        });
        await tx.auditLog.create({
          data: {
            tenantId,
            userId,
            action: "DELETE",
            entity: "Supplier",
            entityId: id,
            oldData: JSON.parse(JSON.stringify(supplier)),
            newData: JSON.parse(JSON.stringify(deleted)),
          },
        });
      });

      return {
        success: true,
        message:
          "Supplier profile has been successfully removed from active records.",
      };
    },
    { params: t.Object({ id: t.String() }) },
  );
