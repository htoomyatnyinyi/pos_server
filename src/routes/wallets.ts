import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";
import { tenantAuthMiddleware } from "../../middlewares/tenantAuthMiddleware";
import { WalletTransactionType } from "@prisma/client";

export const walletRoutes = new Elysia({
  prefix: "/wallets",
})
  // 🔐 Multi-Tenant Authentication Middleware ချိတ်ဆက်ခြင်း
  .use(tenantAuthMiddleware)

  /**
   * 1. GET ALL WALLETS WITH TENANT ISOLATION & PAGINATION
   */
  .get(
    "/",
    async ({ tenantId, query }) => {
      const page = query.page ? parseInt(query.page as string) : 1;
      const limit = query.limit ? parseInt(query.limit as string) : 20;
      const skip = (page - 1) * limit;

      const whereCondition: any = {
        tenantId,
        ...(query.search
          ? {
              customer: {
                OR: [
                  {
                    name: {
                      contains: query.search as string,
                      mode: "insensitive",
                    },
                  },
                  {
                    phone: {
                      contains: query.search as string,
                      mode: "insensitive",
                    },
                  },
                ],
              },
            }
          : {}),
      };

      const [total, wallets] = await prisma.$transaction([
        prisma.customerWallet.count({ where: whereCondition }),
        prisma.customerWallet.findMany({
          where: whereCondition,
          include: {
            customer: {
              select: { id: true, name: true, code: true, phone: true },
            },
          },
          orderBy: { balance: "desc" }, // အိတ်ထဲတွင် ငွေအများဆုံးရှိသူများကို အပေါ်မှပြမည်
          skip,
          take: limit,
        }),
      ]);

      return {
        success: true,
        meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
        wallets,
      };
    },
    {
      query: t.Optional(
        t.Object({
          page: t.Optional(t.String()),
          limit: t.Optional(t.String()),
          search: t.Optional(t.String()), // Customer Name သို့မဟုတ် Phone ဖြင့် ရှာရန်
        }),
      ),
    },
  )

  /**
   * 2. GET OR SECURELY LAZY-CREATE CUSTOMER WALLET
   */
  .get(
    "/customer/:customerId",
    async ({ params: { customerId }, tenantId, set }) => {
      // 🚨 လုံခြုံရေးအရ ဝယ်ယူသူသည် လက်ရှိ Tenant အောက်တွင် တကယ်ရှိမရှိ အရင်စစ်ဆေးခြင်း
      const customerExists = await prisma.customer.findFirst({
        where: { id: customerId, tenantId },
      });

      if (!customerExists) {
        set.status = 404;
        return {
          success: false,
          message: "Customer profile not found in this organization.",
        };
      }

      let wallet = await prisma.customerWallet.findFirst({
        where: { tenantId, customerId },
        include: {
          transactions: { orderBy: { createdAt: "desc" }, take: 20 }, // နောက်ဆုံး Transaction ၂၀ သာတွဲပြမည်
        },
      });

      // ဝယ်ယူသူတွင် Wallet Account မရှိသေးပါက အသစ်တစ်ခု အလိုအလျောက် ဖန်တီးပေးခြင်း
      if (!wallet) {
        wallet = await prisma.customerWallet.create({
          data: {
            tenantId,
            customerId,
            balance: 0,
          },
          include: {
            transactions: true,
          },
        });
      }

      return { success: true, wallet };
    },
    { params: t.Object({ customerId: t.String() }) },
  )

  /**
   * 3. POST: PROCESS LEDGER TRANSACTION (DEPOSIT, WITHDRAW, REFUND) WITH OVERDRAFT GUARD
   */
  .post(
    "/transactions",
    async ({ body, tenantId, userId, set }) => {
      try {
        const walletResult = await prisma.$transaction(async (tx) => {
          // ၁။ သက်ဆိုင်ရာ Tenant အတွင်း ဝယ်ယူသူ၏ Wallet ရှိမရှိ စစ်ဆေးခြင်း (သို့မဟုတ်) အလိုအလျောက် ဆောက်ပေးခြင်း
          let customerWallet = await tx.customerWallet.findFirst({
            where: { tenantId, customerId: body.customerId },
          });

          if (!customerWallet) {
            customerWallet = await tx.customerWallet.create({
              data: { tenantId, customerId: body.customerId, balance: 0 },
            });
          }

          // ၂။ ငွေသွင်း/ငွေထုတ် ပမာဏ တွက်ချက်ခြင်း
          const isIncrement = body.type === "DEPOSIT" || body.type === "REFUND";
          const delta = isIncrement ? body.amount : -body.amount;

          // 🚨 [Financial Guard] ငွေထုတ်ယူသည့်အခါ Wallet လက်ကျန်ငွေထက် ကျော်လွန်နေပါက အပြီးတိုင် ငြင်းပယ်ခြင်း
          // ✅ တရားဝင် ပြင်ဆင်ပြီးသား Type-safe ကုဒ်
          if (!isIncrement && customerWallet.balance.lessThan(body.amount)) {
            throw new Error(
              `Transaction Denied: Insufficient funds. Available balance is only ${customerWallet.balance}.`,
            );
          }

          // ၃။ Wallet လက်ကျန်ငွေအား Update ပြုလုပ်ခြင်း
          const updatedWallet = await tx.customerWallet.update({
            where: { id: customerWallet.id },
            data: { balance: { increment: delta } },
          });

          // ၄။ ဘဏ္ဍာရေး Ledger စာရင်းထဲသို့ Transaction မှတ်တမ်းအသစ် သွင်းခြင်း
          const transactionRecord = await tx.walletTransaction.create({
            data: {
              tenantId,
              walletId: updatedWallet.id,
              amount: body.amount,
              type: body.type as WalletTransactionType,
              referenceId: body.referenceId ?? null,
              description: body.description
                ? body.description.trim()
                : `${body.type} processed via API`,
            },
          });

          // ၅။ System Audit Log ထဲသို့ Security Track သွင်းခြင်း
          await tx.auditLog.create({
            data: {
              tenantId,
              userId,
              action: "UPDATE",
              entity: "CustomerWallet",
              entityId: updatedWallet.id,
              oldData: { balance: customerWallet.balance },
              newData: {
                balance: updatedWallet.balance,
                transactionId: transactionRecord.id,
              },
            },
          });

          return updatedWallet;
        });

        set.status = 201;
        return {
          success: true,
          message: `Wallet ledger transaction (${body.type}) executed successfully.`,
          wallet: walletResult,
        };
      } catch (error: any) {
        set.status = 400;
        return {
          success: false,
          message:
            error.message || "An error occurred during ledger synchronization.",
        };
      }
    },
    {
      body: t.Object({
        customerId: t.String({ minLength: 1 }),
        amount: t.Number({ minimum: 0.01 }), // 🚨 သုည သို့မဟုတ် အနှုတ်ကိန်းများ ငွေသွင်း/ထုတ်ခွင့်မပြုပါ
        type: t.String(), // Schema WalletTransactionType Enum Mapping (DEPOSIT, WITHDRAW, REFUND)
        referenceId: t.Optional(t.String()), // ဥပမာ - Order Voucher ID သို့မဟုတ် Invoice ID
        description: t.Optional(t.String()),
      }),
    },
  );
// import { Elysia, t } from "elysia";
// import { prisma } from "../lib/prisma";
// import { requireTenantId } from "../lib/tenant";
// import { walletTransactionTypeSchema } from "../lib/schemas";

// export const walletRoutes = new Elysia({
//   prefix: "/wallets",
// })
//   .get("/", async ({ query, set }) => {
//     const tenantId = requireTenantId({ query, set });
//     if (!tenantId) return { message: "tenantId is required" };

//     return prisma.customerWallet.findMany({
//       where: { tenantId },
//       include: {
//         customer: { select: { id: true, name: true, code: true, phone: true } },
//       },
//       orderBy: { updatedAt: "desc" },
//     });
//   })
//   .get("/customer/:customerId", async ({ params, query, set }) => {
//     const tenantId = requireTenantId({ query, set });
//     if (!tenantId) return { message: "tenantId is required" };

//     let wallet = await prisma.customerWallet.findFirst({
//       where: { tenantId, customerId: params.customerId },
//       include: {
//         transactions: { orderBy: { createdAt: "desc" }, take: 50 },
//         customer: true,
//       },
//     });

//     if (!wallet) {
//       wallet = await prisma.customerWallet.create({
//         data: { tenantId, customerId: params.customerId },
//         include: {
//           transactions: true,
//           customer: true,
//         },
//       });
//     }

//     return wallet;
//   })
//   .post(
//     "/transactions",
//     async ({ body, set }) => {
//       const wallet = await prisma.$transaction(async (tx) => {
//         let customerWallet = await tx.customerWallet.findUnique({
//           where: { customerId: body.customerId },
//         });

//         if (!customerWallet) {
//           customerWallet = await tx.customerWallet.create({
//             data: { tenantId: body.tenantId, customerId: body.customerId },
//           });
//         }

//         const delta =
//           body.type === "DEPOSIT" || body.type === "REFUND"
//             ? body.amount
//             : -body.amount;

//         const updated = await tx.customerWallet.update({
//           where: { id: customerWallet.id },
//           data: { balance: { increment: delta } },
//         });

//         await tx.walletTransaction.create({
//           data: {
//             tenantId: body.tenantId,
//             walletId: updated.id,
//             amount: body.amount,
//             type: body.type,
//             referenceId: body.referenceId,
//             description: body.description,
//           },
//         });

//         return updated;
//       });

//       set.status = 201;
//       return wallet;
//     },
//     {
//       body: t.Object({
//         tenantId: t.String(),
//         customerId: t.String(),
//         amount: t.Number(),
//         type: walletTransactionTypeSchema,
//         referenceId: t.Optional(t.String()),
//         description: t.Optional(t.String()),
//       }),
//     },
//   );
