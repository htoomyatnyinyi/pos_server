import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";
import { tenantAuthMiddleware } from "../../middlewares/tenantAuthMiddleware";
import { requireRoles } from "../lib/security";

export const notificationRoutes = new Elysia({ prefix: "/notifications" })
  .use(tenantAuthMiddleware)

  .get(
    "/",
    async ({ tenantId, userId, query }) => {
      const page = query.page ? parseInt(query.page as string) : 1;
      const limit = query.limit ? parseInt(query.limit as string) : 20;
      const skip = (page - 1) * limit;

      const whereCondition: any = { tenantId, userId };
      if (query.isRead !== undefined) {
        whereCondition.isRead = query.isRead === "true";
      }
      if (query.type) whereCondition.type = query.type;
      if (query.since) {
        whereCondition.createdAt = { gte: new Date(query.since as string) };
      }

      const [total, notifications] = await prisma.$transaction([
        prisma.notification.count({ where: whereCondition }),
        prisma.notification.findMany({
          where: whereCondition,
          orderBy: { createdAt: "desc" },
          skip,
          take: limit,
        }),
      ]);

      return {
        success: true,
        meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
        notifications,
      };
    },
    {
      query: t.Optional(
        t.Object({
          page: t.Optional(t.String()),
          limit: t.Optional(t.String()),
          isRead: t.Optional(t.String()),
          type: t.Optional(t.String()),
          since: t.Optional(t.String()),
        }),
      ),
    },
  )

  .get("/unread-count", async ({ tenantId, userId }) => {
    const count = await prisma.notification.count({
      where: { tenantId, userId, isRead: false },
    });
    return { success: true, count };
  })

  .get(
    "/:id",
    async ({ params: { id }, tenantId, userId, set }) => {
      const notification = await prisma.notification.findFirst({
        where: { id, tenantId, userId },
      });
      if (!notification) {
        set.status = 404;
        return { success: false, message: "Notification not found." };
      }
      return { success: true, notification };
    },
    { params: t.Object({ id: t.String() }) },
  )

  .post(
    "/",
    async ({ body, tenantId, userId, role, set }) => {
      // Only admins can create notifications manually, or system can call this.
      requireRoles(role, ["ADMIN", "MANAGER", "SUPER_ADMIN"], set);

      // Validate target user belongs to tenant
      const targetUser = await prisma.user.findFirst({
        where: { id: body.userId, tenantId },
      });
      if (!targetUser) {
        set.status = 400;
        return { success: false, message: "User not found." };
      }

      const notification = await prisma.notification.create({
        data: {
          tenantId,
          userId: body.userId,
          type: body.type,
          title: body.title,
          message: body.message,
          metadata: body.metadata,
        },
      });

      set.status = 201;
      return {
        success: true,
        message: "Notification sent.",
        notification,
      };
    },
    {
      body: t.Object({
        userId: t.String({ minLength: 1 }),
        type: t.String(),
        title: t.String({ minLength: 1, maxLength: 200 }),
        message: t.String({ minLength: 1, maxLength: 2000 }),
        metadata: t.Optional(t.Any()),
      }),
    },
  )

  .patch("/read-all", async ({ tenantId, userId }) => {
    await prisma.notification.updateMany({
      where: { tenantId, userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    return { success: true, message: "All notifications marked as read." };
  })

  .patch(
    "/:id/read",
    async ({ params: { id }, tenantId, userId, set }) => {
      const notification = await prisma.notification.findFirst({
        where: { id, tenantId, userId },
      });
      if (!notification) {
        set.status = 404;
        return { success: false, message: "Notification not found." };
      }
      await prisma.notification.update({
        where: { id },
        data: { isRead: true, readAt: new Date() },
      });
      return { success: true, message: "Notification marked as read." };
    },
    { params: t.Object({ id: t.String() }) },
  )

  .delete(
    "/:id",
    async ({ params: { id }, tenantId, userId, role, set }) => {
      // Allow user to delete their own notifications, or admin can delete any.
      const notification = await prisma.notification.findFirst({
        where: { id, tenantId, userId },
      });
      if (!notification) {
        set.status = 404;
        return { success: false, message: "Notification not found." };
      }
      await prisma.notification.delete({ where: { id } });
      return { success: true, message: "Notification deleted." };
    },
    { params: t.Object({ id: t.String() }) },
  );

// import { Elysia, t } from "elysia";
// import type { NotificationType } from "@prisma/client";
// import { prisma } from "../lib/prisma";
// import {
//   buildUserNotificationWhere,
//   createNotification,
// } from "../lib/notifications";
// import { tenantAuthMiddleware } from "../../middlewares/tenantAuthMiddleware";
// import { notificationTypeSchema } from "../lib/schemas";

// const ADMIN_ROLES = new Set(["ADMIN", "MANAGER", "SUPER_ADMIN"]);

// const listQuerySchema = t.Optional(
//   t.Object({
//     page: t.Optional(t.String()),
//     limit: t.Optional(t.String()),
//     isRead: t.Optional(t.String()),
//     type: t.Optional(notificationTypeSchema),
//     since: t.Optional(t.String()),
//   }),
// );

// function parsePagination(query: {
//   page?: string;
//   limit?: string;
// }) {
//   const page = Math.max(1, parseInt(query.page ?? "1", 10) || 1);
//   const limit = Math.min(
//     100,
//     Math.max(1, parseInt(query.limit ?? "50", 10) || 50),
//   );

//   return { page, limit, skip: (page - 1) * limit };
// }

// function parseSince(since?: string) {
//   if (!since) return undefined;

//   const parsed = new Date(since);
//   if (Number.isNaN(parsed.getTime())) {
//     return null;
//   }

//   return parsed;
// }

// export const notificationRoutes = new Elysia({
//   prefix: "/notifications",
// })
//   .use(tenantAuthMiddleware)

//   /**
//    * 1. GET ALL NOTIFICATIONS (Tenant & User Isolated, Paginated)
//    */
//   .get(
//     "/",
//     async ({ tenantId, userId, query, set }) => {
//       const { page, limit, skip } = parsePagination(query);
//       const since = parseSince(query.since);

//       if (since === null) {
//         set.status = 400;
//         return {
//           success: false,
//           message: "Invalid 'since' query parameter. Use an ISO 8601 date.",
//         };
//       }

//       const whereCondition = {
//         ...buildUserNotificationWhere(tenantId, userId),
//         ...(query.isRead !== undefined
//           ? { isRead: query.isRead === "true" }
//           : {}),
//         ...(query.type ? { type: query.type as NotificationType } : {}),
//         ...(since ? { createdAt: { gte: since } } : {}),
//       };

//       const [total, notifications] = await prisma.$transaction([
//         prisma.notification.count({ where: whereCondition }),
//         prisma.notification.findMany({
//           where: whereCondition,
//           orderBy: { createdAt: "desc" },
//           skip,
//           take: limit,
//         }),
//       ]);

//       return {
//         success: true,
//         meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
//         notifications,
//       };
//     },
//     { query: listQuerySchema },
//   )

//   /**
//    * 2. GET UNREAD COUNT (Lightweight polling target)
//    */
//   .get("/unread-count", async ({ tenantId, userId }) => {
//     const count = await prisma.notification.count({
//       where: {
//         ...buildUserNotificationWhere(tenantId, userId),
//         isRead: false,
//       },
//     });

//     return { success: true, count };
//   })

//   /**
//    * 3. MARK ALL AS READ (Batch Action)
//    */
//   .patch("/read-all", async ({ tenantId, userId }) => {
//     const result = await prisma.notification.updateMany({
//       where: {
//         ...buildUserNotificationWhere(tenantId, userId),
//         isRead: false,
//       },
//       data: { isRead: true, readAt: new Date() },
//     });

//     return {
//       success: true,
//       message: "All notifications marked as read.",
//       count: result.count,
//     };
//   })

//   /**
//    * 4. GET SINGLE NOTIFICATION BY ID
//    */
//   .get(
//     "/:id",
//     async ({ params: { id }, tenantId, userId, set }) => {
//       const notification = await prisma.notification.findFirst({
//         where: {
//           id,
//           ...buildUserNotificationWhere(tenantId, userId),
//         },
//       });

//       if (!notification) {
//         set.status = 404;
//         return {
//           success: false,
//           message: "Notification not found or access denied.",
//         };
//       }

//       return { success: true, notification };
//     },
//     { params: t.Object({ id: t.String() }) },
//   )

//   /**
//    * 5. PATCH: READ SINGLE NOTIFICATION
//    */
//   .patch(
//     "/:id/read",
//     async ({ params: { id }, tenantId, userId, set }) => {
//       const updated = await prisma.notification.updateMany({
//         where: {
//           id,
//           ...buildUserNotificationWhere(tenantId, userId),
//         },
//         data: { isRead: true, readAt: new Date() },
//       });

//       if (updated.count === 0) {
//         set.status = 404;
//         return {
//           success: false,
//           message: "Notification not found or access denied.",
//         };
//       }

//       return { success: true, message: "Notification marked as read." };
//     },
//     { params: t.Object({ id: t.String() }) },
//   )

//   /**
//    * 6. POST: CREATE NOTIFICATION (Admin/System Events)
//    */
//   .post(
//     "/",
//     async ({ body, tenantId, role, set }) => {
//       if (!ADMIN_ROLES.has(role)) {
//         set.status = 403;
//         return {
//           success: false,
//           message: "Only admins and managers can create notifications.",
//         };
//       }

//       const targetUser = await prisma.user.findFirst({
//         where: {
//           id: body.userId,
//           tenantId,
//           deletedAt: null,
//           isActive: true,
//         },
//         select: { id: true },
//       });

//       if (!targetUser) {
//         set.status = 404;
//         return {
//           success: false,
//           message: "Target user not found in this tenant.",
//         };
//       }

//       const notification = await createNotification(prisma, {
//         tenantId,
//         userId: body.userId,
//         type: body.type,
//         title: body.title,
//         message: body.message,
//         metadata: body.metadata,
//       });

//       set.status = 201;
//       return {
//         success: true,
//         message: "Notification created successfully.",
//         notification,
//       };
//     },
//     {
//       body: t.Object({
//         userId: t.String({ minLength: 1 }),
//         type: notificationTypeSchema,
//         title: t.String({ minLength: 1, maxLength: 200 }),
//         message: t.String({ minLength: 1, maxLength: 2000 }),
//         metadata: t.Optional(t.Any()),
//       }),
//     },
//   )

//   /**
//    * 7. DELETE: SOFT DELETE
//    */
//   .delete(
//     "/:id",
//     async ({ params: { id }, tenantId, userId, set }) => {
//       const result = await prisma.notification.updateMany({
//         where: {
//           id,
//           ...buildUserNotificationWhere(tenantId, userId),
//         },
//         data: { deletedAt: new Date() },
//       });

//       if (result.count === 0) {
//         set.status = 404;
//         return {
//           success: false,
//           message: "Notification not found or access denied.",
//         };
//       }

//       return { success: true, message: "Notification archived." };
//     },
//     { params: t.Object({ id: t.String() }) },
//   );
