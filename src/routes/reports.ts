import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";
import { platformAuthMiddleware } from "../../middlewares/platformAuthMiddleware";
import { requireRoles } from "../lib/security";

export const reportRoutes = new Elysia({ prefix: "/reports" })
  .use(platformAuthMiddleware)

  // -------------------------------------------------------------------
  // TRIAL BALANCE
  // -------------------------------------------------------------------
  .get(
    "/trial-balance",
    async ({ query, role, set }) => {
      if (role !== "SUPER_ADMIN") {
        set.status = 403;
        return { success: false, message: "Forbidden" };
      }

      const { tenantId, asOfDate } = query;
      if (!tenantId) {
        set.status = 400;
        return { success: false, message: "tenantId is required." };
      }

      const date = asOfDate ? new Date(asOfDate as string) : new Date();

      // Get all journal entries posted up to the date
      const entries = await prisma.journalEntry.findMany({
        where: {
          tenantId: tenantId as string,
          status: "POSTED",
          date: { lte: date },
        },
        include: {
          lines: {
            include: { account: true },
          },
        },
      });

      // Build account balance map
      const balances = new Map<
        string,
        { account: any; debit: number; credit: number }
      >();

      for (const entry of entries) {
        for (const line of entry.lines) {
          const accountId = line.accountId;
          const current = balances.get(accountId) || {
            account: line.account,
            debit: 0,
            credit: 0,
          };
          if (line.side === "DEBIT") {
            current.debit += Number(line.amount);
          } else {
            current.credit += Number(line.amount);
          }
          balances.set(accountId, current);
        }
      }

      // Convert to array
      const result = Array.from(balances.values()).map((b) => ({
        accountCode: b.account.code,
        accountName: b.account.name,
        accountType: b.account.type,
        debit: b.debit,
        credit: b.credit,
        balance: b.debit - b.credit,
      }));

      // Calculate totals
      const totalDebit = result.reduce((sum, r) => sum + r.debit, 0);
      const totalCredit = result.reduce((sum, r) => sum + r.credit, 0);

      return {
        success: true,
        asOfDate: date,
        trialBalance: result,
        totals: { debit: totalDebit, credit: totalCredit },
        balanced: totalDebit === totalCredit,
      };
    },
    {
      query: t.Object({
        tenantId: t.String(),
        asOfDate: t.Optional(t.String()),
      }),
    },
  );
