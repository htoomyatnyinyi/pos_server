import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";
import { tenantAuthMiddleware } from "../../middlewares/tenantAuthMiddleware";
import { requireRoles } from "../lib/security";

export const customerRoutes = new Elysia({ prefix: "/customers" })
  .use(tenantAuthMiddleware)

  // GET /customers – list all customers
  .get(
    "/",
    async ({ tenantId, query }) => {
      const page = query.page ? parseInt(query.page as string) : 1;
      const limit = query.limit ? parseInt(query.limit as string) : 20;
      const skip = (page - 1) * limit;
      const search = query.search as string;
      const tier = query.tier as string;

      const whereCondition: any = {
        tenantId,
        deletedAt: null,
        isActive: true,
      };
      if (tier) whereCondition.tier = tier;
      if (search) {
        whereCondition.OR = [
          { name: { contains: search, mode: "insensitive" } },
          { phone: { contains: search, mode: "insensitive" } },
          { code: { contains: search, mode: "insensitive" } },
          { email: { contains: search, mode: "insensitive" } },
        ];
      }

      const [total, customers] = await prisma.$transaction([
        prisma.customer.count({ where: whereCondition }),
        prisma.customer.findMany({
          where: whereCondition,
          orderBy: { createdAt: "desc" },
          skip,
          take: limit,
        }),
      ]);

      return {
        success: true,
        meta: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
        customers,
      };
    },
    {
      query: t.Optional(
        t.Object({
          page: t.Optional(t.String()),
          limit: t.Optional(t.String()),
          search: t.Optional(t.String()),
          tier: t.Optional(t.String()),
        }),
      ),
    },
  )

  // GET /customers/:id – get single customer
  .get(
    "/:id",
    async ({ params: { id }, tenantId, set }) => {
      const customer = await prisma.customer.findFirst({
        where: { id, tenantId, deletedAt: null },
        include: {
          orders: { take: 10, orderBy: { createdAt: "desc" } },
          wallet: true,
          giftCards: true,
        },
      });
      if (!customer) {
        set.status = 404;
        return {
          success: false,
          message: "Customer not found or access denied.",
        };
      }
      return { success: true, customer };
    },
    { params: t.Object({ id: t.String() }) },
  )

  // POST /customers – create new customer
  .post(
    "/",
    async ({ body, tenantId, userId, role, set }) => {
      requireRoles(role, ["ADMIN", "MANAGER", "SUPER_ADMIN"], set);

      const generatedCode = body.code ? body.code.trim() : `CUS-${Date.now()}`;

      const existing = await prisma.customer.findFirst({
        where: {
          tenantId,
          OR: [
            { code: generatedCode },
            ...(body.phone ? [{ phone: body.phone.trim() }] : []),
            ...(body.email ? [{ email: body.email.trim().toLowerCase() }] : []),
          ],
          deletedAt: null,
        },
      });
      if (existing) {
        set.status = 400;
        return {
          success: false,
          message: "Customer with this code, phone or email already exists.",
        };
      }

      const customer = await prisma.$transaction(async (tx: any) => {
        const created = await tx.customer.create({
          data: {
            tenantId,
            code: generatedCode,
            name: body.name.trim(),
            phone: body.phone ? body.phone.trim() : null,
            email: body.email ? body.email.trim().toLowerCase() : null,
            address: body.address ? body.address.trim() : null,
            dateOfBirth: body.dateOfBirth ? new Date(body.dateOfBirth) : null,
            gender: body.gender ?? null,
            tier: body.tier ?? "BRONZE",
          },
        });
        await tx.auditLog.create({
          data: {
            tenantId,
            userId,
            action: "CREATE",
            entity: "Customer",
            entityId: created.id,
            newData: JSON.parse(JSON.stringify(created)),
          },
        });
        return created;
      });

      set.status = 201;
      return {
        success: true,
        message: "Customer created successfully.",
        customer,
      };
    },
    {
      body: t.Object({
        code: t.Optional(t.String()),
        name: t.String({ minLength: 1 }),
        phone: t.Optional(t.String()),
        email: t.Optional(t.String()),
        address: t.Optional(t.String()),
        dateOfBirth: t.Optional(t.String()),
        gender: t.Optional(t.String()),
        tier: t.Optional(t.String()),
      }),
    },
  )

  // PUT /customers/:id – update customer
  .put(
    "/:id",
    async ({ params: { id }, body, tenantId, userId, role, set }) => {
      requireRoles(role, ["ADMIN", "MANAGER", "SUPER_ADMIN"], set);

      const currentCustomer = await prisma.customer.findFirst({
        where: { id, tenantId, deletedAt: null },
      });
      if (!currentCustomer) {
        set.status = 404;
        return { success: false, message: "Customer not found." };
      }

      const updatedCustomer = await prisma.$transaction(async (tx: any) => {
        const updated = await tx.customer.update({
          where: { id },
          data: {
            code: body.code?.trim(),
            name: body.name?.trim(),
            phone: body.phone?.trim(),
            email: body.email?.trim().toLowerCase(),
            address: body.address?.trim(),
            dateOfBirth: body.dateOfBirth
              ? new Date(body.dateOfBirth)
              : undefined,
            gender: body.gender,
            tier: body.tier,
            isActive: body.isActive,
          },
        });
        await tx.auditLog.create({
          data: {
            tenantId,
            userId,
            action: "UPDATE",
            entity: "Customer",
            entityId: id,
            oldData: JSON.parse(JSON.stringify(currentCustomer)),
            newData: JSON.parse(JSON.stringify(updated)),
          },
        });
        return updated;
      });

      return {
        success: true,
        message: "Customer updated successfully.",
        customer: updatedCustomer,
      };
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Partial(
        t.Object({
          code: t.Optional(t.String()),
          name: t.Optional(t.String()),
          phone: t.Optional(t.String()),
          email: t.Optional(t.String()),
          address: t.Optional(t.String()),
          dateOfBirth: t.Optional(t.String()),
          gender: t.Optional(t.String()),
          tier: t.Optional(t.String()),
          isActive: t.Optional(t.Boolean()),
        }),
      ),
    },
  )

  // DELETE /customers/:id – soft delete
  .delete(
    "/:id",
    async ({ params: { id }, tenantId, userId, role, set }) => {
      requireRoles(role, ["ADMIN", "MANAGER", "SUPER_ADMIN"], set);

      const customer = await prisma.customer.findFirst({
        where: { id, tenantId, deletedAt: null },
      });
      if (!customer) {
        set.status = 404;
        return {
          success: false,
          message: "Customer not found or already deleted.",
        };
      }

      await prisma.$transaction(async (tx: any) => {
        const deleted = await tx.customer.update({
          where: { id },
          data: { deletedAt: new Date(), isActive: false },
        });
        await tx.auditLog.create({
          data: {
            tenantId,
            userId,
            action: "DELETE",
            entity: "Customer",
            entityId: id,
            oldData: JSON.parse(JSON.stringify(customer)),
            newData: JSON.parse(JSON.stringify(deleted)),
          },
        });
      });

      return {
        success: true,
        message: "Customer soft-deleted successfully.",
      };
    },
    { params: t.Object({ id: t.String() }) },
  );

// import { Elysia, t } from "elysia";
// import { prisma } from "../lib/prisma";
// import { tenantAuthMiddleware } from "../../middlewares/tenantAuthMiddleware";
// import { CustomerTier } from "@prisma/client";

// export const customerRoutes = new Elysia({
//   prefix: "/customers",
// })
//   // 🔐 Multi-Tenant Authentication Middleware ချိတ်ဆက်ခြင်း
//   .use(tenantAuthMiddleware)

//   /**
//    * 1. GET ALL CUSTOMERS WITH TENANT ISOLATION, SEARCH & PAGINATION
//    */
//   .get(
//     "/",
//     async ({ tenantId, query }) => {
//       const page = query.page ? parseInt(query.page as string) : 1;
//       const limit = query.limit ? parseInt(query.limit as string) : 20;
//       const skip = (page - 1) * limit;

//       const whereCondition: any = {
//         tenantId,
//         deletedAt: null, // ဖျက်ဆီးထားခြင်းမရှိသော Active Customer များကိုသာ ပြသမည်
//         ...(query.search
//           ? {
//               OR: [
//                 {
//                   name: {
//                     contains: query.search as string,
//                     mode: "insensitive",
//                   },
//                 },
//                 {
//                   phone: {
//                     contains: query.search as string,
//                     mode: "insensitive",
//                   },
//                 },
//                 {
//                   code: {
//                     contains: query.search as string,
//                     mode: "insensitive",
//                   },
//                 },
//               ],
//             }
//           : {}),
//         ...(query.tier ? { tier: query.tier as CustomerTier } : {}),
//       };

//       const [total, customers] = await prisma.$transaction([
//         prisma.customer.count({ where: whereCondition }),
//         prisma.customer.findMany({
//           where: whereCondition,
//           include: { wallet: true },
//           orderBy: { createdAt: "desc" },
//           skip,
//           take: limit,
//         }),
//       ]);

//       return {
//         success: true,
//         meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
//         customers,
//       };
//     },
//     {
//       query: t.Optional(
//         t.Object({
//           page: t.Optional(t.String()),
//           limit: t.Optional(t.String()),
//           search: t.Optional(t.String()), // Name, Phone သို့မဟုတ် Customer Code ဖြင့် ရှာဖွေရန်
//           tier: t.Optional(t.String()),
//         }),
//       ),
//     },
//   )

//   /**
//    * 2. GET SINGLE CUSTOMER DETAILS BY ID (WITH TRANSACTIONS HISTORY)
//    */
//   .get(
//     "/:id",
//     async ({ params: { id }, tenantId, set }) => {
//       const customer = await prisma.customer.findFirst({
//         // 🚨 ပြင်ပ Tenant မှ ဒေတာလှမ်းယူခြင်းနှင့် ဖျက်ဆီးထားသော Customer ဖြစ်ခြင်းမှ ကာကွယ်ရန်
//         where: { id, tenantId, deletedAt: null },
//         include: {
//           orders: { take: 10, orderBy: { createdAt: "desc" } }, // Performance စိတ်ချရစေရန် နောက်ဆုံး Order ၁၀ ခုသာ ပြမည်
//           wallet: {
//             include: {
//               transactions: { take: 20, orderBy: { createdAt: "desc" } },
//             },
//           },
//           loyaltyTransactions: { take: 20, orderBy: { createdAt: "desc" } },
//         },
//       });

//       if (!customer) {
//         set.status = 404;
//         return {
//           success: false,
//           message: "Customer profile not found or access denied.",
//         };
//       }

//       return { success: true, customer };
//     },
//     { params: t.Object({ id: t.String() }) },
//   )

//   /**
//    * 3. POST: REGISTER NEW CUSTOMER profile
//    */
//   .post(
//     "/",
//     async ({ body, tenantId, userId, set }) => {
//       const generatedCode = body.code
//         ? body.code.trim().toUpperCase()
//         : `CUST-${Date.now()}`;

//       // ဖုန်းနံပါတ် တူညီမှု ရှိမရှိ ကြိုတင်စစ်ဆေးခြင်း (တူညီပါက Double entry မဖြစ်စေရန်)
//       if (body.phone) {
//         const existingCustomer = await prisma.customer.findFirst({
//           where: { tenantId, phone: body.phone.trim(), deletedAt: null },
//         });
//         if (existingCustomer) {
//           set.status = 400;
//           return {
//             success: false,
//             message: `A customer with phone number '${body.phone}' already exists.`,
//           };
//         }
//       }

//       const customer = await prisma.$transaction(async (tx) => {
//         const created = await tx.customer.create({
//           data: {
//             tenantId,
//             code: generatedCode,
//             name: body.name.trim(),
//             phone: body.phone ? body.phone.trim() : null,
//             email: body.email ? body.email.trim().toLowerCase() : null,
//             address: body.address ? body.address.trim() : null,
//             dateOfBirth: body.dateOfBirth ? new Date(body.dateOfBirth) : null,
//             gender: body.gender ?? null,
//             debtAmount: body.debtAmount ?? 0,
//             tier: (body.tier as CustomerTier) || CustomerTier.BRONZE,
//             isActive: true,
//             // 💡 အနာဂတ်တွင် ငွေကြိုသွင်းစနစ်သုံးနိုင်ရန် Customer ဖန်တီးချိန်၌ Wallet ပါ တစ်ပါတည်း တည်ဆောက်ပေးမည်
//             wallet: {
//               create: {
//                 tenantId,
//                 balance: 0,
//               },
//             },
//           },
//           include: { wallet: true },
//         });

//         // Audit Log Track User Action
//         await tx.auditLog.create({
//           data: {
//             tenantId,
//             userId,
//             action: "CREATE",
//             entity: "Customer",
//             entityId: created.id,
//             newData: JSON.parse(JSON.stringify(created)),
//           },
//         });

//         return created;
//       });

//       set.status = 201;
//       return {
//         success: true,
//         message: "Customer profile registered successfully.",
//         customer,
//       };
//     },
//     {
//       body: t.Object({
//         code: t.Optional(t.String()),
//         name: t.String({ minLength: 1 }),
//         phone: t.Optional(t.String()),
//         email: t.Optional(t.String()),
//         address: t.Optional(t.String()),
//         dateOfBirth: t.Optional(t.String()),
//         debtAmount: t.Optional(t.Number()),
//         gender: t.Optional(t.String()),
//         tier: t.Optional(t.String()), // Schema CustomerTier Enum နှင့် ကိုက်ညီရမည်
//       }),
//     },
//   )

//   /**
//    * 4. PUT: UPDATE CUSTOMER RECORDS WITH AUDIT LOGGING
//    */
//   .put(
//     "/:id",
//     async ({ params: { id }, body, tenantId, userId, set }) => {
//       const currentCustomer = await prisma.customer.findFirst({
//         where: { id, tenantId, deletedAt: null },
//       });

//       if (!currentCustomer) {
//         set.status = 404;
//         return {
//           success: false,
//           message: "Customer profile not found or access denied.",
//         };
//       }

//       const updatedCustomer = await prisma.$transaction(async (tx) => {
//         const updated = await tx.customer.update({
//           where: { id },
//           data: {
//             code: body.code ? body.code.trim().toUpperCase() : undefined,
//             name: body.name ? body.name.trim() : undefined,
//             phone: body.phone ? body.phone.trim() : undefined,
//             email: body.email ? body.email.trim().toLowerCase() : undefined,
//             address: body.address ? body.address.trim() : undefined,
//             dateOfBirth: body.dateOfBirth
//               ? new Date(body.dateOfBirth)
//               : undefined,
//             gender: body.gender,
//             debtAmount: body.debtAmount,
//             loyaltyPoints: body.loyaltyPoints,
//             totalSpent: body.totalSpent,
//             tier: body.tier ? (body.tier as CustomerTier) : undefined,
//             isActive: body.isActive,
//           },
//         });

//         // Track Updates inside System History Record
//         await tx.auditLog.create({
//           data: {
//             tenantId,
//             userId,
//             action: "UPDATE",
//             entity: "Customer",
//             entityId: id,
//             oldData: JSON.parse(JSON.stringify(currentCustomer)),
//             newData: JSON.parse(JSON.stringify(updated)),
//           },
//         });

//         return updated;
//       });

//       return {
//         success: true,
//         message: "Customer profile updated successfully.",
//         customer: updatedCustomer,
//       };
//     },
//     {
//       params: t.Object({ id: t.String() }),
//       body: t.Partial(
//         t.Object({
//           code: t.Optional(t.String()),
//           name: t.Optional(t.String()),
//           phone: t.Optional(t.String()),
//           email: t.Optional(t.String()),
//           address: t.Optional(t.String()),
//           dateOfBirth: t.Optional(t.String()),
//           debtAmount: t.Optional(t.Number()),
//           gender: t.Optional(t.String()),
//           loyaltyPoints: t.Optional(t.Integer()),
//           totalSpent: t.Optional(t.Number()),
//           tier: t.Optional(t.String()),
//           isActive: t.Optional(t.Boolean()),
//         }),
//       ),
//     },
//   )

//   /**
//    * 5. DELETE: SOFT-DELETE CUSTOMER RECORD
//    */
//   .delete(
//     "/:id",
//     async ({ params: { id }, tenantId, userId, set }) => {
//       const customer = await prisma.customer.findFirst({
//         where: { id, tenantId, deletedAt: null },
//       });

//       if (!customer) {
//         set.status = 404;
//         return {
//           success: false,
//           message: "Customer profile not found or already deleted.",
//         };
//       }

//       await prisma.$transaction(async (tx) => {
//         const deleted = await tx.customer.update({
//           where: { id },
//           data: {
//             deletedAt: new Date(),
//             isActive: false,
//           },
//         });

//         // Track deletion in Audit Database
//         await tx.auditLog.create({
//           data: {
//             tenantId,
//             userId,
//             action: "DELETE",
//             entity: "Customer",
//             entityId: id,
//             oldData: JSON.parse(JSON.stringify(customer)),
//             newData: JSON.parse(JSON.stringify(deleted)),
//           },
//         });
//       });

//       return {
//         success: true,
//         message: "Customer profile has been successfully soft-deleted.",
//       };
//     },
//     { params: t.Object({ id: t.String() }) },
//   );
