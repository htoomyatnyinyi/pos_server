import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";
import { requireRoles, validateStore } from "../lib/security";

const variantBody = t.Object({
  productId: t.String(),
  name: t.String(),
  sku: t.String(),
  barcode: t.Optional(t.String()),
  price: t.Number(),
  costPrice: t.Number(),
  color: t.Optional(t.String()),
  size: t.Optional(t.String()),
  weight: t.Optional(t.Number()),
  isActive: t.Optional(t.Boolean()),
  storeId: t.Optional(t.String()),
  initialStock: t.Optional(t.Integer({ minimum: 0 })),
});

export const productVariantRoutes = new Elysia({ prefix: "/product-variants" })
  .get(
    "/",
    async ({ tenantId, query }) => {
      const variants = await prisma.productVariant.findMany({
        where: {
          tenantId,
          ...(query.productId ? { productId: query.productId } : {}),
        },
        include: { product: true, inventories: true },
        orderBy: { createdAt: "desc" },
      });
      return { success: true, variants };
    },
    { query: t.Optional(t.Object({ productId: t.Optional(t.String()) })) },
  )
  .post(
    "/",
    async ({ body, tenantId, userId, role, set }) => {
      requireRoles(role, ["ADMIN", "MANAGER", "SUPER_ADMIN"], set);
      const product = await prisma.product.findFirst({
        where: { id: body.productId, tenantId, deletedAt: null },
      });
      if (!product) {
        set.status = 404;
        return { success: false, message: "Product not found." };
      }
      if (body.storeId) await validateStore(body.storeId, tenantId);

      const identifiers = [
        { sku: body.sku.trim() },
        ...(body.barcode?.trim() ? [{ barcode: body.barcode.trim() }] : []),
      ];
      const [duplicateProduct, duplicateVariant] = await Promise.all([
        prisma.product.findFirst({ where: { tenantId, deletedAt: null, OR: identifiers } }),
        prisma.productVariant.findFirst({
          where: {
            tenantId,
            OR: [
              ...identifiers,
              { productId: product.id, name: body.name.trim() },
            ],
          },
        }),
      ]);
      if (duplicateProduct || duplicateVariant) {
        set.status = 400;
        return { success: false, message: "Option name, SKU, or barcode is already in use." };
      }

      const variant = await prisma.$transaction(async (tx: any) => {
        const created = await tx.productVariant.create({
          data: {
            tenantId,
            productId: product.id,
            name: body.name.trim(),
            sku: body.sku.trim(),
            barcode: body.barcode?.trim(),
            price: body.price,
            costPrice: body.costPrice,
            color: body.color,
            size: body.size,
            weight: body.weight,
            isActive: body.isActive ?? true,
          },
        });
        if (body.storeId) {
          const quantity = body.initialStock ?? 0;
          await tx.inventory.create({
            data: { tenantId, storeId: body.storeId, productId: product.id, variantId: created.id, quantity },
          });
          if (quantity > 0) {
            await tx.stockMovement.create({
              data: { tenantId, storeId: body.storeId, productId: product.id, variantId: created.id, userId, quantity, previousStock: 0, newStock: quantity, type: "OPENING_STOCK", referenceId: created.id, referenceType: "ProductVariant" },
            });
          }
        }
        return created;
      });
      set.status = 201;
      return { success: true, variant };
    },
    { body: variantBody },
  )
  .put(
    "/:id",
    async ({ params: { id }, body, tenantId, role, set }) => {
      requireRoles(role, ["ADMIN", "MANAGER", "SUPER_ADMIN"], set);
      const existing = await prisma.productVariant.findFirst({ where: { id, tenantId } });
      if (!existing) {
        set.status = 404;
        return { success: false, message: "Option not found." };
      }
      if (body.sku || body.barcode || body.name) {
        const identifiers = [
          ...(body.sku?.trim() ? [{ sku: body.sku.trim() }] : []),
          ...(body.barcode?.trim() ? [{ barcode: body.barcode.trim() }] : []),
          ...(body.name?.trim() ? [{ productId: existing.productId, name: body.name.trim() }] : []),
        ];
        const [duplicateProduct, duplicateVariant] = await Promise.all([
          identifiers.length
            ? prisma.product.findFirst({ where: { tenantId, deletedAt: null, OR: identifiers } })
            : null,
          identifiers.length
            ? prisma.productVariant.findFirst({ where: { tenantId, NOT: { id }, OR: identifiers } })
            : null,
        ]);
        if (duplicateProduct || duplicateVariant) {
          set.status = 400;
          return { success: false, message: "Option name, SKU, or barcode is already in use." };
        }
      }
      const variant = await prisma.productVariant.update({
        where: { id },
        data: {
          name: body.name?.trim(), sku: body.sku?.trim(), barcode: body.barcode?.trim(),
          price: body.price, costPrice: body.costPrice, color: body.color, size: body.size,
          weight: body.weight, isActive: body.isActive,
        },
      });
      return { success: true, variant };
    },
    { params: t.Object({ id: t.String() }), body: t.Partial(variantBody) },
  )
  .delete("/:id", async ({ params: { id }, tenantId, role, set }) => {
    requireRoles(role, ["ADMIN", "MANAGER", "SUPER_ADMIN"], set);
    const variant = await prisma.productVariant.findFirst({ where: { id, tenantId } });
    if (!variant) {
      set.status = 404;
      return { success: false, message: "Option not found." };
    }
    await prisma.productVariant.update({ where: { id }, data: { isActive: false } });
    return { success: true };
  });
