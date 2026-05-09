import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";
import bcrypt from "bcryptjs";

export const staffRoutes = new Elysia({
  prefix: "/staff",
})
  .get("/", async () => {
    return prisma.user.findMany({
      where: {
        deletedAt: null,
      },
      select: {
        id: true,
        username: true,
        email: true,
        name: true,
        role: true,
        permissions: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
      },
    });
  })
  .get("/:id", async ({ params }) => {
    const user = await prisma.user.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        username: true,
        email: true,
        name: true,
        role: true,
        permissions: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
        stores: {
          include: {
            store: true,
          },
        },
      },
    });
    if (!user) throw new Error("Staff member not found");
    return user;
  })
  .post(
    "/",
    async ({ body }) => {
      const hashedPassword = await bcrypt.hash(body.password, 10);
      return prisma.user.create({
        data: {
          username: body.username,
          email: body.email,
          name: body.name,
          passwordHash: hashedPassword,
          role: body.role,
          permissions: body.permissions,
          isActive: body.isActive ?? true,
        },
      });
    },
    {
      body: t.Object({
        username: t.String(),
        email: t.Optional(t.String()),
        name: t.String(),
        password: t.String(),
        role: t.Enum({
          ADMIN: "ADMIN",
          MANAGER: "MANAGER",
          CASHIER: "CASHIER",
          ACCOUNTANT: "ACCOUNTANT",
        }),
        permissions: t.Array(
          t.Enum({
            VIEW_REPORTS: "VIEW_REPORTS",
            EDIT_PRICES: "EDIT_PRICES",
            VOID_ORDERS: "VOID_ORDERS",
            MANAGE_STAFF: "MANAGE_STAFF",
            MANAGE_INVENTORY: "MANAGE_INVENTORY",
            REFUND_ORDERS: "REFUND_ORDERS",
            VIEW_AUDIT_LOGS: "VIEW_AUDIT_LOGS",
          }),
        ),
        isActive: t.Optional(t.Boolean()),
      }),
    },
  )
  .put(
    "/:id",
    async ({ params, body }) => {
      const data: any = { ...body };
      if (body.password) {
        data.passwordHash = await bcrypt.hash(body.password, 10);
        delete data.password;
      }
      return prisma.user.update({
        where: { id: params.id },
        data,
      });
    },
    {
      body: t.Partial(
        t.Object({
          username: t.String(),
          email: t.String(),
          name: t.String(),
          password: t.String(),
          role: t.String(),
          permissions: t.Array(t.String()),
          isActive: t.Boolean(),
        }),
      ),
    },
  )
  .delete("/:id", async ({ params }) => {
    // Soft delete
    return prisma.user.update({
      where: { id: params.id },
      data: {
        deletedAt: new Date(),
        isActive: false,
      },
    });
  });
