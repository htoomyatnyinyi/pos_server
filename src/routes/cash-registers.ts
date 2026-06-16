import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";
import { tenantAuthMiddleware } from "../../middlewares/tenantAuthMiddleware";

export const cashRegisterRoutes = new Elysia({
  prefix: "/cash-registers",
})
  // 🔐 Multi-Tenant Authentication Middleware ချိတ်ဆက်ခြင်း
  .use(tenantAuthMiddleware)

  /**
   * 1. GET ALL CASH REGISTERS (ACTIVE ONLY) WITH TENANT ISOLATION
   */
  .get(
    "/",
    async ({ tenantId, query }) => {
      const page = query.page ? parseInt(query.page as string) : 1;
      const limit = query.limit ? parseInt(query.limit as string) : 20;
      const skip = (page - 1) * limit;

      const whereCondition: any = {
        tenantId,
        deletedAt: null, // 💡 ဖျက်ဆီးထားခြင်းမရှိသော Active စက်များကိုသာ ပြသမည်
        ...(query.storeId ? { storeId: query.storeId as string } : {}),
        ...(query.status ? { status: query.status as any } : {}),
      };

      const [total, cashRegisters] = await prisma.$transaction([
        prisma.cashRegister.count({ where: whereCondition }),
        prisma.cashRegister.findMany({
          where: whereCondition,
          include: { store: true },
          orderBy: { createdAt: "desc" },
          skip,
          take: limit,
        }),
      ]);

      return {
        success: true,
        meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
        cashRegisters,
      };
    },
    {
      query: t.Optional(
        t.Object({
          page: t.Optional(t.String()),
          limit: t.Optional(t.String()),
          storeId: t.Optional(t.String()),
          status: t.Optional(t.String()),
        }),
      ),
    },
  )

  /**
   * 2. GET SINGLE CASH REGISTER BY ID (WITH SESSIONS HISTORY)
   */
  .get(
    "/:id",
    async ({ params: { id }, tenantId, set }) => {
      const register = await prisma.cashRegister.findFirst({
        // 🚨 ပြင်ပ Tenant မှ လှမ်းကြည့်ခြင်းနှင့် Soft-delete ဖြစ်ထားသောစက်ကို ကြည့်ခြင်းမှ ကာကွယ်ရန်
        where: {
          id,
          tenantId,
          deletedAt: null,
        },
        include: {
          store: true,
          sessions: {
            take: 10,
            orderBy: { openedAt: "desc" },
            include: { user: { select: { name: true } } },
          },
        },
      });

      if (!register) {
        set.status = 404;
        return {
          success: false,
          message: "Cash register not found or access denied.",
        };
      }

      return { success: true, register };
    },
    { params: t.Object({ id: t.String() }) },
  )

  /**
   * 3. POST: CREATE NEW CASH REGISTER (ကောင်တာစက်အသစ် စာရင်းသွင်းခြင်း)
   */
  .post(
    "/",
    async ({ body, tenantId, userId, set }) => {
      const register = await prisma.$transaction(async (tx) => {
        const created = await tx.cashRegister.create({
          data: {
            tenantId,
            storeId: body.storeId,
            name: body.name.trim(),
            status: body.status || "CLOSED",
          },
        });

        // System Audit Log Tracking
        await tx.auditLog.create({
          data: {
            tenantId,
            userId,
            action: "CREATE",
            entity: "CashRegister",
            entityId: created.id,
            newData: JSON.parse(JSON.stringify(created)),
          },
        });

        return created;
      });

      set.status = 201;
      return {
        success: true,
        message: "Cash register created successfully.",
        register,
      };
    },
    {
      body: t.Object({
        storeId: t.String(),
        name: t.String({ minLength: 1 }),
        status: t.Optional(
          t.Enum({
            OPEN: "OPEN",
            CLOSED: "CLOSED",
            SUSPENDED: "SUSPENDED",
            MAINTENANCE: "MAINTENANCE",
          }),
        ),
      }),
    },
  )

  /**
   * 4. PUT: UPDATE CASH REGISTER DETAILS & STATUS WITH AUDIT TRACK
   */
  .put(
    "/:id",
    async ({ params: { id }, body, tenantId, userId, set }) => {
      const currentRegister = await prisma.cashRegister.findFirst({
        where: { id, tenantId, deletedAt: null },
      });

      if (!currentRegister) {
        set.status = 404;
        return {
          success: false,
          message: "Cash register not found or access denied.",
        };
      }

      const updatedRegister = await prisma.cashRegister.update({
        where: { id },
        data: {
          name: body.name ? body.name.trim() : undefined,
          status: body.status,
        },
      });

      // Audit Log Track Update Operation
      await prisma.auditLog.create({
        data: {
          tenantId,
          userId,
          action: "UPDATE",
          entity: "CashRegister",
          entityId: id,
          oldData: JSON.parse(JSON.stringify(currentRegister)),
          newData: JSON.parse(JSON.stringify(updatedRegister)),
        },
      });

      return {
        success: true,
        message: "Cash register updated successfully.",
        register: updatedRegister,
      };
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Partial(
        t.Object({
          name: t.Optional(t.String()),
          status: t.Optional(
            t.Enum({
              OPEN: "OPEN",
              CLOSED: "CLOSED",
              SUSPENDED: "SUSPENDED",
              MAINTENANCE: "MAINTENANCE",
            }),
          ),
        }),
      ),
    },
  )

  /**
   * 5. DELETE: SOFT-DELETE CASH REGISTER (ဒေတာရင်းမြစ်မပျောက်ပျက်စေရန် အမှတ်အသားပြုခြင်း)
   */
  .delete(
    "/:id",
    async ({ params: { id }, tenantId, userId, set }) => {
      const register = await prisma.cashRegister.findFirst({
        where: { id, tenantId, deletedAt: null },
      });

      if (!register) {
        set.status = 404;
        return {
          success: false,
          message: "Cash register not found or already deleted.",
        };
      }

      const deletedRegister = await prisma.$transaction(async (tx) => {
        const updated = await tx.cashRegister.update({
          where: { id },
          data: {
            deletedAt: new Date(),
            status: "CLOSED", // ဖျက်လိုက်ပါက စက်ကိုပါ တစ်ပါတည်း ပိတ်ပစ်မည်
          },
        });

        // Track Delete Operation in Audit Records
        await tx.auditLog.create({
          data: {
            tenantId,
            userId,
            action: "DELETE",
            entity: "CashRegister",
            entityId: id,
            oldData: JSON.parse(JSON.stringify(register)),
            newData: JSON.parse(JSON.stringify(updated)),
          },
        });

        return updated;
      });

      return {
        success: true,
        message: "Cash register has been successfully removed.",
      };
    },
    { params: t.Object({ id: t.String() }) },
  );
