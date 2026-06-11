import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";
import { tenantAuthMiddleware } from "../../middlewares/tenantAuthMiddleware";
import { paymentMethodSchema } from "../lib/schemas";
import { PaymentStatus } from "@prisma/client";

export const paymentRoutes = new Elysia({
  prefix: "/payments",
})
  .use(tenantAuthMiddleware)

  /**
   * 1. GET ALL PAYMENTS (Tenant Isolated)
   */
  .get("/", async ({ tenantId, query }) => {
    const page = parseInt(query.page as string) || 1;
    const limit = parseInt(query.limit as string) || 20;

    return prisma.payment.findMany({
      where: { tenantId, deletedAt: null },
      include: { order: true, processedBy: { select: { name: true } } },
      orderBy: { processedAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    });
  })

  /**
   * 2. GET SINGLE PAYMENT
   */
  .get("/:id", async ({ params: { id }, tenantId, set }) => {
    const payment = await prisma.payment.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: { order: true, processedBy: true },
    });
    if (!payment) {
      set.status = 404;
      return { success: false, message: "Payment not found" };
    }
    return payment;
  })

  /**
   * 3. POST: PROCESS PAYMENT
   */
  .post(
    "/",
    async ({ body, tenantId, userId, set }) => {
      const payment = await prisma.$transaction(async (tx) => {
        const created = await tx.payment.create({
          data: {
            tenantId,
            orderId: body.orderId,
            amount: body.amount,
            method: body.method,
            referenceNumber: body.referenceNumber,
            // status: body.status || "PAID",
            // status: PaymentStatus.PAID,
            status: body.status
              ? (body.status as PaymentStatus)
              : PaymentStatus.PAID,
            processedById: userId, // Token မှရသော User ID ကိုသုံးခြင်း
          },
        });

        await tx.auditLog.create({
          data: {
            tenantId,
            userId,
            action: "CREATE",
            entity: "Payment",
            entityId: created.id,
            newData: JSON.parse(JSON.stringify(created)),
          },
        });
        return created;
      });

      set.status = 201;
      return { success: true, payment };
    },
    {
      body: t.Object({
        orderId: t.String(),
        amount: t.Number(),
        method: paymentMethodSchema,
        referenceNumber: t.Optional(t.String()),
        status: t.Optional(t.String()),
      }),
    },
  )

  /**
   * 4. PUT: UPDATE PAYMENT (e.g. Voiding or updating reference)
   */
  .put(
    "/:id",
    async ({ params: { id }, body, tenantId, userId }) => {
      const current = await prisma.payment.findFirst({
        where: { id, tenantId },
      });
      if (!current) throw new Error("Payment not found");

      return prisma.$transaction(async (tx) => {
        const updated = await tx.payment.update({
          where: { id },
          data: {
            amount: body.amount ?? undefined,
            method: body.method ?? undefined,
            referenceNumber: body.referenceNumber ?? undefined,
            // status: body.status ?? undefined,
            // status: PaymentStatus.PENDING,
            status: body.status ? (body.status as PaymentStatus) : undefined,
          },
        });

        await tx.auditLog.create({
          data: {
            tenantId,
            userId,
            action: "UPDATE",
            entity: "Payment",
            entityId: id,
            oldData: JSON.parse(JSON.stringify(current)),
            newData: JSON.parse(JSON.stringify(updated)),
          },
        });
        return updated;
      });
    },
    {
      body: t.Partial(
        t.Object({
          amount: t.Number(),
          method: paymentMethodSchema,
          referenceNumber: t.String(),
          status: t.String(),
        }),
      ),
    },
  )

  /**
   * 5. DELETE: SOFT-DELETE (VOID PAYMENT)
   */
  .delete("/:id", async ({ params: { id }, tenantId, userId }) => {
    return prisma.$transaction(async (tx) => {
      const deleted = await tx.payment.update({
        where: { id, tenantId },
        data: { deletedAt: new Date() },
      });

      await tx.auditLog.create({
        data: {
          tenantId,
          userId,
          action: "DELETE",
          entity: "Payment",
          entityId: id,
          oldData: JSON.parse(JSON.stringify(deleted)),
        },
      });
      return { success: true };
    });
  });
// import { Elysia, t } from "elysia";
// import { prisma } from "../lib/prisma";
// import { requireTenantId } from "../lib/tenant";
// import { paymentMethodSchema } from "../lib/schemas";

// export const paymentRoutes = new Elysia({
//   prefix: "/payments",
// })
//   .get("/", async ({ query, set }) => {
//     const tenantId = requireTenantId({ query, set });
//     if (!tenantId) return { message: "tenantId is required" };

//     return prisma.payment.findMany({
//       where: { tenantId },
//       include: { order: true, processedBy: { select: { id: true, name: true } } },
//       orderBy: { processedAt: "desc" },
//     });
//   })
//   .get("/:id", async ({ params, set }) => {
//     const payment = await prisma.payment.findUnique({
//       where: { id: params.id },
//       include: { order: true, processedBy: true },
//     });
//     if (!payment) {
//       set.status = 404;
//       return { message: "Payment not found" };
//     }
//     return payment;
//   })
//   .post(
//     "/",
//     async ({ body, set }) => {
//       set.status = 201;
//       return prisma.payment.create({
//         data: {
//           tenantId: body.tenantId,
//           orderId: body.orderId,
//           amount: body.amount,
//           method: body.method,
//           referenceNumber: body.referenceNumber,
//           status: body.status || "PAID",
//           processedById: body.processedById,
//         },
//       });
//     },
//     {
//       body: t.Object({
//         tenantId: t.String(),
//         orderId: t.String(),
//         amount: t.Number(),
//         method: paymentMethodSchema,
//         referenceNumber: t.Optional(t.String()),
//         status: t.Optional(t.String()),
//         processedById: t.String(),
//       }),
//     },
//   )
//   .put(
//     "/:id",
//     async ({ params, body }) => {
//       return prisma.payment.update({
//         where: { id: params.id },
//         data: body,
//       });
//     },
//     {
//       body: t.Partial(
//         t.Object({
//           amount: t.Number(),
//           method: paymentMethodSchema,
//           referenceNumber: t.Optional(t.String()),
//           status: t.Optional(t.String()),
//         }),
//       ),
//     },
//   )
//   .delete("/:id", async ({ params }) => {
//     return prisma.payment.delete({ where: { id: params.id } });
//   });
