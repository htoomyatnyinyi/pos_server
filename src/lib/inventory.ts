import type { MovementType, Prisma } from "@prisma/client";

type TxClient = Prisma.TransactionClient;

export async function findStoreInventory(
  tx: TxClient,
  storeId: string,
  productId: string,
  variantId?: string | null,
) {
  return tx.inventory.findFirst({
    where: {
      storeId,
      productId,
      variantId: variantId ?? null,
    },
  });
}

export async function adjustInventory(
  tx: TxClient,
  opts: {
    tenantId: string;
    storeId: string;
    productId: string;
    variantId?: string | null;
    quantityDelta: number;
    userId: string;
    type: MovementType;
    referenceId: string;
    referenceType: string;
    reason?: string;
  },
) {
  const {
    tenantId,
    storeId,
    productId,
    variantId,
    quantityDelta,
    userId,
    type,
    referenceId,
    referenceType,
    reason,
  } = opts;

  const existing = await findStoreInventory(tx, storeId, productId, variantId);
  const previousStock = existing?.quantity ?? 0;
  const newStock = previousStock + quantityDelta;

  const inventory = existing
    ? await tx.inventory.update({
        where: { id: existing.id },
        data: { quantity: newStock },
      })
    : await tx.inventory.create({
        data: {
          tenantId,
          storeId,
          productId,
          variantId: variantId ?? undefined,
          quantity: newStock,
        },
      });

  const movement = await tx.stockMovement.create({
    data: {
      tenantId,
      productId,
      variantId: variantId ?? undefined,
      storeId,
      userId,
      quantity: quantityDelta,
      previousStock,
      newStock,
      type,
      referenceId,
      referenceType,
      reason,
    },
  });

  return { inventory, movement };
}
