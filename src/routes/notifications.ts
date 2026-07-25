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
