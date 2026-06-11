import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";
import { tenantAuthMiddleware } from "../../middlewares/tenantAuthMiddleware";

export const tenantRoutes = new Elysia({
  prefix: "/tenants",
})
  // 🔐 Multi-Tenant User Authentication Context အား ချိတ်ဆက်ခြင်း
  .use(tenantAuthMiddleware)

  /**
   * 1. GET ALL TENANTS (SUPER ADMIN ONLY)
   * ပလက်ဖောင်းပေါ်ရှိ လုပ်ငန်းစုအားလုံးကို စာရင်းကြည့်ခြင်း
   */
  .get(
    "/",
    async ({ role, query, set }) => {
      // 🚨 လုံခြုံရေးအရ SUPER_ADMIN သို့မဟုတ် SYSTEM MANAGER မဟုတ်ပါက လုံးဝ ကြည့်ခွင့်မပြုပါ
      if (role !== "SUPER_ADMIN" && role !== "MANAGER") {
        set.status = 403;
        return {
          success: false,
          message: "Forbidden: Only Super Administrators can view all tenants.",
        };
      }

      const page = query.page ? parseInt(query.page as string) : 1;
      const limit = query.limit ? parseInt(query.limit as string) : 20;
      const skip = (page - 1) * limit;

      const whereCondition = { deletedAt: null };

      const [total, tenants] = await prisma.$transaction([
        prisma.tenant.count({ where: whereCondition }),
        prisma.tenant.findMany({
          where: whereCondition,
          include: {
            subscription: { include: { plan: true } },
          },
          orderBy: { createdAt: "desc" },
          skip,
          take: limit,
        }),
      ]);

      return {
        success: true,
        meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
        tenants,
      };
    },
    {
      query: t.Optional(
        t.Object({
          page: t.Optional(t.String()),
          limit: t.Optional(t.String()),
        }),
      ),
    },
  )

  /**
   * 2. GET SINGLE TENANT BY ID (OWN TENANT OR SUPER ADMIN)
   * မိမိလုပ်ငန်းအသေးစိတ် (သို့မဟုတ်) Super Admin မှ လုပ်ငန်းတစ်ခုချင်းစီအား စစ်ဆေးခြင်း
   */
  .get(
    "/:id",
    async ({ params: { id }, tenantId, role, set }) => {
      // 🚨 လုံခြုံရေးအရ မိမိ Tenant ID နှင့် ကိုက်ညီရမည် (သို့မဟုတ်) Super Admin ဖြစ်ရမည်
      if (role !== "SUPER_ADMIN" && tenantId !== id) {
        set.status = 403;
        return {
          success: false,
          message:
            "Access denied. You cannot view other tenant's configuration.",
        };
      }

      const tenant = await prisma.tenant.findFirst({
        where: { id, deletedAt: null },
        include: {
          subscription: { include: { plan: true } },
          stores: { where: { deletedAt: null } },
          tenantFeatures: { include: { feature: true } },
        },
      });

      if (!tenant) {
        set.status = 404;
        return { success: false, message: "Tenant organization not found." };
      }

      return { success: true, tenant };
    },
    { params: t.Object({ id: t.String() }) },
  )

  /**
   * 3. POST: REGISTER/CREATE NEW TENANT (SYSTEM/SIGNUP ROOT)
   * ကုမ္ပဏီ/လုပ်ငန်းအသစ်တစ်ခု စနစ်ထဲသို့ စတင်စာရင်းသွင်းခြင်း
   */
  .post(
    "/",
    async ({ body, userId, set }) => {
      const generatedCode = body.code
        ? body.code.trim().toUpperCase()
        : `TNT-${Date.now()}`;

      // ဥပဒေအရ Code တူညီမှု ရှိမရှိ စစ်ဆေးခြင်း
      const existingTenant = await prisma.tenant.findFirst({
        where: { code: generatedCode },
      });

      if (existingTenant) {
        set.status = 400;
        return {
          success: false,
          message: `Tenant code '${generatedCode}' is already taken.`,
        };
      }

      const tenant = await prisma.$transaction(async (tx) => {
        const created = await tx.tenant.create({
          data: {
            code: generatedCode,
            name: body.name.trim(),
            email: body.email ? body.email.trim().toLowerCase() : null,
            phone: body.phone ? body.phone.trim() : null,
            isActive: true,
          },
        });

        // ခြေရာခံ မှတ်တမ်းသွင်းခြင်း
        await tx.auditLog.create({
          data: {
            tenantId: created.id, // New Tenant Log Boundary
            userId,
            action: "CREATE",
            entity: "Tenant",
            entityId: created.id,
            newData: JSON.parse(JSON.stringify(created)),
          },
        });

        return created;
      });

      set.status = 201;
      return {
        success: true,
        message: "Tenant account provisioned successfully.",
        tenant,
      };
    },
    {
      body: t.Object({
        code: t.Optional(t.String()),
        name: t.String({ minLength: 2 }),
        email: t.Optional(t.String({ format: "email" })),
        phone: t.Optional(t.String()),
      }),
    },
  )

  /**
   * 4. PUT: UPDATE TENANT SETTINGS (OWN TENANT OR SUPER ADMIN)
   * မိမိလုပ်ငန်း Profile အချက်အလက်များအား ပြင်ဆင်ခြင်း
   */
  .put(
    "/:id",
    async ({ params: { id }, body, tenantId, role, userId, set }) => {
      // 🚨 မိမိ လုပ်ငန်း ID ကလွဲပြီး အခြားသူများအား လှမ်းပြင်ခွင့်မပြုရန် ကာကွယ်ခြင်း
      if (role !== "SUPER_ADMIN" && tenantId !== id) {
        set.status = 403;
        return {
          success: false,
          message: "Unauthorized: Cannot modify other tenant profiles.",
        };
      }

      const currentTenant = await prisma.tenant.findFirst({
        where: { id, deletedAt: null },
      });

      if (!currentTenant) {
        set.status = 404;
        return { success: false, message: "Tenant account not found." };
      }

      const updatedTenant = await prisma.$transaction(async (tx) => {
        const updated = await tx.tenant.update({
          where: { id },
          data: {
            name: body.name ? body.name.trim() : undefined,
            email: body.email ? body.email.trim().toLowerCase() : undefined,
            phone: body.phone ? body.phone.trim() : undefined,
            isActive: body.isActive !== undefined ? body.isActive : undefined,
          },
        });

        // Track Update inside AuditLogs
        await tx.auditLog.create({
          data: {
            tenantId: id,
            userId,
            action: "UPDATE",
            entity: "Tenant",
            entityId: id,
            oldData: JSON.parse(JSON.stringify(currentTenant)),
            newData: JSON.parse(JSON.stringify(updated)),
          },
        });

        return updated;
      });

      return {
        success: true,
        message: "Tenant profile updated successfully.",
        tenant: updatedTenant,
      };
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Partial(
        t.Object({
          name: t.Optional(t.String()),
          email: t.Optional(t.String()),
          phone: t.Optional(t.String()),
          isActive: t.Optional(t.Boolean()),
        }),
      ),
    },
  )

  /**
   * 5. DELETE: SOFT-DELETE TENANT (SUPER ADMIN ONLY)
   * လုပ်ငန်းတစ်ခုလုံးအား စနစ်ပေါ်မှ ဆိုင်းငံ့/ပိတ်သိမ်းခြင်း (Soft Delete)
   */
  .delete(
    "/:id",
    async ({ params: { id }, role, userId, set }) => {
      // 🚨 ဘေးကင်းလုံခြုံရေးအရ Tenant ဖျက်သိမ်းခြင်းကို SUPER ADMIN တစ်ဦးတည်းသာ လုပ်ဆောင်ခွင့်ရှိသည်
      if (role !== "SUPER_ADMIN") {
        set.status = 403;
        return {
          success: false,
          message:
            "Critical: Only Platform Super Administrators can delete tenants.",
        };
      }

      const tenant = await prisma.tenant.findFirst({
        where: { id, deletedAt: null },
      });

      if (!tenant) {
        set.status = 404;
        return {
          success: false,
          message: "Tenant target not found or already deleted.",
        };
      }

      await prisma.$transaction(async (tx) => {
        const deleted = await tx.tenant.update({
          where: { id },
          data: {
            deletedAt: new Date(),
            isActive: false,
          },
        });

        // Audit Log critical action
        await tx.auditLog.create({
          data: {
            tenantId: id,
            userId,
            action: "DELETE",
            entity: "Tenant",
            entityId: id,
            oldData: JSON.parse(JSON.stringify(tenant)),
            newData: JSON.parse(JSON.stringify(deleted)),
          },
        });
      });

      return {
        success: true,
        message:
          "Tenant account has been successfully deactivated and soft-deleted.",
      };
    },
    { params: t.Object({ id: t.String() }) },
  );
// import { Elysia, t } from "elysia";
// import { prisma } from "../lib/prisma";

// export const tenantRoutes = new Elysia({
//   prefix: "/tenants",
// })
//   .get("/", async () => {
//     return prisma.tenant.findMany({
//       where: { deletedAt: null },
//       include: { subscription: { include: { plan: true } } },
//       orderBy: { createdAt: "desc" },
//     });
//   })
//   .get("/:id", async ({ params, set }) => {
//     const tenant = await prisma.tenant.findUnique({
//       where: { id: params.id },
//       include: {
//         subscription: { include: { plan: true } },
//         stores: { where: { deletedAt: null } },
//         tenantFeatures: { include: { feature: true } },
//       },
//     });
//     if (!tenant) {
//       set.status = 404;
//       return { message: "Tenant not found" };
//     }
//     return tenant;
//   })
//   .post(
//     "/",
//     async ({ body, set }) => {
//       set.status = 201;
//       return prisma.tenant.create({
//         data: {
//           code: body.code || `TNT-${Date.now()}`,
//           name: body.name,
//           email: body.email,
//           phone: body.phone,
//         },
//       });
//     },
//     {
//       body: t.Object({
//         code: t.Optional(t.String()),
//         name: t.String(),
//         email: t.Optional(t.String()),
//         phone: t.Optional(t.String()),
//       }),
//     },
//   )
//   .put(
//     "/:id",
//     async ({ params, body }) => {
//       return prisma.tenant.update({
//         where: { id: params.id },
//         data: body,
//       });
//     },
//     {
//       body: t.Partial(
//         t.Object({
//           name: t.Optional(t.String()),
//           email: t.Optional(t.String()),
//           phone: t.Optional(t.String()),
//           isActive: t.Optional(t.Boolean()),
//         }),
//       ),
//     },
//   )
//   .delete("/:id", async ({ params }) => {
//     return prisma.tenant.update({
//       where: { id: params.id },
//       data: { deletedAt: new Date(), isActive: false },
//     });
//   });
