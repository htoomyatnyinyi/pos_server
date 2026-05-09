import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";

export const notificationRoutes = new Elysia({
  prefix: "/notifications",
})
  .get("/", async ({ query }) => {
    return prisma.notification.findMany({
      where: {
        userId: query.userId,
        isRead: query.isRead === "true" ? true : query.isRead === "false" ? false : undefined,
      },
      orderBy: {
        createdAt: "desc",
      },
    });
  })
  .get("/:id", async ({ params }) => {
    const notification = await prisma.notification.findUnique({
      where: { id: params.id },
    });
    if (!notification) throw new Error("Notification not found");
    return notification;
  })
  .post(
    "/",
    async ({ body }) => {
      return prisma.notification.create({
        data: {
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
        userId: t.String(),
        type: t.String(),
        title: t.String(),
        message: t.String(),
        metadata: t.Optional(t.Any()),
      }),
    },
  )
  .patch(
    "/:id/read",
    async ({ params }) => {
      return prisma.notification.update({
        where: { id: params.id },
        data: {
          isRead: true,
        },
      });
    },
  )
  .delete("/:id", async ({ params }) => {
    return prisma.notification.delete({
      where: { id: params.id },
    });
  });
