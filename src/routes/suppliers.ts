import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";
import { tenantAuthMiddleware } from "../../middlewares/tenantAuthMiddleware";

export const supplierRoutes = new Elysia({
  prefix: "/suppliers",
})
  // 🔐 Multi-Tenant Authentication Middleware ချိတ်ဆက်ခြင်း
  .use(tenantAuthMiddleware)

  /**
   * 1. GET ALL SUPPLIERS WITH TENANT ISOLATION & PAGINATION
   */
  .get(
    "/",
    async ({ tenantId, query }) => {
      const page = query.page ? parseInt(query.page as string) : 1;
      const limit = query.limit ? parseInt(query.limit as string) : 20;
      const skip = (page - 1) * limit;

      const whereCondition: any = {
        tenantId,
        deletedAt: null, // Soft-deleted ဖြစ်ထားသော Supplier များကို ချန်လှပ်ထားမည်
        ...(query.search
          ? {
              OR: [
                {
                  name: {
                    contains: query.search as string,
                    mode: "insensitive",
                  },
                },
                {
                  code: {
                    contains: query.search as string,
                    mode: "insensitive",
                  },
                },
                {
                  contactName: {
                    contains: query.search as string,
                    mode: "insensitive",
                  },
                },
              ],
            }
          : {}),
      };

      const [total, suppliers] = await prisma.$transaction([
        prisma.supplier.count({ where: whereCondition }),
        prisma.supplier.findMany({
          where: whereCondition,
          orderBy: { createdAt: "desc" },
          skip,
          take: limit,
        }),
      ]);

      return {
        success: true,
        meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
        suppliers,
      };
    },
    {
      query: t.Optional(
        t.Object({
          page: t.Optional(t.String()),
          limit: t.Optional(t.String()),
          search: t.Optional(t.String()), // Name, Code သို့မဟုတ် Contact Name ဖြင့် ရှာဖွေနိုင်ရန်
        }),
      ),
    },
  )

  /**
   * 2. GET SINGLE SUPPLIER DETAILS BY ID
   */
  .get(
    "/:id",
    async ({ params: { id }, tenantId, set }) => {
      const supplier = await prisma.supplier.findFirst({
        // 🚨 ပြင်ပ Tenant မှ ဒေတာလှမ်းယူခြင်းနှင့် ဖျက်ဆီးထားသော Supplier ဖြစ်ခြင်းမှ ကာကွယ်ရန်
        where: {
          id,
          tenantId,
          deletedAt: null,
        },
        include: {
          products: { take: 10 }, // Performance စိတ်ချရစေရန် နောက်ဆုံးပစ္စည်း ၁၀ ခုသာ ယူပြမည်
          payments: { take: 10, orderBy: { createdAt: "desc" } },
        },
      });

      if (!supplier) {
        set.status = 404;
        return {
          success: false,
          message: "Supplier profile not found or access denied.",
        };
      }

      return { success: true, supplier };
    },
    { params: t.Object({ id: t.String() }) },
  )

  /**
   * 3. POST: REGISTER NEW SUPPLIER (ကုန်ပစ္စည်းသွင်းသူအသစ် စာရင်းသွင်းခြင်း)
   */
  .post(
    "/",
    async ({ body, tenantId, userId, set }) => {
      const generatedCode = body.code
        ? body.code.trim().toUpperCase()
        : `SUP-${Date.now()}`;

      // Supplier Code စနစ်ထဲမှာ ထပ်မနေစေရန် ကြိုတင်စစ်ဆေးခြင်း
      const existingSupplier = await prisma.supplier.findFirst({
        where: { tenantId, code: generatedCode, deletedAt: null },
      });

      if (existingSupplier) {
        set.status = 400;
        return {
          success: false,
          message: `Supplier code '${generatedCode}' is already in use.`,
        };
      }

      const supplier = await prisma.$transaction(async (tx) => {
        const created = await tx.supplier.create({
          data: {
            tenantId,
            code: generatedCode,
            name: body.name.trim(),
            contactName: body.contactName ? body.contactName.trim() : null,
            phone: body.phone ? body.phone.trim() : null,
            email: body.email ? body.email.trim().toLowerCase() : null,
            address: body.address ? body.address.trim() : null,
            taxId: body.taxId ? body.taxId.trim() : null,
            paymentTerms: body.paymentTerms ?? null,
            creditLimit: body.creditLimit ?? null,
            isActive: true,
          },
        });

        // Track Action inside System Audit Logs
        await tx.auditLog.create({
          data: {
            tenantId,
            userId,
            action: "CREATE",
            entity: "Supplier",
            entityId: created.id,
            newData: JSON.parse(JSON.stringify(created)),
          },
        });

        return created;
      });

      set.status = 201;
      return {
        success: true,
        message: "Supplier registered successfully.",
        supplier,
      };
    },
    {
      body: t.Object({
        code: t.Optional(t.String()),
        name: t.String({ minLength: 2 }),
        contactName: t.Optional(t.String()),
        phone: t.Optional(t.String()),
        email: t.Optional(t.String()),
        address: t.Optional(t.String()),
        taxId: t.Optional(t.String()),
        paymentTerms: t.Optional(t.Integer()),
        creditLimit: t.Optional(t.Number()),
      }),
    },
  )

  /**
   * 4. PUT: UPDATE SUPPLIER PROFILE WITH AUDIT TRAILS
   */
  .put(
    "/:id",
    async ({ params: { id }, body, tenantId, userId, set }) => {
      const currentSupplier = await prisma.supplier.findFirst({
        where: { id, tenantId, deletedAt: null },
      });

      if (!currentSupplier) {
        set.status = 404;
        return {
          success: false,
          message: "Supplier profile not found or access denied.",
        };
      }

      const updatedSupplier = await prisma.$transaction(async (tx) => {
        const updated = await tx.supplier.update({
          where: { id },
          data: {
            code: body.code ? body.code.trim().toUpperCase() : undefined,
            name: body.name ? body.name.trim() : undefined,
            contactName: body.contactName ? body.contactName.trim() : undefined,
            phone: body.phone ? body.phone.trim() : undefined,
            email: body.email ? body.email.trim().toLowerCase() : undefined,
            address: body.address ? body.address.trim() : undefined,
            taxId: body.taxId ? body.taxId.trim() : undefined,
            paymentTerms: body.paymentTerms,
            creditLimit: body.creditLimit,
            isActive: body.isActive,
          },
        });

        // Audit Logging Operational Data Changes
        await tx.auditLog.create({
          data: {
            tenantId,
            userId,
            action: "UPDATE",
            entity: "Supplier",
            entityId: id,
            oldData: JSON.parse(JSON.stringify(currentSupplier)),
            newData: JSON.parse(JSON.stringify(updated)),
          },
        });

        return updated;
      });

      return {
        success: true,
        message: "Supplier profile updated successfully.",
        supplier: updatedSupplier,
      };
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Partial(
        t.Object({
          code: t.Optional(t.String()),
          name: t.Optional(t.String()),
          contactName: t.Optional(t.String()),
          phone: t.Optional(t.String()),
          email: t.Optional(t.String()),
          address: t.Optional(t.String()),
          taxId: t.Optional(t.String()),
          paymentTerms: t.Optional(t.Integer()),
          creditLimit: t.Optional(t.Number()),
          isActive: t.Optional(t.Boolean()),
        }),
      ),
    },
  )

  /**
   * 5. DELETE: SOFT-DELETE SUPPLIER PROFILE
   */
  .delete(
    "/:id",
    async ({ params: { id }, tenantId, userId, set }) => {
      const supplier = await prisma.supplier.findFirst({
        where: { id, tenantId, deletedAt: null },
      });

      if (!supplier) {
        set.status = 404;
        return {
          success: false,
          message: "Supplier profile not found or already deleted.",
        };
      }

      await prisma.$transaction(async (tx) => {
        const deleted = await tx.supplier.update({
          where: { id },
          data: {
            deletedAt: new Date(),
            isActive: false,
          },
        });

        // Track Delete Action inside System Log Records
        await tx.auditLog.create({
          data: {
            tenantId,
            userId,
            action: "DELETE",
            entity: "Supplier",
            entityId: id,
            oldData: JSON.parse(JSON.stringify(supplier)),
            newData: JSON.parse(JSON.stringify(deleted)),
          },
        });
      });

      return {
        success: true,
        message:
          "Supplier profile has been successfully removed from active records.",
      };
    },
    { params: t.Object({ id: t.String() }) },
  );
// import { Elysia, t } from "elysia";
// import { prisma } from "../lib/prisma";
// import { requireTenantId } from "../lib/tenant";

// export const supplierRoutes = new Elysia({
//   prefix: "/suppliers",
// })
//   .get("/", async ({ query, set }) => {
//     const tenantId = requireTenantId({ query, set });
//     if (!tenantId) return { message: "tenantId is required" };

//     return prisma.supplier.findMany({
//       where: { tenantId, deletedAt: null },
//       orderBy: { createdAt: "desc" },
//     });
//   })
//   .get("/:id", async ({ params, set }) => {
//     const supplier = await prisma.supplier.findUnique({
//       where: { id: params.id },
//       include: { products: true, payments: true },
//     });
//     if (!supplier) {
//       set.status = 404;
//       return { message: "Supplier not found" };
//     }
//     return supplier;
//   })
//   .post(
//     "/",
//     async ({ body, set }) => {
//       set.status = 201;
//       return prisma.supplier.create({
//         data: {
//           tenantId: body.tenantId,
//           code: body.code || `SUP-${Date.now()}`,
//           name: body.name,
//           contactName: body.contactName,
//           phone: body.phone,
//           email: body.email,
//           address: body.address,
//           taxId: body.taxId,
//           paymentTerms: body.paymentTerms,
//           creditLimit: body.creditLimit,
//         },
//       });
//     },
//     {
//       body: t.Object({
//         tenantId: t.String(),
//         code: t.Optional(t.String()),
//         name: t.String(),
//         contactName: t.Optional(t.String()),
//         phone: t.Optional(t.String()),
//         email: t.Optional(t.String()),
//         address: t.Optional(t.String()),
//         taxId: t.Optional(t.String()),
//         paymentTerms: t.Optional(t.Integer()),
//         creditLimit: t.Optional(t.Number()),
//       }),
//     },
//   )
//   .put(
//     "/:id",
//     async ({ params, body }) => {
//       return prisma.supplier.update({
//         where: { id: params.id },
//         data: body,
//       });
//     },
//     {
//       body: t.Partial(
//         t.Object({
//           code: t.Optional(t.String()),
//           name: t.Optional(t.String()),
//           contactName: t.Optional(t.String()),
//           phone: t.Optional(t.String()),
//           email: t.Optional(t.String()),
//           address: t.Optional(t.String()),
//           taxId: t.Optional(t.String()),
//           paymentTerms: t.Optional(t.Integer()),
//           creditLimit: t.Optional(t.Number()),
//           isActive: t.Optional(t.Boolean()),
//         }),
//       ),
//     },
//   )
//   .delete("/:id", async ({ params }) => {
//     return prisma.supplier.update({
//       where: { id: params.id },
//       data: { deletedAt: new Date(), isActive: false },
//     });
//   });
