import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";
import { tenantAuthMiddleware } from "../../middlewares/tenantAuthMiddleware";
import { notificationTypeSchema } from "../lib/schemas";

export const notificationRoutes = new Elysia({
  prefix: "/notifications",
})
  .use(tenantAuthMiddleware)

  /**
   * 1. GET ALL NOTIFICATIONS (Tenant & User Isolated)
   */
  .get("/", async ({ tenantId, userId, query }) => {
    return prisma.notification.findMany({
      where: {
        tenantId,
        userId, // 💡 User မိမိကိုယ်တိုင်၏ Notification ကိုသာ မြင်ရမည်
        deletedAt: null,
        ...(query.isRead !== undefined
          ? { isRead: query.isRead === "true" }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      take: parseInt(query.limit as string) || 50,
    });
  })

  /**
   * 2. MARK ALL AS READ (Batch Action)
   */
  .patch("/read-all", async ({ tenantId, userId }) => {
    return prisma.notification.updateMany({
      where: { tenantId, userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
  })

  /**
   * 3. PATCH: READ SINGLE NOTIFICATION
   */
  .patch("/:id/read", async ({ params: { id }, tenantId, userId, set }) => {
    const updated = await prisma.notification.updateMany({
      where: { id, tenantId, userId }, // 💡 လုံခြုံရေး: မိမိပိုင်မှသာ ပြင်နိုင်မည်
      data: { isRead: true, readAt: new Date() },
    });

    if (updated.count === 0) {
      set.status = 404;
      return { success: false, message: "Notification not found" };
    }
    return { success: true };
  })

  /**
   * 4. POST: CREATE NOTIFICATION (For System/Internal Events)
   */
  .post(
    "/",
    async ({ body, tenantId, set }) => {
      const notification = await prisma.notification.create({
        data: {
          tenantId,
          userId: body.userId,
          type: body.type,
          title: body.title,
          message: body.message,
          metadata: body.metadata || {},
        },
      });
      set.status = 201;
      return { success: true, notification };
    },
    {
      body: t.Object({
        userId: t.String(),
        type: notificationTypeSchema,
        title: t.String(),
        message: t.String(),
        metadata: t.Optional(t.Any()),
      }),
    },
  )

  /**
   * 5. DELETE: SOFT DELETE
   */
  .delete("/:id", async ({ params: { id }, tenantId, userId }) => {
    await prisma.notification.updateMany({
      where: { id, tenantId, userId },
      data: { deletedAt: new Date() },
    });
    return { success: true, message: "Notification archived" };
  });

// import { Elysia, t } from "elysia";
// import { prisma } from "../lib/prisma";
// import { requireTenantId } from "../lib/tenant";
// import { notificationTypeSchema } from "../lib/schemas";

// export const notificationRoutes = new Elysia({
//   prefix: "/notifications",
// })
//   .get("/", async ({ query, set }) => {
//     const tenantId = requireTenantId({ query, set });
//     if (!tenantId) return { message: "tenantId is required" };

//     return prisma.notification.findMany({
//       where: {
//         tenantId,
//         ...(query.userId ? { userId: query.userId } : {}),
//         isRead:
//           query.isRead === "true"
//             ? true
//             : query.isRead === "false"
//               ? false
//               : undefined,
//       },
//       orderBy: { createdAt: "desc" },
//     });
//   })
//   .get("/:id", async ({ params, set }) => {
//     const notification = await prisma.notification.findUnique({
//       where: { id: params.id },
//     });
//     if (!notification) {
//       set.status = 404;
//       return { message: "Notification not found" };
//     }
//     return notification;
//   })
//   .post(
//     "/",
//     async ({ body, set }) => {
//       set.status = 201;
//       return prisma.notification.create({
//         data: {
//           tenantId: body.tenantId,
//           userId: body.userId,
//           type: body.type,
//           title: body.title,
//           message: body.message,
//           metadata: body.metadata,
//         },
//       });
//     },
//     {
//       body: t.Object({
//         tenantId: t.String(),
//         userId: t.String(),
//         type: notificationTypeSchema,
//         title: t.String(),
//         message: t.String(),
//         metadata: t.Optional(t.Any()),
//       }),
//     },
//   )
//   .patch("/:id/read", async ({ params }) => {
//     return prisma.notification.update({
//       where: { id: params.id },
//       data: { isRead: true },
//     });
//   })
//   .delete("/:id", async ({ params }) => {
//     return prisma.notification.delete({ where: { id: params.id } });
//   });
