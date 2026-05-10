import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";

export const customerRoutes = new Elysia({
  prefix: "/customers",
})
  .get("/", async () => {
    return prisma.customer.findMany({
      orderBy: {
        createdAt: "desc",
      },
    });
  })
  .get("/:id", async ({ params, set }) => {
    const customer = await prisma.customer.findUnique({
      where: { id: params.id },
      include: {
        orders: true,
      },
    });
    if (!customer) { set.status = 404; return "Customer not found"; }return customer;
  })
  .post(
    "/",
    async ({ body, set }) => {
      set.status = 201;
      return prisma.customer.create({
        data: body,
      });
    },
    {
      body: t.Object({
        code: t.String(),
        name: t.String(),
        phone: t.Optional(t.String()),
        email: t.Optional(t.String()),
        address: t.Optional(t.String()),
        dateOfBirth: t.Optional(t.String()),
        gender: t.Optional(t.String()),
        tier: t.Optional(t.String()),
      }),
    },
  )
  .put(
    "/:id",
    async ({ params, body }) => {
      return prisma.customer.update({
        where: { id: params.id },
        data: body,
      });
    },
    {
      body: t.Partial(
        t.Object({
          code: t.String(),
          name: t.String(),
          phone: t.String(),
          email: t.String(),
          address: t.String(),
          dateOfBirth: t.String(),
          gender: t.String(),
          loyaltyPoints: t.Integer(),
          totalSpent: t.Number(),
          tier: t.String(),
          isActive: t.Boolean(),
        }),
      ),
    },
  )
  .delete("/:id", async ({ params }) => {
    return prisma.customer.delete({
      where: { id: params.id },
    });
  });
