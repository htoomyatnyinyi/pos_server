import type { MovementType, Prisma } from "@prisma/client";

type TxClient = Prisma.TransactionClient;

/**
 * ၁။ စတိုးတစ်ခုအတွင်းရှိ ကုန်ပစ္စည်း (သို့မဟုတ် Variant) ရဲ့ လက်ရှိစတော့ကို ရှာဖွေရန်
 */
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
      // 📝 Schema အရ variantId သည် Nullable ဖြစ်သောကြောင့် explicit null ပေးရန်လိုအပ်ပါသည်
      variantId: variantId ?? null,
    },
  });
}

/**
 * ၂။ စတော့လက်ကျန်ကို တိုး/လျော့ (Adjust) လုပ်ပြီး သမိုင်းမှတ်တမ်း (StockMovement) သိမ်းဆည်းရန်
 */
export async function adjustInventory(
  tx: TxClient,
  opts: {
    tenantId: string;
    storeId: string;
    productId: string;
    variantId?: string | null;
    quantityDelta: number; // တိုးချင်ရင် အပေါင်းကိန်း (ဥပမာ: 10)၊ လျော့ချင်ရင် အနှုတ်ကိန်း (ဥပမာ: -5)
    userId: string;
    type: MovementType; // Schema Enum: SALE, PURCHASE, RETURN_IN, OPENING_STOCK, စသည်
    referenceId: string; // Order ID သို့မဟုတ် Product ID သို့မဟုတ် PO ID
    referenceType: string; // "Order", "Product", "PurchaseOrder"
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

  // လက်ရှိ စတော့ဒေတာ ရှိမရှိ စစ်ဆေးခြင်း
  const existing = await findStoreInventory(tx, storeId, productId, variantId);
  const previousStock = existing?.quantity ?? 0;
  const newStock = previousStock + quantityDelta;

  // 🚨 လုပ်ငန်းလည်ပတ်မှု ဘေးကင်းစေရန် စတော့အနှုတ်ပြသွားခြင်းကို ကာကွယ်ရန် (Optional Production Check)
  // မှတ်ချက် - ကုန်ပစ္စည်းကို အနှုတ်ပြခွင့်ပေးထားလိုပါက ဤအဆင့်ကို ပယ်ဖျက်နိုင်ပါသည်
  if (newStock < 0) {
    throw new Error(
      `Insufficient stock for Product ID: ${productId}. Available: ${previousStock}, Requested Delta: ${quantityDelta}`,
    );
  }

  let inventory;

  if (existing) {
    // လက်ရှိစတော့ဒေတာ ရှိပြီးသားဖြစ်က Update လုပ်မည်
    inventory = await tx.inventory.update({
      where: { id: existing.id },
      data: {
        quantity: newStock,
        // 🔐 Concurrency ကို ကာကွယ်ရန် သင့် Schema ပါ version field ကို ၁ တိုးပေးမည်
        version: { increment: 1 },
      },
    });
  } else {
    // စတော့ဒေတာ မရှိသေးပါက အသစ်ဖန်တီးမည် (ဥပမာ - Opening Stock ထည့်သွင်းခြင်း)
    inventory = await tx.inventory.create({
      data: {
        tenantId,
        storeId,
        productId,
        variantId: variantId ?? null,
        quantity: newStock,
        version: 0,
      },
    });
  }

  // 📝 Schema ရဲ့ 'model StockMovement' အတိုင်း သမိုင်းမှတ်တမ်း အတိအကျ ရေးသွင်းခြင်း
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
      type, // Schema ပါ MovementType Enum အတိုင်း ဖြစ်ရမည်
      referenceId,
      referenceType,
      reason,
    },
  });

  return { inventory, movement };
}

// import type { MovementType, Prisma } from "@prisma/client";

// type TxClient = Prisma.TransactionClient;

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
//       variantId: variantId ?? null,
//     },
//   });
// }

// export async function adjustInventory(
//   tx: TxClient,
//   opts: {
//     tenantId: string;
//     storeId: string;
//     productId: string;
//     variantId?: string | null;
//     quantityDelta: number;
//     userId: string;
//     type: MovementType;
//     referenceId: string;
//     referenceType: string;
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

//   const existing = await findStoreInventory(tx, storeId, productId, variantId);
//   const previousStock = existing?.quantity ?? 0;
//   const newStock = previousStock + quantityDelta;

//   const inventory = existing
//     ? await tx.inventory.update({
//         where: { id: existing.id },
//         data: { quantity: newStock },
//       })
//     : await tx.inventory.create({
//         data: {
//           tenantId,
//           storeId,
//           productId,
//           variantId: variantId ?? undefined,
//           quantity: newStock,
//         },
//       });

//   const movement = await tx.stockMovement.create({
//     data: {
//       tenantId,
//       productId,
//       variantId: variantId ?? undefined,
//       storeId,
//       userId,
//       quantity: quantityDelta,
//       previousStock,
//       newStock,
//       type,
//       referenceId,
//       referenceType,
//       reason,
//     },
//   });

//   return { inventory, movement };
// }
