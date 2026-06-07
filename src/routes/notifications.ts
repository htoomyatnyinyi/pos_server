import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";
import { requireTenantId } from "../lib/tenant";
import { notificationTypeSchema } from "../lib/schemas";

export const notificationRoutes = new Elysia({
  prefix: "/notifications",
})
  .get("/", async ({ query, set }) => {
    const tenantId = requireTenantId({ query, set });
    if (!tenantId) return { message: "tenantId is required" };

    return prisma.notification.findMany({
      where: {
        tenantId,
        ...(query.userId ? { userId: query.userId } : {}),
        isRead:
          query.isRead === "true"
            ? true
            : query.isRead === "false"
              ? false
              : undefined,
      },
      orderBy: { createdAt: "desc" },
    });
  })
  .get("/:id", async ({ params, set }) => {
    const notification = await prisma.notification.findUnique({
      where: { id: params.id },
    });
    if (!notification) {
      set.status = 404;
      return { message: "Notification not found" };
    }
    return notification;
  })
  .post(
    "/",
    async ({ body, set }) => {
      set.status = 201;
      return prisma.notification.create({
        data: {
          tenantId: body.tenantId,
          userId: body.userId,
          type: body.type,
          title: body.title,
          message: body.message,
          metadata: body.metadata,
        },
      });
    },
    {
      body: t.Object({
        tenantId: t.String(),
        userId: t.String(),
        type: notificationTypeSchema,
        title: t.String(),
        message: t.String(),
        metadata: t.Optional(t.Any()),
      }),
    },
  )
  .patch("/:id/read", async ({ params }) => {
    return prisma.notification.update({
      where: { id: params.id },
      data: { isRead: true },
    });
  })
  .delete("/:id", async ({ params }) => {
    return prisma.notification.delete({ where: { id: params.id } });
  });
