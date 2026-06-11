import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";
import { tenantAuthMiddleware } from "../../middlewares/tenantAuthMiddleware";

export const taxRateRoutes = new Elysia({
  prefix: "/tax-rates",
})
  // 🔐 Multi-Tenant Authentication Middleware ချိတ်ဆက်ခြင်း
  .use(tenantAuthMiddleware)

  /**
   * 1. GET ALL TAX RATES WITH TENANT ISOLATION
   */
  .get(
    "/",
    async ({ tenantId, query }) => {
      const whereCondition: any = {
        tenantId,
        deletedAt: null, // ဖျက်ဆီးထားခြင်းမရှိသော Active အခွန်နှုန်းထားများကိုသာ ပြမည်
        ...(query.isActive !== undefined
          ? { isActive: query.isActive === "true" }
          : {}),
      };

      const taxRates = await prisma.taxRate.findMany({
        where: whereCondition,
        orderBy: { createdAt: "desc" },
      });

      return {
        success: true,
        taxRates,
      };
    },
    {
      query: t.Optional(
        t.Object({
          isActive: t.Optional(t.String()), // "true" သို့မဟုတ် "false" ဖြင့် စစ်ထုတ်နိုင်ရန်
        }),
      ),
    },
  )

  /**
   * 2. GET SINGLE TAX RATE DETAIL BY ID
   */
  .get(
    "/:id",
    async ({ params: { id }, tenantId, set }) => {
      const taxRate = await prisma.taxRate.findFirst({
        // 🚨 ပြင်ပ Tenant မှ ဒေတာလှမ်းယူခြင်းနှင့် ဖျက်ဆီးထားသော အခွန်နှုန်းထား ဖြစ်ခြင်းမှ ကာကွယ်ရန်
        where: { id, tenantId, deletedAt: null },
      });

      if (!taxRate) {
        set.status = 404;
        return {
          success: false,
          message: "Tax rate configuration not found or access denied.",
        };
      }

      return { success: true, taxRate };
    },
    { params: t.Object({ id: t.String() }) },
  )

  /**
   * 3. POST: CREATE NEW TAX RATE RULE (အခွန်နှုန်းထားအသစ် သတ်မှတ်ခြင်း)
   */
  .post(
    "/",
    async ({ body, tenantId, userId, set }) => {
      const taxName = body.name.trim();

      // အခွန်အမည် တူညီမှု ရှိမရှိ ကြိုတင်စစ်ဆေးခြင်း
      const existingTax = await prisma.taxRate.findFirst({
        where: {
          tenantId,
          name: { equals: taxName, mode: "insensitive" },
          deletedAt: null,
        },
      });

      if (existingTax) {
        set.status = 400;
        return {
          success: false,
          message: `A tax configuration with the name '${taxName}' already exists.`,
        };
      }

      const taxRate = await prisma.$transaction(async (tx) => {
        const created = await tx.taxRate.create({
          data: {
            tenantId,
            name: taxName,
            rate: body.rate,
            isCompound: body.isCompound ?? false,
            appliesTo: body.appliesTo ?? ["PRODUCT"],
            validFrom: body.validFrom ? new Date(body.validFrom) : new Date(),
            validTo: body.validTo ? new Date(body.validTo) : null,
            isActive: true,
          },
        });

        // Track Action inside System Audit Logs
        await tx.auditLog.create({
          data: {
            tenantId,
            userId,
            action: "CREATE",
            entity: "TaxRate",
            entityId: created.id,
            newData: JSON.parse(JSON.stringify(created)),
          },
        });

        return created;
      });

      set.status = 201;
      return {
        success: true,
        message: "Tax rate rule established successfully.",
        taxRate,
      };
    },
    {
      body: t.Object({
        name: t.String({ minLength: 1 }),
        rate: t.Number({ minimum: 0 }), // 🚨 အခွန်နှုန်းထား အနှုတ်ကိန်းမဖြစ်စေရန် Guard Rail ခံထားသည်
        isCompound: t.Optional(t.Boolean()),
        appliesTo: t.Optional(t.Array(t.String())),
        validFrom: t.Optional(t.String()),
        validTo: t.Optional(t.String()),
      }),
    },
  )

  /**
   * 4. PUT: UPDATE TAX RATE CONFIGURATION
   */
  .put(
    "/:id",
    async ({ params: { id }, body, tenantId, userId, set }) => {
      const currentTaxRate = await prisma.taxRate.findFirst({
        where: { id, tenantId, deletedAt: null },
      });

      if (!currentTaxRate) {
        set.status = 404;
        return {
          success: false,
          message: "Tax rate profile not found or access denied.",
        };
      }

      const updatedTaxRate = await prisma.$transaction(async (tx) => {
        const updated = await tx.taxRate.update({
          where: { id },
          data: {
            name: body.name ? body.name.trim() : undefined,
            rate: body.rate !== undefined ? body.rate : undefined,
            isCompound: body.isCompound,
            appliesTo: body.appliesTo,
            validFrom: body.validFrom ? new Date(body.validFrom) : undefined,
            validTo: body.validTo
              ? new Date(body.validTo)
              : body.validTo === null
                ? null
                : undefined,
            isActive: body.isActive,
          },
        });

        // Audit Logging Operational Changes
        await tx.auditLog.create({
          data: {
            tenantId,
            userId,
            action: "UPDATE",
            entity: "TaxRate",
            entityId: id,
            oldData: JSON.parse(JSON.stringify(currentTaxRate)),
            newData: JSON.parse(JSON.stringify(updated)),
          },
        });

        return updated;
      });

      return {
        success: true,
        message: "Tax configuration updated successfully.",
        taxRate: updatedTaxRate,
      };
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Partial(
        t.Object({
          name: t.Optional(t.String()),
          rate: t.Optional(t.Number({ minimum: 0 })),
          isCompound: t.Optional(t.Boolean()),
          appliesTo: t.Optional(t.Array(t.String())),
          validFrom: t.Optional(t.String()),
          validTo: t.Optional(t.String()),
          isActive: t.Optional(t.Boolean()),
        }),
      ),
    },
  )

  /**
   * 5. DELETE: SOFT-DELETE TAX RATE
   */
  .delete(
    "/:id",
    async ({ params: { id }, tenantId, userId, set }) => {
      const taxRate = await prisma.taxRate.findFirst({
        where: { id, tenantId, deletedAt: null },
      });

      if (!taxRate) {
        set.status = 404;
        return {
          success: false,
          message: "Tax rate rule not found or already deleted.",
        };
      }

      await prisma.$transaction(async (tx) => {
        const deleted = await tx.taxRate.update({
          where: { id },
          data: {
            deletedAt: new Date(),
            isActive: false,
          },
        });

        // Track Delete Action in System Registry
        await tx.auditLog.create({
          data: {
            tenantId,
            userId,
            action: "DELETE",
            entity: "TaxRate",
            entityId: id,
            oldData: JSON.parse(JSON.stringify(taxRate)),
            newData: JSON.parse(JSON.stringify(deleted)),
          },
        });
      });

      return {
        success: true,
        message:
          "Tax rate configuration has been successfully deprecated and archived.",
      };
    },
    { params: t.Object({ id: t.String() }) },
  );
// import { Elysia, t } from "elysia";
// import { prisma } from "../lib/prisma";
// import { requireTenantId } from "../lib/tenant";

// export const taxRateRoutes = new Elysia({
//   prefix: "/tax-rates",
// })
//   .get("/", async ({ query, set }) => {
//     const tenantId = requireTenantId({ query, set });
//     if (!tenantId) return { message: "tenantId is required" };

//     return prisma.taxRate.findMany({
//       where: { tenantId, deletedAt: null },
//       orderBy: { createdAt: "desc" },
//     });
//   })
//   .get("/:id", async ({ params, set }) => {
//     const taxRate = await prisma.taxRate.findUnique({
//       where: { id: params.id },
//     });
//     if (!taxRate) {
//       set.status = 404;
//       return { message: "Tax rate not found" };
//     }
//     return taxRate;
//   })
//   .post(
//     "/",
//     async ({ body, set }) => {
//       set.status = 201;
//       return prisma.taxRate.create({
//         data: {
//           tenantId: body.tenantId,
//           name: body.name,
//           rate: body.rate,
//           isCompound: body.isCompound ?? false,
//           appliesTo: body.appliesTo ?? ["PRODUCT"],
//           validFrom: body.validFrom ? new Date(body.validFrom) : new Date(),
//           validTo: body.validTo ? new Date(body.validTo) : undefined,
//         },
//       });
//     },
//     {
//       body: t.Object({
//         tenantId: t.String(),
//         name: t.String(),
//         rate: t.Number(),
//         isCompound: t.Optional(t.Boolean()),
//         appliesTo: t.Optional(t.Array(t.String())),
//         validFrom: t.Optional(t.String()),
//         validTo: t.Optional(t.String()),
//       }),
//     },
//   )
//   .put(
//     "/:id",
//     async ({ params, body }) => {
//       return prisma.taxRate.update({
//         where: { id: params.id },
//         data: {
//           ...body,
//           validFrom: body.validFrom ? new Date(body.validFrom) : undefined,
//           validTo: body.validTo ? new Date(body.validTo) : undefined,
//         },
//       });
//     },
//     {
//       body: t.Partial(
//         t.Object({
//           name: t.Optional(t.String()),
//           rate: t.Optional(t.Number()),
//           isCompound: t.Optional(t.Boolean()),
//           appliesTo: t.Optional(t.Array(t.String())),
//           validFrom: t.Optional(t.String()),
//           validTo: t.Optional(t.String()),
//           isActive: t.Optional(t.Boolean()),
//         }),
//       ),
//     },
//   )
//   .delete("/:id", async ({ params }) => {
//     return prisma.taxRate.update({
//       where: { id: params.id },
//       data: { deletedAt: new Date(), isActive: false },
//     });
//   });
