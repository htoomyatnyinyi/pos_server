import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";
import { platformAuthMiddleware } from "../../middlewares/platformAuthMiddleware";
import { requireRoles } from "../lib/security";
import { EntryStatus } from "@prisma/client";

export const journalEntryRoutes = new Elysia({ prefix: "/journal-entries" })
  .use(platformAuthMiddleware)

  // -------------------------------------------------------------------
  // 1. GET ALL JOURNAL ENTRIES
  // -------------------------------------------------------------------
  .get(
    "/",
    async ({ query, role, set }) => {
      if (role !== "SUPER_ADMIN") {
        set.status = 403;
        return { success: false, message: "Forbidden" };
      }

      const page = query.page ? parseInt(query.page as string) : 1;
      const limit = query.limit ? parseInt(query.limit as string) : 20;
      const skip = (page - 1) * limit;

      const whereCondition: any = {};
      if (query.tenantId) whereCondition.tenantId = query.tenantId;
      if (query.status) whereCondition.status = query.status;
      if (query.fromDate)
        whereCondition.date = { gte: new Date(query.fromDate as string) };
      if (query.toDate) {
        whereCondition.date = {
          ...whereCondition.date,
          lte: new Date(query.toDate as string),
        };
      }

      const [total, entries] = await prisma.$transaction([
        prisma.journalEntry.count({ where: whereCondition }),
        prisma.journalEntry.findMany({
          where: whereCondition,
          include: {
            lines: { include: { account: true } },
            order: true,
            payment: true,
          },
          orderBy: { date: "desc" },
          skip,
          take: limit,
        }),
      ]);

      return {
        success: true,
        meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
        entries,
      };
    },
    {
      query: t.Optional(
        t.Object({
          page: t.Optional(t.String()),
          limit: t.Optional(t.String()),
          tenantId: t.Optional(t.String()),
          status: t.Optional(t.String()),
          fromDate: t.Optional(t.String()),
          toDate: t.Optional(t.String()),
        }),
      ),
    },
  )

  // -------------------------------------------------------------------
  // 2. GET SINGLE JOURNAL ENTRY
  // -------------------------------------------------------------------
  .get(
    "/:id",
    async ({ params: { id }, role, set }) => {
      if (role !== "SUPER_ADMIN") {
        set.status = 403;
        return { success: false, message: "Forbidden" };
      }
      const entry = await prisma.journalEntry.findFirst({
        where: { id },
        include: {
          lines: { include: { account: true } },
          order: true,
          payment: true,
        },
      });
      if (!entry) {
        set.status = 404;
        return { success: false, message: "Journal entry not found." };
      }
      return { success: true, entry };
    },
    { params: t.Object({ id: t.String() }) },
  )

  // -------------------------------------------------------------------
  // 3. POST – CREATE MANUAL JOURNAL ENTRY
  // -------------------------------------------------------------------
  .post(
    "/",
    async ({ body, role, set }) => {
      if (role !== "SUPER_ADMIN") {
        set.status = 403;
        return { success: false, message: "Forbidden" };
      }

      // Validate debit = credit
      let totalDebit = 0;
      let totalCredit = 0;
      for (const line of body.lines) {
        if (line.side === "DEBIT") totalDebit += line.amount;
        else totalCredit += line.amount;
      }
      if (Math.abs(totalDebit - totalCredit) > 0.001) {
        set.status = 400;
        return {
          success: false,
          message: "Debit and Credit totals must balance.",
          diff: totalDebit - totalCredit,
        };
      }

      const entryNumber = `JE-${Date.now()}`;

      const journalEntry = await prisma.$transaction(async (tx: any) => {
        const created = await tx.journalEntry.create({
          data: {
            tenantId: body.tenantId,
            entryNumber,
            date: body.date ? new Date(body.date) : new Date(),
            description: body.description,
            reference: body.reference,
            entryType: body.entryType || "MANUAL",
            status: body.status || "DRAFT",
            orderId: body.orderId,
            paymentId: body.paymentId,
            lines: {
              create: body.lines.map((line) => ({
                accountId: line.accountId,
                amount: line.amount,
                side: line.side,
                description: line.description,
                currencyCode: body.currencyCode || "USD",
                exchangeRate: body.exchangeRate || 1,
              })),
            },
          },
          include: { lines: true },
        });
        return created;
      });

      set.status = 201;
      return {
        success: true,
        message: "Journal entry created.",
        journalEntry,
      };
    },
    {
      body: t.Object({
        tenantId: t.String(),
        date: t.Optional(t.String()),
        description: t.Optional(t.String()),
        reference: t.Optional(t.String()),
        entryType: t.Optional(t.String()),
        status: t.Optional(t.String()),
        orderId: t.Optional(t.String()),
        paymentId: t.Optional(t.String()),
        currencyCode: t.Optional(t.String()),
        exchangeRate: t.Optional(t.Number()),
        lines: t.Array(
          t.Object({
            accountId: t.String(),
            amount: t.Number(),
            side: t.String(), // DEBIT or CREDIT
            description: t.Optional(t.String()),
          }),
        ),
      }),
    },
  )

  // -------------------------------------------------------------------
  // 4. POST – POST (Finalize) Journal Entry
  // -------------------------------------------------------------------
  .post(
    "/:id/post",
    async ({ params: { id }, role, set }) => {
      if (role !== "SUPER_ADMIN") {
        set.status = 403;
        return { success: false, message: "Forbidden" };
      }
      const entry = await prisma.journalEntry.findFirst({
        where: { id },
        include: { lines: true },
      });
      if (!entry) {
        set.status = 404;
        return { success: false, message: "Journal entry not found." };
      }
      if (entry.status === "POSTED") {
        set.status = 400;
        return { success: false, message: "Entry already posted." };
      }

      // Here you could add additional logic, e.g., update account balances, etc.
      const updated = await prisma.journalEntry.update({
        where: { id },
        data: { status: "POSTED" },
      });

      return {
        success: true,
        message: "Journal entry posted.",
        journalEntry: updated,
      };
    },
    { params: t.Object({ id: t.String() }) },
  )

  // -------------------------------------------------------------------
  // 5. DELETE – Soft Delete (or hard delete if DRAFT)
  // -------------------------------------------------------------------
  .delete(
    "/:id",
    async ({ params: { id }, role, set }) => {
      if (role !== "SUPER_ADMIN") {
        set.status = 403;
        return { success: false, message: "Forbidden" };
      }
      const entry = await prisma.journalEntry.findFirst({
        where: { id },
      });
      if (!entry) {
        set.status = 404;
        return { success: false, message: "Journal entry not found." };
      }
      if (entry.status === "POSTED") {
        set.status = 400;
        return { success: false, message: "Cannot delete a posted entry." };
      }
      await prisma.journalEntry.delete({ where: { id } });
      return { success: true, message: "Journal entry deleted." };
    },
    { params: t.Object({ id: t.String() }) },
  );
