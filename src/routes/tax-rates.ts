import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";
import { requireTenantId } from "../lib/tenant";

export const taxRateRoutes = new Elysia({
  prefix: "/tax-rates",
})
  .get("/", async ({ query, set }) => {
    const tenantId = requireTenantId({ query, set });
    if (!tenantId) return { message: "tenantId is required" };

    return prisma.taxRate.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: { createdAt: "desc" },
    });
  })
  .get("/:id", async ({ params, set }) => {
    const taxRate = await prisma.taxRate.findUnique({
      where: { id: params.id },
    });
    if (!taxRate) {
      set.status = 404;
      return { message: "Tax rate not found" };
    }
    return taxRate;
  })
  .post(
    "/",
    async ({ body, set }) => {
      set.status = 201;
      return prisma.taxRate.create({
        data: {
          tenantId: body.tenantId,
          name: body.name,
          rate: body.rate,
          isCompound: body.isCompound ?? false,
          appliesTo: body.appliesTo ?? ["PRODUCT"],
          validFrom: body.validFrom ? new Date(body.validFrom) : new Date(),
          validTo: body.validTo ? new Date(body.validTo) : undefined,
        },
      });
    },
    {
      body: t.Object({
        tenantId: t.String(),
        name: t.String(),
        rate: t.Number(),
        isCompound: t.Optional(t.Boolean()),
        appliesTo: t.Optional(t.Array(t.String())),
        validFrom: t.Optional(t.String()),
        validTo: t.Optional(t.String()),
      }),
    },
  )
  .put(
    "/:id",
    async ({ params, body }) => {
      return prisma.taxRate.update({
        where: { id: params.id },
        data: {
          ...body,
          validFrom: body.validFrom ? new Date(body.validFrom) : undefined,
          validTo: body.validTo ? new Date(body.validTo) : undefined,
        },
      });
    },
    {
      body: t.Partial(
        t.Object({
          name: t.Optional(t.String()),
          rate: t.Optional(t.Number()),
          isCompound: t.Optional(t.Boolean()),
          appliesTo: t.Optional(t.Array(t.String())),
          validFrom: t.Optional(t.String()),
          validTo: t.Optional(t.String()),
          isActive: t.Optional(t.Boolean()),
        }),
      ),
    },
  )
  .delete("/:id", async ({ params }) => {
    return prisma.taxRate.update({
      where: { id: params.id },
      data: { deletedAt: new Date(), isActive: false },
    });
  });
