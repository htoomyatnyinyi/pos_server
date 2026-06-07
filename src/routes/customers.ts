import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";
import { requireTenantId } from "../lib/tenant";
import { customerTierSchema } from "../lib/schemas";

export const customerRoutes = new Elysia({
  prefix: "/customers",
})
  .get("/", async ({ query, set }) => {
    const tenantId = requireTenantId({ query, set });
    if (!tenantId) return { message: "tenantId is required" };

    return prisma.customer.findMany({
      where: { tenantId, deletedAt: null },
      include: { wallet: true },
      orderBy: { createdAt: "desc" },
    });
  })
  .get("/:id", async ({ params, set }) => {
    const customer = await prisma.customer.findUnique({
      where: { id: params.id },
      include: {
        orders: true,
        wallet: { include: { transactions: { take: 20, orderBy: { createdAt: "desc" } } } },
        loyaltyTransactions: { take: 20, orderBy: { createdAt: "desc" } },
      },
    });
    if (!customer) {
      set.status = 404;
      return { message: "Customer not found" };
    }
    return customer;
  })
  .post(
    "/",
    async ({ body, set }) => {
      set.status = 201;
      return prisma.customer.create({
        data: {
          tenantId: body.tenantId,
          code: body.code || `CUST-${Date.now()}`,
          name: body.name,
          phone: body.phone,
          email: body.email,
          address: body.address,
          dateOfBirth: body.dateOfBirth ? new Date(body.dateOfBirth) : undefined,
          gender: body.gender,
          debtAmount: body.debtAmount,
          tier: body.tier,
        },
      });
    },
    {
      body: t.Object({
        tenantId: t.String(),
        code: t.Optional(t.String()),
        name: t.String(),
        phone: t.Optional(t.String()),
        email: t.Optional(t.String()),
        address: t.Optional(t.String()),
        dateOfBirth: t.Optional(t.String()),
        debtAmount: t.Optional(t.Number()),
        gender: t.Optional(t.String()),
        tier: t.Optional(customerTierSchema),
      }),
    },
  )
  .put(
    "/:id",
    async ({ params, body }) => {
      return prisma.customer.update({
        where: { id: params.id },
        data: {
          ...body,
          dateOfBirth: body.dateOfBirth ? new Date(body.dateOfBirth) : undefined,
        },
      });
    },
    {
      body: t.Partial(
        t.Object({
          code: t.Optional(t.String()),
          name: t.Optional(t.String()),
          phone: t.Optional(t.String()),
          email: t.Optional(t.String()),
          address: t.Optional(t.String()),
          dateOfBirth: t.Optional(t.String()),
          debtAmount: t.Optional(t.Number()),
          gender: t.Optional(t.String()),
          loyaltyPoints: t.Optional(t.Integer()),
          totalSpent: t.Optional(t.Number()),
          tier: t.Optional(customerTierSchema),
          isActive: t.Optional(t.Boolean()),
        }),
      ),
    },
  )
  .delete("/:id", async ({ params }) => {
    return prisma.customer.update({
      where: { id: params.id },
      data: { deletedAt: new Date(), isActive: false },
    });
  });
