import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";
import { tenantAuthMiddleware } from "../../middlewares/tenantAuthMiddleware";
import { requireRoles } from "../lib/security";

export const customerRoutes = new Elysia({ prefix: "/customers" })
  .use(tenantAuthMiddleware)

  // GET /customers – list all customers
  .get(
    "/",
    async ({ tenantId, query }) => {
      const page = query.page ? parseInt(query.page as string) : 1;
      const limit = query.limit ? parseInt(query.limit as string) : 20;
      const skip = (page - 1) * limit;
      const search = query.search as string;
      const tier = query.tier as string;

      const whereCondition: any = {
        tenantId,
        deletedAt: null,
        isActive: true,
      };
      if (tier) whereCondition.tier = tier;
      if (search) {
        whereCondition.OR = [
          { name: { contains: search, mode: "insensitive" } },
          { phone: { contains: search, mode: "insensitive" } },
          { code: { contains: search, mode: "insensitive" } },
          { email: { contains: search, mode: "insensitive" } },
        ];
      }

      const [total, customers] = await prisma.$transaction([
        prisma.customer.count({ where: whereCondition }),
        prisma.customer.findMany({
          where: whereCondition,
          orderBy: { createdAt: "desc" },
          skip,
          take: limit,
        }),
      ]);

      return {
        success: true,
        meta: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
        customers,
      };
    },
    {
      query: t.Optional(
        t.Object({
          page: t.Optional(t.String()),
          limit: t.Optional(t.String()),
          search: t.Optional(t.String()),
          tier: t.Optional(t.String()),
        }),
      ),
    },
  )

  // GET /customers/:id – get single customer
  .get(
    "/:id",
    async ({ params: { id }, tenantId, set }) => {
      const customer = await prisma.customer.findFirst({
        where: { id, tenantId, deletedAt: null },
        include: {
          orders: { take: 10, orderBy: { createdAt: "desc" } },
          wallet: true,
          giftCards: true,
        },
      });
      if (!customer) {
        set.status = 404;
        return {
          success: false,
          message: "Customer not found or access denied.",
        };
      }
      return { success: true, customer };
    },
    { params: t.Object({ id: t.String() }) },
  )

  // POST /customers – create new customer
  .post(
    "/",
    async ({ body, tenantId, userId, role, set }) => {
      requireRoles(role, ["ADMIN", "MANAGER", "SUPER_ADMIN"], set);

      const generatedCode = body.code ? body.code.trim() : `CUS-${Date.now()}`;

      const existing = await prisma.customer.findFirst({
        where: {
          tenantId,
          OR: [
            { code: generatedCode },
            ...(body.phone ? [{ phone: body.phone.trim() }] : []),
            ...(body.email ? [{ email: body.email.trim().toLowerCase() }] : []),
          ],
          deletedAt: null,
        },
      });
      if (existing) {
        set.status = 400;
        return {
          success: false,
          message: "Customer with this code, phone or email already exists.",
        };
      }

      const customer = await prisma.$transaction(async (tx: any) => {
        const created = await tx.customer.create({
          data: {
            tenantId,
            code: generatedCode,
            name: body.name.trim(),
            phone: body.phone ? body.phone.trim() : null,
            email: body.email ? body.email.trim().toLowerCase() : null,
            address: body.address ? body.address.trim() : null,
            dateOfBirth: body.dateOfBirth ? new Date(body.dateOfBirth) : null,
            gender: body.gender ?? null,
            tier: body.tier ?? "BRONZE",
          },
        });
        await tx.auditLog.create({
          data: {
            tenantId,
            userId,
            action: "CREATE",
            entity: "Customer",
            entityId: created.id,
            newData: JSON.parse(JSON.stringify(created)),
          },
        });
        return created;
      });

      set.status = 201;
      return {
        success: true,
        message: "Customer created successfully.",
        customer,
      };
    },
    {
      body: t.Object({
        code: t.Optional(t.String()),
        name: t.String({ minLength: 1 }),
        phone: t.Optional(t.String()),
        email: t.Optional(t.String()),
        address: t.Optional(t.String()),
        dateOfBirth: t.Optional(t.String()),
        gender: t.Optional(t.String()),
        tier: t.Optional(t.String()),
      }),
    },
  )

  // PUT /customers/:id – update customer
  .put(
    "/:id",
    async ({ params: { id }, body, tenantId, userId, role, set }) => {
      requireRoles(role, ["ADMIN", "MANAGER", "SUPER_ADMIN"], set);

      const currentCustomer = await prisma.customer.findFirst({
        where: { id, tenantId, deletedAt: null },
      });
      if (!currentCustomer) {
        set.status = 404;
        return { success: false, message: "Customer not found." };
      }

      const updatedCustomer = await prisma.$transaction(async (tx: any) => {
        const updated = await tx.customer.update({
          where: { id },
          data: {
            code: body.code?.trim(),
            name: body.name?.trim(),
            phone: body.phone?.trim(),
            email: body.email?.trim().toLowerCase(),
            address: body.address?.trim(),
            dateOfBirth: body.dateOfBirth
              ? new Date(body.dateOfBirth)
              : undefined,
            gender: body.gender,
            tier: body.tier,
            isActive: body.isActive,
          },
        });
        await tx.auditLog.create({
          data: {
            tenantId,
            userId,
            action: "UPDATE",
            entity: "Customer",
            entityId: id,
            oldData: JSON.parse(JSON.stringify(currentCustomer)),
            newData: JSON.parse(JSON.stringify(updated)),
          },
        });
        return updated;
      });

      return {
        success: true,
        message: "Customer updated successfully.",
        customer: updatedCustomer,
      };
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Partial(
        t.Object({
          code: t.Optional(t.String()),
          name: t.Optional(t.String()),
          phone: t.Optional(t.String()),
          email: t.Optional(t.String()),
          address: t.Optional(t.String()),
          dateOfBirth: t.Optional(t.String()),
          gender: t.Optional(t.String()),
          tier: t.Optional(t.String()),
          isActive: t.Optional(t.Boolean()),
        }),
      ),
    },
  )

  // DELETE /customers/:id – soft delete
  .delete(
    "/:id",
    async ({ params: { id }, tenantId, userId, role, set }) => {
      requireRoles(role, ["ADMIN", "MANAGER", "SUPER_ADMIN"], set);

      const customer = await prisma.customer.findFirst({
        where: { id, tenantId, deletedAt: null },
      });
      if (!customer) {
        set.status = 404;
        return {
          success: false,
          message: "Customer not found or already deleted.",
        };
      }

      await prisma.$transaction(async (tx: any) => {
        const deleted = await tx.customer.update({
          where: { id },
          data: { deletedAt: new Date(), isActive: false },
        });
        await tx.auditLog.create({
          data: {
            tenantId,
            userId,
            action: "DELETE",
            entity: "Customer",
            entityId: id,
            oldData: JSON.parse(JSON.stringify(customer)),
            newData: JSON.parse(JSON.stringify(deleted)),
          },
        });
      });

      return {
        success: true,
        message: "Customer soft-deleted successfully.",
      };
    },
    { params: t.Object({ id: t.String() }) },
  );
