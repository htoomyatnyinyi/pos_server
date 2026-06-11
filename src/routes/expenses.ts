import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";
import { tenantAuthMiddleware } from "../../middlewares/tenantAuthMiddleware";

export const expenseRoutes = new Elysia({
  prefix: "/expenses",
})
  .use(tenantAuthMiddleware)

  // --- EXPENSE CATEGORIES GROUP ---
  .group("/categories", (app) =>
    app
      .get("/", async ({ tenantId }) => {
        return prisma.expenseCategory.findMany({
          where: { tenantId, deletedAt: null },
          orderBy: { name: "asc" },
        });
      })
      .post(
        "/",
        async ({ body, tenantId }) => {
          return prisma.expenseCategory.create({
            data: { tenantId, ...body },
          });
        },
        {
          body: t.Object({
            name: t.String(),
            description: t.Optional(t.String()),
          }),
        },
      )
      .put(
        "/:id",
        async ({ params: { id }, body, tenantId }) => {
          return prisma.expenseCategory.update({
            where: { id, tenantId },
            data: {
              name: body.name ?? undefined,
              description: body.description ?? undefined,
            },
          });
        },
        {
          body: t.Partial(
            t.Object({ name: t.String(), description: t.String() }),
          ),
        },
      )
      .delete("/:id", async ({ params: { id }, tenantId }) => {
        return prisma.expenseCategory.update({
          where: { id, tenantId },
          data: { deletedAt: new Date() },
        });
      }),
  )

  // --- EXPENSES CORE ---
  .get("/", async ({ tenantId, query }) => {
    return prisma.expense.findMany({
      where: {
        tenantId,
        deletedAt: null,
        ...(query.storeId ? { storeId: query.storeId as string } : {}),
        ...(query.categoryId ? { categoryId: query.categoryId as string } : {}),
      },
      include: { category: true, store: true },
      orderBy: { expenseDate: "desc" },
    });
  })
  .post(
    "/",
    async ({ body, tenantId, userId, set }) => {
      const expense = await prisma.expense.create({
        data: {
          tenantId,
          storeId: body.storeId,
          categoryId: body.categoryId,
          amount: body.amount,
          description: body.description,
          receiptUrl: body.receiptUrl,
          expenseDate: body.expenseDate
            ? new Date(body.expenseDate)
            : new Date(),
          createdById: userId,
        },
      });
      set.status = 201;
      return expense;
    },
    {
      body: t.Object({
        categoryId: t.String(),
        amount: t.Number(),
        storeId: t.Optional(t.String()),
        description: t.Optional(t.String()),
        receiptUrl: t.Optional(t.String()),
        expenseDate: t.Optional(t.String()),
      }),
    },
  )
  .put(
    "/:id",
    async ({ params: { id }, body, tenantId, userId }) => {
      const current = await prisma.expense.findFirst({
        where: { id, tenantId },
      });
      if (!current) throw new Error("Expense not found");

      return prisma.$transaction(async (tx) => {
        const updated = await tx.expense.update({
          where: { id },
          data: {
            storeId: body.storeId ?? undefined,
            categoryId: body.categoryId ?? undefined,
            amount: body.amount ?? undefined,
            description: body.description ?? undefined,
            receiptUrl: body.receiptUrl ?? undefined,
            expenseDate: body.expenseDate
              ? new Date(body.expenseDate)
              : undefined,
          },
        });

        await tx.auditLog.create({
          data: {
            tenantId,
            userId,
            action: "UPDATE",
            entity: "Expense",
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
          storeId: t.String(),
          categoryId: t.String(),
          amount: t.Number(),
          description: t.String(),
          receiptUrl: t.String(),
          expenseDate: t.String(),
        }),
      ),
    },
  )
  .delete("/:id", async ({ params: { id }, tenantId, userId }) => {
    return prisma.$transaction(async (tx) => {
      const deleted = await tx.expense.update({
        where: { id, tenantId },
        data: { deletedAt: new Date() },
      });

      await tx.auditLog.create({
        data: {
          tenantId,
          userId,
          action: "DELETE",
          entity: "Expense",
          entityId: id,
          oldData: JSON.parse(JSON.stringify(deleted)),
        },
      });
      return { success: true };
    });
  });

// import { Elysia, t } from "elysia";
// import { prisma } from "../lib/prisma";
// import { tenantAuthMiddleware } from "../../middlewares/tenantAuthMiddleware";

// export const expenseRoutes = new Elysia({
//   prefix: "/expenses",
// })
//   .use(tenantAuthMiddleware)

//   // --- EXPENSE CATEGORIES GROUP ---
//   .group("/categories", (app) =>
//     app
//       .get("/", async ({ tenantId }) => {
//         return prisma.expenseCategory.findMany({
//           where: { tenantId, deletedAt: null },
//           orderBy: { name: "asc" },
//         });
//       })
//       .post(
//         "/",
//         async ({ body, tenantId, userId }) => {
//           return prisma.expenseCategory.create({
//             data: { tenantId, ...body },
//           });
//         },
//         {
//           body: t.Object({
//             name: t.String(),
//             description: t.Optional(t.String()),
//           }),
//         },
//       )
//       .put("/:id", async ({ params: { id }, body, tenantId }) => {
//         return prisma.expenseCategory.update({
//           where: { id, tenantId },
//           data: body,
//         });
//       })
//       .delete("/:id", async ({ params: { id }, tenantId }) => {
//         return prisma.expenseCategory.update({
//           where: { id, tenantId },
//           data: { deletedAt: new Date(), isActive: false },
//         });
//       }),
//   )

//   // --- EXPENSES CORE ---
//   .get("/", async ({ tenantId, query }) => {
//     const where: any = {
//       tenantId,
//       deletedAt: null,
//       ...(query.storeId ? { storeId: query.storeId as string } : {}),
//       ...(query.categoryId ? { categoryId: query.categoryId as string } : {}),
//     };

//     return prisma.expense.findMany({
//       where,
//       include: { category: true, store: true },
//       orderBy: { expenseDate: "desc" },
//     });
//   })
//   .get("/:id", async ({ params: { id }, tenantId, set }) => {
//     const expense = await prisma.expense.findFirst({
//       where: { id, tenantId, deletedAt: null },
//       include: { category: true, store: true },
//     });
//     if (!expense) {
//       set.status = 404;
//       return { success: false, message: "Expense not found" };
//     }
//     return expense;
//   })
//   .post(
//     "/",
//     async ({ body, tenantId, userId, set }) => {
//       const expense = await prisma.expense.create({
//         data: {
//           tenantId,
//           storeId: body.storeId,
//           categoryId: body.categoryId,
//           amount: body.amount,
//           description: body.description,
//           receiptUrl: body.receiptUrl,
//           expenseDate: body.expenseDate
//             ? new Date(body.expenseDate)
//             : new Date(),
//           createdById: userId, // Auth မှတဆင့်ရသော userId ကိုသုံးခြင်း
//         },
//       });
//       set.status = 201;
//       return expense;
//     },
//     {
//       body: t.Object({
//         categoryId: t.String(),
//         amount: t.Number(),
//         storeId: t.Optional(t.String()),
//         description: t.Optional(t.String()),
//         receiptUrl: t.Optional(t.String()),
//         expenseDate: t.Optional(t.String()),
//       }),
//     },
//   )
// // 💡 အခုလို ပြင်ဆင်လိုက်ပါ
// .put(
//   "/:id",
//   async ({ params: { id }, body, tenantId, userId }) => {
//     // 💡 ယခုဆိုရင် body ကို TypeScript က အောက်ပါအတိုင်း အသိအမှတ်ပြုပါလိမ့်မယ်
//     // body: { storeId?: string, categoryId?: string, ... }

//     const current = await prisma.expense.findFirst({ where: { id, tenantId } });
//     if (!current) throw new Error("Not found");

//     return prisma.$transaction(async (tx) => {
//       const updated = await tx.expense.update({
//         where: { id },
//         data: {
//           storeId: body.storeId, // အခုဆို Error မတက်တော့ပါ
//           categoryId: body.categoryId,
//           amount: body.amount,
//           description: body.description,
//           receiptUrl: body.receiptUrl,
//           expenseDate: body.expenseDate ? new Date(body.expenseDate) : undefined,
//         },
//       });

//       // ... ကျန်တဲ့ logic များ
//       return updated;
//     });
//   },
//   {
//     // ဒီ Schema က body ရဲ့ structure ကို ဆုံးဖြတ်ပေးတာပါ
//     body: t.Partial(
//       t.Object({
//         storeId: t.String(),
//         categoryId: t.String(),
//         amount: t.Number(),
//         description: t.String(),
//         receiptUrl: t.String(),
//         expenseDate: t.String(),
//       }),
//     ),
//   }
// )
//   .delete("/:id", async ({ params: { id }, tenantId, userId }) => {
//     return prisma.$transaction(async (tx) => {
//       const deleted = await tx.expense.update({
//         where: { id, tenantId },
//         data: { deletedAt: new Date() },
//       });

//       await tx.auditLog.create({
//         data: {
//           tenantId,
//           userId,
//           action: "DELETE",
//           entity: "Expense",
//           entityId: id,
//           oldData: JSON.parse(JSON.stringify(deleted)),
//         },
//       });
//       return { success: true };
//     });
//   });

// // import { Elysia, t } from "elysia";
// // import { prisma } from "../lib/prisma";
// // import { requireTenantId } from "../lib/tenant";

// // export const expenseRoutes = new Elysia({
// //   prefix: "/expenses",
// // })
// //   .group("/categories", (app) =>
// //     app
// //       .get("/", async ({ query, set }) => {
// //         const tenantId = requireTenantId({ query, set });
// //         if (!tenantId) return { message: "tenantId is required" };

// //         return prisma.expenseCategory.findMany({
// //           where: { tenantId, deletedAt: null },
// //           orderBy: { name: "asc" },
// //         });
// //       })
// //       .post(
// //         "/",
// //         async ({ body, set }) => {
// //           set.status = 201;
// //           return prisma.expenseCategory.create({
// //             data: {
// //               tenantId: body.tenantId,
// //               name: body.name,
// //               description: body.description,
// //             },
// //           });
// //         },
// //         {
// //           body: t.Object({
// //             tenantId: t.String(),
// //             name: t.String(),
// //             description: t.Optional(t.String()),
// //           }),
// //         },
// //       )
// //       .put(
// //         "/:id",
// //         async ({ params, body }) => {
// //           return prisma.expenseCategory.update({
// //             where: { id: params.id },
// //             data: body,
// //           });
// //         },
// //         {
// //           body: t.Partial(
// //             t.Object({
// //               name: t.Optional(t.String()),
// //               description: t.Optional(t.String()),
// //               isActive: t.Optional(t.Boolean()),
// //             }),
// //           ),
// //         },
// //       )
// //       .delete("/:id", async ({ params }) => {
// //         return prisma.expenseCategory.update({
// //           where: { id: params.id },
// //           data: { deletedAt: new Date(), isActive: false },
// //         });
// //       }),
// //   )
// //   .get("/", async ({ query, set }) => {
// //     const tenantId = requireTenantId({ query, set });
// //     if (!tenantId) return { message: "tenantId is required" };

// //     return prisma.expense.findMany({
// //       where: {
// //         tenantId,
// //         ...(query.storeId ? { storeId: query.storeId } : {}),
// //         ...(query.categoryId ? { categoryId: query.categoryId } : {}),
// //       },
// //       include: {
// //         category: true,
// //         store: true,
// //         createdBy: { select: { id: true, name: true } },
// //       },
// //       orderBy: { expenseDate: "desc" },
// //     });
// //   })
// //   .get("/:id", async ({ params, set }) => {
// //     const expense = await prisma.expense.findUnique({
// //       where: { id: params.id },
// //       include: { category: true, store: true, createdBy: true },
// //     });
// //     if (!expense) {
// //       set.status = 404;
// //       return { message: "Expense not found" };
// //     }
// //     return expense;
// //   })
// //   .post(
// //     "/",
// //     async ({ body, set }) => {
// //       set.status = 201;
// //       return prisma.expense.create({
// //         data: {
// //           tenantId: body.tenantId,
// //           storeId: body.storeId,
// //           categoryId: body.categoryId,
// //           amount: body.amount,
// //           description: body.description,
// //           receiptUrl: body.receiptUrl,
// //           expenseDate: body.expenseDate ? new Date(body.expenseDate) : new Date(),
// //           createdById: body.userId,
// //         },
// //       });
// //     },
// //     {
// //       body: t.Object({
// //         tenantId: t.String(),
// //         categoryId: t.String(),
// //         amount: t.Number(),
// //         userId: t.String(),
// //         storeId: t.Optional(t.String()),
// //         description: t.Optional(t.String()),
// //         receiptUrl: t.Optional(t.String()),
// //         expenseDate: t.Optional(t.String()),
// //       }),
// //     },
// //   )
// //   .put(
// //     "/:id",
// //     async ({ params, body }) => {
// //       return prisma.expense.update({
// //         where: { id: params.id },
// //         data: {
// //           ...body,
// //           expenseDate: body.expenseDate ? new Date(body.expenseDate) : undefined,
// //         },
// //       });
// //     },
// //     {
// //       body: t.Partial(
// //         t.Object({
// //           storeId: t.Optional(t.String()),
// //           categoryId: t.Optional(t.String()),
// //           amount: t.Optional(t.Number()),
// //           description: t.Optional(t.String()),
// //           receiptUrl: t.Optional(t.String()),
// //           expenseDate: t.Optional(t.String()),
// //         }),
// //       ),
// //     },
// //   )
// //   .delete("/:id", async ({ params }) => {
// //     return prisma.expense.delete({ where: { id: params.id } });
// //   });
