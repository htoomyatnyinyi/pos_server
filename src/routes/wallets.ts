import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";
import { tenantAuthMiddleware } from "../../middlewares/tenantAuthMiddleware";
import { requireRoles } from "../lib/security";

export const walletRoutes = new Elysia({ prefix: "/wallets" })
  .use(tenantAuthMiddleware)

  .get(
    "/",
    async ({ tenantId, query }) => {
      const page = query.page ? parseInt(query.page as string) : 1;
      const limit = query.limit ? parseInt(query.limit as string) : 20;
      const skip = (page - 1) * limit;
      const search = query.search as string;

      const whereCondition: any = {
        tenantId,
        customer: { deletedAt: null },
      };
      if (search) {
        whereCondition.customer = {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { phone: { contains: search, mode: "insensitive" } },
          ],
        };
      }

      const [total, wallets] = await prisma.$transaction([
        prisma.customerWallet.count({ where: whereCondition }),
        prisma.customerWallet.findMany({
          where: whereCondition,
          include: { customer: true },
          orderBy: { createdAt: "desc" },
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
          search: t.Optional(t.String()),
        }),
      ),
    },
  )

  .get(
    "/customer/:customerId",
    async ({ params: { customerId }, tenantId, set }) => {
      const wallet = await prisma.customerWallet.findFirst({
        where: { customerId, tenantId },
        include: {
          customer: true,
          transactions: { take: 20, orderBy: { createdAt: "desc" } },
        },
      });
      if (!wallet) {
        set.status = 404;
        return {
          success: false,
          message: "Wallet not found for this customer.",
        };
      }
      return { success: true, wallet };
    },
    { params: t.Object({ customerId: t.String() }) },
  )

  .post(
    "/transactions",
    async ({ body, tenantId, userId, role, set }) => {
      requireRoles(role, ["ADMIN", "MANAGER", "SUPER_ADMIN"], set);

      // Validate customer
      const customer = await prisma.customer.findFirst({
        where: { id: body.customerId, tenantId, deletedAt: null },
      });
      if (!customer) {
        set.status = 400;
        return { success: false, message: "Customer not found." };
      }

      const wallet = await prisma.customerWallet.findFirst({
        where: { customerId: body.customerId, tenantId },
      });
      if (!wallet) {
        set.status = 404;
        return {
          success: false,
          message: "Wallet not found for this customer.",
        };
      }

      const transaction = await prisma.$transaction(async (tx: any) => {
        let balanceUpdate: any;
        if (body.type === "DEPOSIT" || body.type === "REFUND") {
          balanceUpdate = { increment: body.amount };
        } else if (body.type === "WITHDRAWAL" || body.type === "PAYMENT") {
          balanceUpdate = { decrement: body.amount };
          if (wallet.balance < body.amount) {
            throw new Error("Insufficient wallet balance.");
          }
        } else {
          throw new Error("Invalid transaction type.");
        }

        const updatedWallet = await tx.customerWallet.update({
          where: { id: wallet.id },
          data: { balance: balanceUpdate },
        });

        const created = await tx.walletTransaction.create({
          data: {
            tenantId,
            walletId: wallet.id,
            amount: body.amount,
            type: body.type,
            referenceId: body.referenceId,
            description: body.description,
          },
        });

        await tx.auditLog.create({
          data: {
            tenantId,
            userId,
            action: "CREATE",
            entity: "WalletTransaction",
            entityId: created.id,
            newData: JSON.parse(JSON.stringify(created)),
          },
        });

        return { transaction: created, newBalance: updatedWallet.balance };
      });

      set.status = 201;
      return {
        success: true,
        message: "Wallet transaction completed.",
        transaction: transaction.transaction,
        newBalance: transaction.newBalance,
      };
    },
    {
      body: t.Object({
        customerId: t.String({ minLength: 1 }),
        amount: t.Number({ minimum: 0.01 }),
        type: t.String(),
        referenceId: t.Optional(t.String()),
        description: t.Optional(t.String()),
      }),
    },
  );
