import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";
import { tenantAuthMiddleware } from "../../middlewares/tenantAuthMiddleware";
import { validateStore, requireRoles } from "../lib/security";

export const cashRegisterRoutes = new Elysia({ prefix: "/cash-registers" })
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
        ...(query.storeId ? { storeId: query.storeId as string } : {}),
        ...(query.status ? { status: query.status as any } : {}),
      };
      const [total, cashRegisters] = await prisma.$transaction([
        prisma.cashRegister.count({ where: whereCondition }),
        prisma.cashRegister.findMany({
          where: whereCondition,
          include: { store: true },
          orderBy: { createdAt: "desc" },
          skip,
          take: limit,
        }),
      ]);
      return {
        success: true,
        meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
        cashRegisters,
      };
    },
    {
      query: t.Optional(
        t.Object({
          page: t.Optional(t.String()),
          limit: t.Optional(t.String()),
          storeId: t.Optional(t.String()),
          status: t.Optional(t.String()),
        }),
      ),
    },
  )

  .get(
    "/:id",
    async ({ params: { id }, tenantId, set }) => {
      const register = await prisma.cashRegister.findFirst({
        where: { id, tenantId, deletedAt: null },
        include: {
          store: true,
          sessions: {
            take: 10,
            orderBy: { openedAt: "desc" },
            include: { user: { select: { name: true } } },
          },
        },
      });
      if (!register) {
        set.status = 404;
        return {
          success: false,
          message: "Cash register not found or access denied.",
        };
      }
      return { success: true, register };
    },
    { params: t.Object({ id: t.String() }) },
  )

  .post(
    "/",
    async ({ body, tenantId, userId, role, set }) => {
      requireRoles(role, ["ADMIN", "MANAGER", "SUPER_ADMIN"], set);
      await validateStore(body.storeId, tenantId);

      const register = await prisma.$transaction(async (tx: any) => {
        const created = await tx.cashRegister.create({
          data: {
            tenantId,
            storeId: body.storeId,
            name: body.name.trim(),
            status: body.status || "CLOSED",
          },
        });
        await tx.auditLog.create({
          data: {
            tenantId,
            userId,
            action: "CREATE",
            entity: "CashRegister",
            entityId: created.id,
            newData: JSON.parse(JSON.stringify(created)),
          },
        });
        return created;
      });

      set.status = 201;
      return {
        success: true,
        message: "Cash register created successfully.",
        register,
      };
    },
    {
      body: t.Object({
        storeId: t.String(),
        name: t.String({ minLength: 1 }),
        status: t.Optional(
          t.Enum({
            OPEN: "OPEN",
            CLOSED: "CLOSED",
            SUSPENDED: "SUSPENDED",
            MAINTENANCE: "MAINTENANCE",
          }),
        ),
      }),
    },
  )

  .put(
    "/:id",
    async ({ params: { id }, body, tenantId, userId, role, set }) => {
      requireRoles(role, ["ADMIN", "MANAGER", "SUPER_ADMIN"], set);

      const currentRegister = await prisma.cashRegister.findFirst({
        where: { id, tenantId, deletedAt: null },
      });
      if (!currentRegister) {
        set.status = 404;
        return {
          success: false,
          message: "Cash register not found or access denied.",
        };
      }

      const updatedRegister = await prisma.cashRegister.update({
        where: { id },
        data: {
          name: body.name?.trim(),
          status: body.status,
        },
      });

      await prisma.auditLog.create({
        data: {
          tenantId,
          userId,
          action: "UPDATE",
          entity: "CashRegister",
          entityId: id,
          oldData: JSON.parse(JSON.stringify(currentRegister)),
          newData: JSON.parse(JSON.stringify(updatedRegister)),
        },
      });

      return {
        success: true,
        message: "Cash register updated successfully.",
        register: updatedRegister,
      };
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Partial(
        t.Object({
          name: t.Optional(t.String()),
          status: t.Optional(
            t.Enum({
              OPEN: "OPEN",
              CLOSED: "CLOSED",
              SUSPENDED: "SUSPENDED",
              MAINTENANCE: "MAINTENANCE",
            }),
          ),
        }),
      ),
    },
  )

  .delete(
    "/:id",
    async ({ params: { id }, tenantId, userId, role, set }) => {
      requireRoles(role, ["ADMIN", "MANAGER", "SUPER_ADMIN"], set);

      const register = await prisma.cashRegister.findFirst({
        where: { id, tenantId, deletedAt: null },
      });
      if (!register) {
        set.status = 404;
        return {
          success: false,
          message: "Cash register not found or already deleted.",
        };
      }

      // Check for open sessions
      const openSession = await prisma.session.findFirst({
        where: { registerId: id, status: "OPEN" },
      });
      if (openSession) {
        set.status = 400;
        return {
          success: false,
          message: "Cannot delete register with open session.",
        };
      }

      await prisma.$transaction(async (tx: any) => {
        const updated = await tx.cashRegister.update({
          where: { id },
          data: {
            deletedAt: new Date(),
            status: "CLOSED",
          },
        });
        await tx.auditLog.create({
          data: {
            tenantId,
            userId,
            action: "DELETE",
            entity: "CashRegister",
            entityId: id,
            oldData: JSON.parse(JSON.stringify(register)),
            newData: JSON.parse(JSON.stringify(updated)),
          },
        });
      });

      return {
        success: true,
        message: "Cash register has been successfully removed.",
      };
    },
    { params: t.Object({ id: t.String() }) },
  );
