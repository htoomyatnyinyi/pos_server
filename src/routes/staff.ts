import { Elysia, t } from "elysia";
import { Permission, Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";
import { requireTenantId } from "../lib/tenant";
import { permissionSchema, roleSchema } from "../lib/schemas";

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

function mapStaff(user: {
  id: string;
  username: string;
  email: string | null;
  name: string;
  role: string;
  tenantId: string;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  userPermissions: { permission: Permission }[];
}) {
  return {
    ...user,
    permissions: user.userPermissions.map((p) => p.permission),
    userPermissions: undefined,
  };
}

export const staffRoutes = new Elysia({
  prefix: "/staff",
})
  .get("/", async ({ query, set }) => {
    const tenantId = requireTenantId({ query, set });
    if (!tenantId) return { message: "tenantId is required" };

    const where: Prisma.UserWhereInput = {
      tenantId,
      deletedAt: null,
    };

    if (query.storeId) {
      where.stores = { some: { storeId: query.storeId } };
    }

    const users = await prisma.user.findMany({
      where,
      select: staffSelect,
    });

    return users.map(mapStaff);
  })
  .get("/:id", async ({ params, set }) => {
    const user = await prisma.user.findUnique({
      where: { id: params.id },
      select: {
        ...staffSelect,
        stores: { include: { store: true } },
      },
    });
    if (!user) {
      set.status = 404;
      return { message: "Staff member not found" };
    }
    return { ...mapStaff(user), stores: user.stores };
  })
  .post(
    "/",
    async ({ body, set }) => {
      const hashedPassword = await bcrypt.hash(body.password, 10);
      const emailLower = body.email.toLowerCase().trim();

      const user = await prisma.user.create({
        data: {
          tenantId: body.tenantId,
          username: body.username?.toLowerCase().trim() || emailLower,
          email: emailLower,
          name: body.name,
          passwordHash: hashedPassword,
          role: body.role,
          isActive: body.isActive ?? true,
          userPermissions: body.permissions
            ? { create: body.permissions.map((permission) => ({ permission })) }
            : undefined,
          stores: body.storeId
            ? { create: { storeId: body.storeId, isPrimary: true } }
            : undefined,
        },
        select: staffSelect,
      });

      set.status = 201;
      return mapStaff(user);
    },
    {
      body: t.Object({
        tenantId: t.String(),
        username: t.String(),
        email: t.String(),
        name: t.String(),
        password: t.String(),
        storeId: t.Optional(t.String()),
        role: roleSchema,
        permissions: t.Array(permissionSchema),
        isActive: t.Optional(t.Boolean()),
      }),
    },
  )
  .put(
    "/:id",
    async ({ params, body }) => {
      const { password, permissions, ...updateData } = body;
      const data: Prisma.UserUpdateInput = { ...updateData };

      if (password) {
        data.passwordHash = await bcrypt.hash(password, 10);
      }

      if (permissions) {
        data.userPermissions = {
          deleteMany: {},
          create: permissions.map((permission) => ({ permission })),
        };
      }

      const user = await prisma.user.update({
        where: { id: params.id },
        data,
        select: staffSelect,
      });

      return mapStaff(user);
    },
    {
      body: t.Partial(
        t.Object({
          username: t.Optional(t.String()),
          email: t.Optional(t.String()),
          name: t.Optional(t.String()),
          password: t.Optional(t.String()),
          role: t.Optional(roleSchema),
          permissions: t.Optional(t.Array(permissionSchema)),
          isActive: t.Optional(t.Boolean()),
        }),
      ),
    },
  )
  .delete("/:id", async ({ params }) => {
    return prisma.user.update({
      where: { id: params.id },
      data: { deletedAt: new Date(), isActive: false },
    });
  });
