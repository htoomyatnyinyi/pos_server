import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";
import { requireTenantId } from "../lib/tenant";

export const supplierRoutes = new Elysia({
  prefix: "/suppliers",
})
  .get("/", async ({ query, set }) => {
    const tenantId = requireTenantId({ query, set });
    if (!tenantId) return { message: "tenantId is required" };

    return prisma.supplier.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: { createdAt: "desc" },
    });
  })
  .get("/:id", async ({ params, set }) => {
    const supplier = await prisma.supplier.findUnique({
      where: { id: params.id },
      include: { products: true, payments: true },
    });
    if (!supplier) {
      set.status = 404;
      return { message: "Supplier not found" };
    }
    return supplier;
  })
  .post(
    "/",
    async ({ body, set }) => {
      set.status = 201;
      return prisma.supplier.create({
        data: {
          tenantId: body.tenantId,
          code: body.code || `SUP-${Date.now()}`,
          name: body.name,
          contactName: body.contactName,
          phone: body.phone,
          email: body.email,
          address: body.address,
          taxId: body.taxId,
          paymentTerms: body.paymentTerms,
          creditLimit: body.creditLimit,
        },
      });
    },
    {
      body: t.Object({
        tenantId: t.String(),
        code: t.Optional(t.String()),
        name: t.String(),
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
    async ({ params, body }) => {
      return prisma.supplier.update({
        where: { id: params.id },
        data: body,
      });
    },
    {
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
  .delete("/:id", async ({ params }) => {
    return prisma.supplier.update({
      where: { id: params.id },
      data: { deletedAt: new Date(), isActive: false },
    });
  });
