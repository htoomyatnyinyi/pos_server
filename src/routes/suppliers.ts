import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";

export const supplierRoutes = new Elysia({
  prefix: "/suppliers",
})
  .get("/", async () => {
    return prisma.supplier.findMany({
      orderBy: {
        createdAt: "desc",
      },
    });
  })
  .get("/:id", async ({ params, set }) => {
    const supplier = await prisma.supplier.findUnique({
      where: { id: params.id },
      include: {
        products: true,
      },
    });
    if (!supplier) { set.status = 404; return "Supplier not found"; }return supplier;
  })
  .post(
    "/",
    async ({ body, set }) => {
      set.status = 201;
      return prisma.supplier.create({
        data: body,
      });
    },
    {
      body: t.Object({
        code: t.String(),
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
          code: t.String(),
          name: t.String(),
          contactName: t.String(),
          phone: t.String(),
          email: t.String(),
          address: t.String(),
          taxId: t.String(),
          paymentTerms: t.Integer(),
          creditLimit: t.Number(),
          isActive: t.Boolean(),
        }),
      ),
    },
  )
  .delete("/:id", async ({ params }) => {
    return prisma.supplier.delete({
      where: { id: params.id },
    });
  });
