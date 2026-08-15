import { prisma } from "./prisma";
import { MovementType } from "@prisma/client";

interface AdjustInventoryParams {
  tenantId: string;
  storeId: string;
  productId: string;
  variantId: string | null;
  quantityDelta: number; // positive = add stock, negative = remove stock
  userId: string;
  type: MovementType;
  referenceId: string;
  referenceType: string;
  reason?: string | null;
}

/**
 * Return the stock total shown for a product in the loaded inventory scope.
 * Variant products are totals of variant rows; they never use a parent row.
 */
export function getProductTotalStock(product: any): number {
  const inventories = (product.inventories ?? []).filter(
    (inventory: any) => inventory.lotId == null,
  );
  if ((product.variants ?? []).length > 0) {
    return inventories
      .filter((inventory: any) => inventory.variantId != null)
      .reduce((total: number, inventory: any) => total + inventory.quantity, 0);
  }
  return inventories
    .filter((inventory: any) => inventory.variantId == null)
    .reduce((total: number, inventory: any) => total + inventory.quantity, 0);
}

/**
 * Adjust inventory quantity for a product/variant in a specific store.
 * Creates a StockMovement record and updates the Inventory record atomically.
 * Throws an error if the inventory becomes negative.
 */
export async function adjustInventory(
  tx: any, // Prisma transaction client
  params: AdjustInventoryParams,
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
  } = params;

  // Inventory identity is product-level for products without variants and
  // variant-level for products that have them. Do not silently create a
  // product row for a variant product (or attach a variant to another
  // product).
  const product = await tx.product.findFirst({
    where: { id: productId, tenantId, deletedAt: null },
    select: { id: true, variants: { select: { id: true } } },
  });
  if (!product) throw new Error(`Product ${productId} not found.`);
  if (variantId === null && product.variants.length > 0) {
    throw new Error(`Variant is required for product ${productId}.`);
  }
  if (variantId !== null && !product.variants.some((v: any) => v.id === variantId)) {
    throw new Error(`Variant ${variantId} does not belong to product ${productId}.`);
  }

  // 1. Find or create the Inventory record
  let inventory = await tx.inventory.findFirst({
    where: {
      tenantId,
      storeId,
      productId,
      // `undefined` means "do not filter" in Prisma.  Always pass the
      // explicit nullable value so a product row cannot accidentally match
      // a variant row (or vice versa).
      variantId: variantId ?? null,
      lotId: null,
    },
  });

  if (!inventory) {
    // Create a new inventory record with zero quantity
    inventory = await tx.inventory.create({
      data: {
        tenantId,
        storeId,
        productId,
        variantId: variantId ?? null,
        quantity: 0,
        reservedQty: 0,
        reorderPoint: 10,
        reorderQty: 0,
      },
    });
  }

  // 2. Calculate new quantity
  const previousStock = inventory.quantity;
  const newStock = previousStock + quantityDelta;

  if (newStock < 0) {
    throw new Error(
      `Insufficient stock for product ${productId} in store ${storeId}. Current: ${previousStock}, Required: ${Math.abs(quantityDelta)}`,
    );
  }

  // 3. Update inventory
  const updatedInventory = await tx.inventory.update({
    where: { id: inventory.id },
    data: {
      quantity: newStock,
      version: { increment: 1 },
    },
  });

  // 4. Create stock movement record
  const movement = await tx.stockMovement.create({
    data: {
      tenantId,
      productId,
      variantId: variantId ?? null,
      storeId,
      userId,
      quantity: quantityDelta,
      previousStock,
      newStock,
      type,
      referenceId,
      referenceType,
      reason: reason ?? null,
    },
  });

  return {
    inventory: updatedInventory,
    movement,
    previousStock,
    newStock,
  };
}

// import type { MovementType, Prisma } from "@prisma/client";

// type TxClient = Prisma.TransactionClient;

// /**
//  * ၁။ စတိုးတစ်ခုအတွင်းရှိ ကုန်ပစ္စည်း (သို့မဟုတ် Variant) ရဲ့ လက်ရှိစတော့ကို ရှာဖွေရန်
//  */
// export async function findStoreInventory(
//   tx: TxClient,
//   storeId: string,
//   productId: string,
//   variantId?: string | null,
// ) {
//   return tx.inventory.findFirst({
//     where: {
//       storeId,
//       productId,
//       // 📝 Schema အရ variantId သည် Nullable ဖြစ်သောကြောင့် explicit null ပေးရန်လိုအပ်ပါသည်
//       variantId: variantId ?? null,
//     },
//   });
// }

// /**
//  * ၂။ စတော့လက်ကျန်ကို တိုး/လျော့ (Adjust) လုပ်ပြီး သမိုင်းမှတ်တမ်း (StockMovement) သိမ်းဆည်းရန်
//  */
// export async function adjustInventory(
//   tx: TxClient,
//   opts: {
//     tenantId: string;
//     storeId: string;
//     productId: string;
//     variantId?: string | null;
//     quantityDelta: number; // တိုးချင်ရင် အပေါင်းကိန်း (ဥပမာ: 10)၊ လျော့ချင်ရင် အနှုတ်ကိန်း (ဥပမာ: -5)
//     userId: string;
//     type: MovementType; // Schema Enum: SALE, PURCHASE, RETURN_IN, OPENING_STOCK, စသည်
//     referenceId: string; // Order ID သို့မဟုတ် Product ID သို့မဟုတ် PO ID
//     referenceType: string; // "Order", "Product", "PurchaseOrder"
//     reason?: string;
//   },
// ) {
//   const {
//     tenantId,
//     storeId,
//     productId,
//     variantId,
//     quantityDelta,
//     userId,
//     type,
//     referenceId,
//     referenceType,
//     reason,
//   } = opts;

//   // လက်ရှိ စတော့ဒေတာ ရှိမရှိ စစ်ဆေးခြင်း
//   const existing = await findStoreInventory(tx, storeId, productId, variantId);
//   const previousStock = existing?.quantity ?? 0;
//   const newStock = previousStock + quantityDelta;

//   // 🚨 လုပ်ငန်းလည်ပတ်မှု ဘေးကင်းစေရန် စတော့အနှုတ်ပြသွားခြင်းကို ကာကွယ်ရန် (Optional Production Check)
//   // မှတ်ချက် - ကုန်ပစ္စည်းကို အနှုတ်ပြခွင့်ပေးထားလိုပါက ဤအဆင့်ကို ပယ်ဖျက်နိုင်ပါသည်
//   if (newStock < 0) {
//     throw new Error(
//       `Insufficient stock for Product ID: ${productId}. Available: ${previousStock}, Requested Delta: ${quantityDelta}`,
//     );
//   }

//   let inventory;

//   if (existing) {
//     // လက်ရှိစတော့ဒေတာ ရှိပြီးသားဖြစ်က Update လုပ်မည်
//     inventory = await tx.inventory.update({
//       where: { id: existing.id },
//       data: {
//         quantity: newStock,
//         // 🔐 Concurrency ကို ကာကွယ်ရန် သင့် Schema ပါ version field ကို ၁ တိုးပေးမည်
//         version: { increment: 1 },
//       },
//     });
//   } else {
//     // စတော့ဒေတာ မရှိသေးပါက အသစ်ဖန်တီးမည် (ဥပမာ - Opening Stock ထည့်သွင်းခြင်း)
//     inventory = await tx.inventory.create({
//       data: {
//         tenantId,
//         storeId,
//         productId,
//         variantId: variantId ?? null,
//         quantity: newStock,
//         version: 0,
//       },
//     });
//   }

//   // 📝 Schema ရဲ့ 'model StockMovement' အတိုင်း သမိုင်းမှတ်တမ်း အတိအကျ ရေးသွင်းခြင်း
//   const movement = await tx.stockMovement.create({
//     data: {
//       tenantId,
//       productId,
//       variantId: variantId ?? null,
//       storeId,
//       userId,
//       quantity: quantityDelta,
//       previousStock,
//       newStock,
//       type, // Schema ပါ MovementType Enum အတိုင်း ဖြစ်ရမည်
//       referenceId,
//       referenceType,
//       reason,
//     },
//   });

//   return { inventory, movement };
// }
