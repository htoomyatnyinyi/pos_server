import { Elysia, t } from "elysia";
import { Permission, Prisma, Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";
import { tenantAuthMiddleware } from "../../middlewares/tenantAuthMiddleware";
import { validateStore, validateUser, requireRoles } from "../lib/security";

const staffSelect = {
  id: true,
  username: true,
  email: true,
  name: true,
  role: true,
  tenantId: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
  userPermissions: { select: { permission: true } },
} as const;

function mapStaff(user: any) {
  if (!user) return null;
  return {
    ...user,
    permissions: user.userPermissions
      ? user.userPermissions.map((p: any) => p.permission)
      : [],
    userPermissions: undefined,
  };
}

export const staffRoutes = new Elysia({ prefix: "/staff" })
  .use(tenantAuthMiddleware)

  .get(
    "/",
    async ({ tenantId, query }) => {
      const page = query.page ? parseInt(query.page as string) : 1;
      const limit = query.limit ? parseInt(query.limit as string) : 20;
      const skip = (page - 1) * limit;
      const whereCondition: Prisma.UserWhereInput = {
        tenantId,
        deletedAt: null,
        ...(query.storeId
          ? { stores: { some: { storeId: query.storeId as string } } }
          : {}),
        ...(query.role ? { role: query.role as Role } : {}),
      };
      const [total, users] = await prisma.$transaction([
        prisma.user.count({ where: whereCondition }),
        prisma.user.findMany({
          where: whereCondition,
          select: staffSelect,
          orderBy: { createdAt: "desc" },
          skip,
          take: limit,
        }),
      ]);
      return {
        success: true,
        meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
        staff: users.map(mapStaff),
      };
    },
    {
      query: t.Optional(
        t.Object({
          page: t.Optional(t.String()),
          limit: t.Optional(t.String()),
          storeId: t.Optional(t.String()),
          role: t.Optional(t.String()),
        }),
      ),
    },
  )

  .get(
    "/:id",
    async ({ params: { id }, tenantId, set }) => {
      const user = await prisma.user.findFirst({
        where: { id, tenantId, deletedAt: null },
        select: {
          ...staffSelect,
          stores: { include: { store: true } },
        },
      });
      if (!user) {
        set.status = 404;
        return {
          success: false,
          message: "Staff member not found or access denied.",
        };
      }
      return {
        success: true,
        staff: { ...mapStaff(user), stores: user.stores },
      };
    },
    { params: t.Object({ id: t.String() }) },
  )

  .post(
    "/",
    async ({ body, tenantId, userId: currentOperatorId, role, set }) => {
      requireRoles(role, ["ADMIN", "MANAGER", "SUPER_ADMIN"], set);

      const emailLower = body.email.toLowerCase().trim();
      const usernameLower = body.username.toLowerCase().trim();

      const existingUser = await prisma.user.findFirst({
        where: {
          tenantId,
          OR: [{ username: usernameLower }, { email: emailLower }],
          deletedAt: null,
        },
      });
      if (existingUser) {
        set.status = 400;
        return {
          success: false,
          message: "Username or email already exists in your organization.",
        };
      }

      if (body.storeId) {
        await validateStore(body.storeId, tenantId);
      }

      const hashedPassword = await bcrypt.hash(body.password, 10);

      const staff = await prisma.$transaction(async (tx: any) => {
        const createdUser = await tx.user.create({
          data: {
            tenantId,
            username: usernameLower,
            email: emailLower,
            name: body.name.trim(),
            passwordHash: hashedPassword,
            role: body.role as Role,
            isActive: body.isActive ?? true,
            userPermissions:
              body.permissions && body.permissions.length > 0
                ? {
                    create: body.permissions.map((permission) => ({
                      permission: permission as Permission,
                    })),
                  }
                : undefined,
            stores: body.storeId
              ? { create: { storeId: body.storeId, isPrimary: true } }
              : undefined,
          },
          select: staffSelect,
        });
        await tx.auditLog.create({
          data: {
            tenantId,
            userId: currentOperatorId,
            action: "CREATE",
            entity: "User",
            entityId: createdUser.id,
            newData: JSON.parse(JSON.stringify(mapStaff(createdUser))),
          },
        });
        return createdUser;
      });

      set.status = 201;
      return {
        success: true,
        message: "Staff account provisioned successfully.",
        staff: mapStaff(staff),
      };
    },
    {
      body: t.Object({
        username: t.String({ minLength: 3 }),
        email: t.String({ format: "email" }),
        name: t.String({ minLength: 1 }),
        password: t.String({ minLength: 6 }),
        storeId: t.Optional(t.String()),
        role: t.String(),
        permissions: t.Array(t.String()),
        isActive: t.Optional(t.Boolean()),
      }),
    },
  )

  .put(
    "/:id",
    async ({
      params: { id },
      body,
      tenantId,
      userId: currentOperatorId,
      role,
      set,
    }) => {
      requireRoles(role, ["ADMIN", "MANAGER", "SUPER_ADMIN"], set);

      const currentStaff = await prisma.user.findFirst({
        where: { id, tenantId, deletedAt: null },
        select: staffSelect,
      });
      if (!currentStaff) {
        set.status = 404;
        return {
          success: false,
          message: "Staff member not found or access denied.",
        };
      }

      const { password, permissions, ...updateData } = body;
      const data: Prisma.UserUpdateInput = {
        name: updateData.name?.trim(),
        username: updateData.username?.toLowerCase().trim(),
        email: updateData.email?.toLowerCase().trim(),
        role: updateData.role ? (updateData.role as Role) : undefined,
        isActive: updateData.isActive,
      };

      if (password) {
        data.passwordHash = await bcrypt.hash(password, 10);
      }

      if (permissions) {
        data.userPermissions = {
          deleteMany: {},
          create: permissions.map((permission) => ({
            permission: permission as Permission,
          })),
        };
      }

      const updatedStaff = await prisma.$transaction(async (tx: any) => {
        const updated = await tx.user.update({
          where: { id },
          data,
          select: staffSelect,
        });
        await tx.auditLog.create({
          data: {
            tenantId,
            userId: currentOperatorId,
            action: "UPDATE",
            entity: "User",
            entityId: id,
            oldData: JSON.parse(JSON.stringify(mapStaff(currentStaff))),
            newData: JSON.parse(JSON.stringify(mapStaff(updated))),
          },
        });
        return updated;
      });

      return {
        success: true,
        message: "Staff records updated successfully.",
        staff: mapStaff(updatedStaff),
      };
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Partial(
        t.Object({
          username: t.Optional(t.String()),
          email: t.Optional(t.String()),
          name: t.Optional(t.String()),
          password: t.Optional(t.String()),
          role: t.Optional(t.String()),
          permissions: t.Optional(t.Array(t.String())),
          isActive: t.Optional(t.Boolean()),
        }),
      ),
    },
  )

  .delete(
    "/:id",
    async ({
      params: { id },
      tenantId,
      userId: currentOperatorId,
      role,
      set,
    }) => {
      requireRoles(role, ["ADMIN", "MANAGER", "SUPER_ADMIN"], set);

      if (id === currentOperatorId) {
        set.status = 400;
        return {
          success: false,
          message: "You cannot delete your own account.",
        };
      }

      const staff = await prisma.user.findFirst({
        where: { id, tenantId, deletedAt: null },
        select: staffSelect,
      });
      if (!staff) {
        set.status = 404;
        return {
          success: false,
          message: "Staff member not found or already deactivated.",
        };
      }

      const archivedStaff = await prisma.$transaction(async (tx: any) => {
        const deleted = await tx.user.update({
          where: { id },
          data: {
            deletedAt: new Date(),
            isActive: false,
          },
          select: staffSelect,
        });
        await tx.auditLog.create({
          data: {
            tenantId,
            userId: currentOperatorId,
            action: "DELETE",
            entity: "User",
            entityId: id,
            oldData: JSON.parse(JSON.stringify(mapStaff(staff))),
            newData: JSON.parse(JSON.stringify(mapStaff(deleted))),
          },
        });
        return deleted;
      });

      return {
        success: true,
        message: `Staff member '${archivedStaff.name}' has been successfully terminated and soft-deleted.`,
      };
    },
    { params: t.Object({ id: t.String() }) },
  );
