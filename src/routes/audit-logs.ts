import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";
import { tenantAuthMiddleware } from "../../middlewares/tenantAuthMiddleware";
import { AuditAction } from "@prisma/client";
import { requireRoles } from "../lib/security";

export const auditLogRoutes = new Elysia({ prefix: "/audit-logs" })
  .use(tenantAuthMiddleware)

  .get(
    "/",
    async ({ tenantId, query }) => {
      const page = query.page ? parseInt(query.page as string) : 1;
      const limit = query.limit ? parseInt(query.limit as string) : 50;
      const skip = (page - 1) * limit;
      const whereCondition: any = {
        tenantId,
        ...(query.userId ? { userId: query.userId as string } : {}),
        ...(query.entity
          ? { entity: { equals: query.entity as string, mode: "insensitive" } }
          : {}),
        ...(query.action ? { action: query.action as AuditAction } : {}),
      };
      const [total, logs] = await prisma.$transaction([
        prisma.auditLog.count({ where: whereCondition }),
        prisma.auditLog.findMany({
          where: whereCondition,
          include: { user: { select: { id: true, name: true, role: true } } },
          orderBy: { createdAt: "desc" },
          skip,
          take: limit,
        }),
      ]);
      return {
        success: true,
        meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
        logs,
      };
    },
    {
      query: t.Optional(
        t.Object({
          page: t.Optional(t.String()),
          limit: t.Optional(t.String()),
          userId: t.Optional(t.String()),
          entity: t.Optional(t.String()),
          action: t.Optional(t.String()),
        }),
      ),
    },
  )

  .get(
    "/:id",
    async ({ params: { id }, tenantId, set }) => {
      const log = await prisma.auditLog.findFirst({
        where: { id, tenantId },
        include: {
          user: { select: { id: true, name: true, email: true, role: true } },
        },
      });
      if (!log) {
        set.status = 404;
        return {
          success: false,
          message: "Audit log entry not found or access denied.",
        };
      }
      return { success: true, log };
    },
    { params: t.Object({ id: t.String() }) },
  )

  .post(
    "/",
    async ({ body, tenantId, userId, role, request, set }) => {
      requireRoles(role, ["ADMIN", "MANAGER", "SUPER_ADMIN"], set);

      const ipAddress = request.headers.get("x-forwarded-for") || "127.0.0.1";
      const userAgent =
        request.headers.get("user-agent") || "Unknown System Agent";

      const log = await prisma.auditLog.create({
        data: {
          tenantId,
          userId: body.userId || userId,
          action: body.action as AuditAction,
          entity: body.entity.trim(),
          entityId: body.entityId,
          oldData: body.oldData
            ? JSON.parse(JSON.stringify(body.oldData))
            : null,
          newData: body.newData
            ? JSON.parse(JSON.stringify(body.newData))
            : null,
          changes: body.changes
            ? JSON.parse(JSON.stringify(body.changes))
            : null,
          ipAddress: body.ipAddress || ipAddress,
          userAgent: body.userAgent || userAgent,
        },
      });

      set.status = 201;
      return {
        success: true,
        message: "Security audit trail registered successfully.",
        logId: log.id,
      };
    },
    {
      body: t.Object({
        userId: t.Optional(t.String()),
        action: t.String(),
        entity: t.String({ minLength: 1 }),
        entityId: t.String({ minLength: 1 }),
        oldData: t.Optional(t.Any()),
        newData: t.Optional(t.Any()),
        changes: t.Optional(t.Any()),
        ipAddress: t.Optional(t.String()),
        userAgent: t.Optional(t.String()),
      }),
    },
  );

// import { Elysia, t } from "elysia";
// import { prisma } from "../lib/prisma";
// import { tenantAuthMiddleware } from "../../middlewares/tenantAuthMiddleware";
// import { AuditAction } from "@prisma/client";

// export const auditLogRoutes = new Elysia({
//   prefix: "/audit-logs",
// })
//   // 🔐 Multi-Tenant Authentication Middleware ချိတ်ဆက်ခြင်း
//   .use(tenantAuthMiddleware)

//   /**
//    * 1. GET ALL AUDIT LOGS WITH TENANT ISOLATION, FILTERING & PAGINATION
//    */
//   .get(
//     "/",
//     async ({ tenantId, query }) => {
//       const page = query.page ? parseInt(query.page as string) : 1;
//       const limit = query.limit ? parseInt(query.limit as string) : 50; // Default 50 per page
//       const skip = (page - 1) * limit;

//       const whereCondition: any = {
//         tenantId,
//         ...(query.userId ? { userId: query.userId as string } : {}),
//         ...(query.entity
//           ? { entity: { equals: query.entity as string, mode: "insensitive" } }
//           : {}),
//         ...(query.action ? { action: query.action as AuditAction } : {}),
//       };

//       // Performance ကောင်းမွန်စေရန် Transaction ဖြင့် တစ်ပြိုင်နက် Query ဆွဲခြင်း
//       const [total, logs] = await prisma.$transaction([
//         prisma.auditLog.count({ where: whereCondition }),
//         prisma.auditLog.findMany({
//           where: whereCondition,
//           include: {
//             user: {
//               select: { id: true, name: true, role: true },
//             },
//           },
//           orderBy: { createdAt: "desc" }, // အသစ်ဆုံးမှတ်တမ်းများကို အပေါ်ဆုံးမှ ပြမည်
//           skip,
//           take: limit,
//         }),
//       ]);

//       return {
//         success: true,
//         meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
//         logs,
//       };
//     },
//     {
//       query: t.Optional(
//         t.Object({
//           page: t.Optional(t.String()),
//           limit: t.Optional(t.String()),
//           userId: t.Optional(t.String()),
//           entity: t.Optional(t.String()), // ဥပမာ - "Product", "Order", "Supplier"
//           action: t.Optional(t.String()), // Schema AuditAction Enum (CREATE, UPDATE, DELETE)
//         }),
//       ),
//     },
//   )

//   /**
//    * 2. GET SINGLE AUDIT LOG DETAIL BY ID
//    */
//   .get(
//     "/:id",
//     async ({ params: { id }, tenantId, set }) => {
//       const log = await prisma.auditLog.findFirst({
//         // 🚨 ပြင်ပ Tenant မှ မိမိလုပ်ငန်း၏ စနစ်မှတ်တမ်းများကို လှမ်းဖတ်ခြင်းမှ ရာနှုန်းပြည့် ကာကွယ်ရန်
//         where: { id, tenantId },
//         include: {
//           user: {
//             select: { id: true, name: true, email: true, role: true },
//           },
//         },
//       });

//       if (!log) {
//         set.status = 404;
//         return {
//           success: false,
//           message: "Audit log entry not found or access denied.",
//         };
//       }

//       return { success: true, log };
//     },
//     { params: t.Object({ id: t.String() }) },
//   )

//   /**
//    * 3. POST: SYSTEM INTERNALS/CUSTOM APP EVENTS AUDIT LOGGING
//    * (စနစ်အတွင်း သီးခြား Activity များကို Manual Log သိမ်းဆည်းရန်အတွက်သာ)
//    */
//   .post(
//     "/",
//     async ({ body, tenantId, userId, request, set }) => {
//       // HTTP Headers ထဲကနေ Client ရဲ့ IP နဲ့ Browser User Agent ကို အလိုအလျောက် ဖမ်းယူခြင်း
//       const ipAddress = request.headers.get("x-forwarded-for") || "127.0.0.1";
//       const userAgent =
//         request.headers.get("user-agent") || "Unknown System Agent";

//       const log = await prisma.auditLog.create({
//         data: {
//           tenantId,
//           userId: body.userId || userId, // Body တွင်မပါပါက လက်ရှိ Request ခေါ်သော Operator ID အား သုံးမည်
//           action: body.action as AuditAction,
//           entity: body.entity.trim(),
//           entityId: body.entityId,
//           oldData: body.oldData
//             ? JSON.parse(JSON.stringify(body.oldData))
//             : null,
//           newData: body.newData
//             ? JSON.parse(JSON.stringify(body.newData))
//             : null,
//           changes: body.changes
//             ? JSON.parse(JSON.stringify(body.changes))
//             : null,
//           ipAddress: body.ipAddress || ipAddress,
//           userAgent: body.userAgent || userAgent,
//         },
//       });

//       set.status = 201;
//       return {
//         success: true,
//         message: "Security audit trail registered successfully.",
//         logId: log.id,
//       };
//     },
//     {
//       body: t.Object({
//         userId: t.Optional(t.String()),
//         action: t.String(), // Schema AuditAction Enum Mapping (CREATE, UPDATE, DELETE, etc.)
//         entity: t.String({ minLength: 1 }),
//         entityId: t.String({ minLength: 1 }),
//         oldData: t.Optional(t.Any()),
//         newData: t.Optional(t.Any()),
//         changes: t.Optional(t.Any()),
//         ipAddress: t.Optional(t.String()),
//         userAgent: t.Optional(t.String()),
//       }),
//     },
//   );
