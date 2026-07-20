import { Elysia, t } from "elysia";
import prisma from "../lib/prisma";
import { tenantAuthMiddleware } from "../../middlewares/tenantAuthMiddleware";
import { requireRoles } from "../lib/security";

export const brandRoutes = new Elysia({ prefix: "/brands" })
  .use(tenantAuthMiddleware)

  .get(
    "/",
    async ({ tenantId, query }) => {
      const page = query.page ? parseInt(query.page as string) : 1;
      const limit = query.limit ? parseInt(query.limit as string) : 50;
      const skip = (page - 1) * limit;
      const search = query.search as string;

      const whereCondition: any = { tenantId, deletedAt: null };
      if (search) {
        whereCondition.OR = [
          { name: { contains: search, mode: "insensitive" } },
          { description: { contains: search, mode: "insensitive" } },
        ];
      }

      const [total, brands] = await prisma.$transaction([
        prisma.brand.count({ where: whereCondition }),
        prisma.brand.findMany({
          where: whereCondition,
          orderBy: { createdAt: "desc" },
          include: { _count: { select: { products: true } } },
          skip,
          take: limit,
        }),
      ]);

      return {
        success: true,
        meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
        brands,
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
    "/:id",
    async ({ params: { id }, tenantId, set }) => {
      const brand = await prisma.brand.findFirst({
        where: { id, tenantId, deletedAt: null },
        include: { products: true },
      });
      if (!brand) {
        set.status = 404;
        return { success: false, message: "Brand not found or access denied." };
      }
      return { success: true, brand };
    },
    { params: t.Object({ id: t.String() }) },
  )

  .post(
    "/",
    async ({ body, tenantId, userId, role, set }) => {
      requireRoles(role, ["ADMIN", "MANAGER", "SUPER_ADMIN"], set);

      const existing = await prisma.brand.findFirst({
        where: { tenantId, name: body.name.trim(), deletedAt: null },
      });
      if (existing) {
        set.status = 400;
        return { success: false, message: "Brand name already exists." };
      }

      const brand = await prisma.$transaction(async (tx: any) => {
        const created = await tx.brand.create({
          data: {
            tenantId,
            name: body.name.trim(),
            description: body.description,
          },
        });
        await tx.auditLog.create({
          data: {
            tenantId,
            userId,
            action: "CREATE",
            entity: "Brand",
            entityId: created.id,
            newData: JSON.parse(JSON.stringify(created)),
          },
        });
        return created;
      });

      set.status = 201;
      return {
        success: true,
        message: "Brand created successfully.",
        brand,
      };
    },
    {
      body: t.Object({
        name: t.String({ error: "Brand name is required" }),
        description: t.Optional(t.String()),
      }),
    },
  )

  .put(
    "/:id",
    async ({ params: { id }, body, tenantId, userId, role, set }) => {
      requireRoles(role, ["ADMIN", "MANAGER", "SUPER_ADMIN"], set);

      const brand = await prisma.brand.findFirst({
        where: { id, tenantId, deletedAt: null },
      });
      if (!brand) {
        set.status = 404;
        return { success: false, message: "Brand not found." };
      }

      if (body.name) {
        const existing = await prisma.brand.findFirst({
          where: {
            tenantId,
            name: body.name.trim(),
            deletedAt: null,
            NOT: { id },
          },
        });
        if (existing) {
          set.status = 400;
          return { success: false, message: "Brand name already exists." };
        }
      }

      const updated = await prisma.brand.update({
        where: { id },
        data: {
          name: body.name?.trim(),
          description: body.description,
          isActive: body.isActive,
        },
      });

      await prisma.auditLog.create({
        data: {
          tenantId,
          userId,
          action: "UPDATE",
          entity: "Brand",
          entityId: id,
          oldData: JSON.parse(JSON.stringify(brand)),
          newData: JSON.parse(JSON.stringify(updated)),
        },
      });

      return {
        success: true,
        message: "Brand updated successfully.",
        brand: updated,
      };
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Partial(
        t.Object({
          name: t.Optional(t.String()),
          description: t.Optional(t.String()),
          isActive: t.Optional(t.Boolean()),
        }),
      ),
    },
  )

  .delete(
    "/:id",
    async ({ params: { id }, tenantId, userId, role, set }) => {
      requireRoles(role, ["ADMIN", "MANAGER", "SUPER_ADMIN"], set);

      const brand = await prisma.brand.findFirst({
        where: { id, tenantId, deletedAt: null },
      });
      if (!brand) {
        set.status = 404;
        return {
          success: false,
          message: "Brand not found or already deleted.",
        };
      }

      // Prevent deletion if products use this brand
      const hasProducts = await prisma.product.findFirst({
        where: { brandId: id, deletedAt: null },
      });
      if (hasProducts) {
        set.status = 400;
        return {
          success: false,
          message:
            "Cannot delete brand. It is linked to active products. Please reassign them first.",
        };
      }

      await prisma.$transaction(async (tx: any) => {
        const deleted = await tx.brand.update({
          where: { id },
          data: { deletedAt: new Date(), isActive: false },
        });
        await tx.auditLog.create({
          data: {
            tenantId,
            userId,
            action: "DELETE",
            entity: "Brand",
            entityId: id,
            oldData: JSON.parse(JSON.stringify(brand)),
            newData: JSON.parse(JSON.stringify(deleted)),
          },
        });
      });

      return { success: true, message: "Brand deleted successfully." };
    },
    { params: t.Object({ id: t.String() }) },
  );

// import { Elysia, t } from "elysia";
// // import { prisma } from "../lib/prisma";
// import prisma from "../lib/prisma";
// import { tenantAuthMiddleware } from "../../middlewares/tenantAuthMiddleware";

// export const brandRoutes = new Elysia({ prefix: "/brands" })
//   .use(tenantAuthMiddleware)

//   /**
//    * 1. READ ALL WITH PAGINATION & SEARCH
//    */
//   .get(
//     "/",
//     async ({ tenantId, query }) => {
//       const page = query.page ? parseInt(query.page as string) : 1;
//       const limit = query.limit ? parseInt(query.limit as string) : 50;
//       const skip = (page - 1) * limit;
//       const search = query.search as string;

//       const whereCondition: any = {
//         tenantId,
//         deletedAt: null,
//       };

//       if (search) {
//         whereCondition.OR = [
//           { name: { contains: search, mode: "insensitive" } },
//           { description: { contains: search, mode: "insensitive" } },
//         ];
//       }

//       const [total, brands] = await prisma.$transaction([
//         prisma.brand.count({ where: whereCondition }),
//         prisma.brand.findMany({
//           where: whereCondition,
//           orderBy: { createdAt: "desc" },
//           include: { _count: { select: { products: true } } },
//           skip,
//           take: limit,
//         }),
//       ]);

//       return {
//         success: true,
//         meta: {
//           total,
//           page,
//           limit,
//           totalPages: Math.ceil(total / limit),
//         },
//         brands,
//       };
//     },
//     {
//       query: t.Optional(
//         t.Object({
//           page: t.Optional(t.String()),
//           limit: t.Optional(t.String()),
//           search: t.Optional(t.String()),
//         }),
//       ),
//     },
//   )

//   /**
//    * 2. READ SINGLE
//    */
//   .get(
//     "/:id",
//     async ({ params: { id }, tenantId, set }) => {
//       const brand = await prisma.brand.findFirst({
//         where: { id, tenantId, deletedAt: null },
//         include: { products: true },
//       });

//       if (!brand) {
//         set.status = 404;
//         return {
//           success: false,
//           message: "Brand not found or access denied.",
//         };
//       }

//       return { success: true, brand };
//     },
//     { params: t.Object({ id: t.String() }) },
//   )

//   /**
//    * 3. CREATE BRAND
//    */
//   .post(
//     "/",
//     async ({ body, tenantId, role, set }) => {
//       if (role !== "ADMIN" && role !== "SUPER_ADMIN" && role !== "MANAGER") {
//         set.status = 403;
//         return { success: false, message: "Forbidden: Access denied." };
//       }

//       const existingBrand = await prisma.brand.findFirst({
//         where: { tenantId, name: body.name.trim(), deletedAt: null },
//       });

//       if (existingBrand) {
//         set.status = 400;
//         return {
//           success: false,
//           message: "Brand name already exists.",
//         };
//       }

//       const newBrand = await prisma.brand.create({
//         data: {
//           tenantId,
//           name: body.name.trim(),
//           description: body.description,
//         },
//       });

//       set.status = 201;
//       return {
//         success: true,
//         message: "Brand created successfully.",
//         brand: newBrand,
//       };
//     },
//     {
//       body: t.Object({
//         name: t.String({ error: "Brand name is required" }),
//         description: t.Optional(t.String()),
//       }),
//     },
//   )

//   /**
//    * 4. UPDATE BRAND
//    */
//   .put(
//     "/:id",
//     async ({ params: { id }, body, tenantId, role, set }) => {
//       if (role !== "ADMIN" && role !== "SUPER_ADMIN" && role !== "MANAGER") {
//         set.status = 403;
//         return { success: false, message: "Forbidden: Access denied." };
//       }

//       const brand = await prisma.brand.findFirst({
//         where: { id, tenantId, deletedAt: null },
//       });

//       if (!brand) {
//         set.status = 404;
//         return { success: false, message: "Brand not found." };
//       }

//       if (body.name) {
//         const existingBrand = await prisma.brand.findFirst({
//           where: {
//             tenantId,
//             name: body.name.trim(),
//             deletedAt: null,
//             NOT: { id },
//           },
//         });

//         if (existingBrand) {
//           set.status = 400;
//           return {
//             success: false,
//             message: "Brand name already exists.",
//           };
//         }
//       }

//       const updatedBrand = await prisma.brand.update({
//         where: { id },
//         data: {
//           name: body.name?.trim(),
//           description: body.description,
//           isActive: body.isActive,
//         },
//       });

//       return {
//         success: true,
//         message: "Brand updated successfully.",
//         brand: updatedBrand,
//       };
//     },
//     {
//       params: t.Object({ id: t.String() }),
//       body: t.Partial(
//         t.Object({
//           name: t.Optional(t.String()),
//           description: t.Optional(t.String()),
//           isActive: t.Optional(t.Boolean()),
//         }),
//       ),
//     },
//   )

//   /**
//    * 5. SOFT DELETE BRAND
//    */
//   .delete(
//     "/:id",
//     async ({ params: { id }, tenantId, role, set }) => {
//       if (role !== "ADMIN" && role !== "SUPER_ADMIN" && role !== "MANAGER") {
//         set.status = 403;
//         return { success: false, message: "Forbidden: Access denied." };
//       }

//       const brand = await prisma.brand.findFirst({
//         where: { id, tenantId, deletedAt: null },
//       });

//       if (!brand) {
//         set.status = 404;
//         return {
//           success: false,
//           message: "Brand not found or already deleted.",
//         };
//       }

//       // 🛡️ Prevent deletion if products use this brand
//       const hasProducts = await prisma.product.findFirst({
//         where: { brandId: id, deletedAt: null },
//       });

//       if (hasProducts) {
//         set.status = 400;
//         return {
//           success: false,
//           message:
//             "Cannot delete brand. It is linked to active products. Please reassign them first.",
//         };
//       }

//       await prisma.brand.update({
//         where: { id },
//         data: {
//           deletedAt: new Date(),
//           isActive: false,
//         },
//       });

//       return { success: true, message: "Brand deleted successfully." };
//     },
//     { params: t.Object({ id: t.String() }) },
//   );
