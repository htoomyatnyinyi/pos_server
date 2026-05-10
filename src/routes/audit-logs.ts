import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";

export const auditLogRoutes = new Elysia({
  prefix: "/audit-logs",
})
  .get("/", async ({ query }) => {
    return prisma.auditLog.findMany({
      where: {
        userId: query.userId,
        entity: query.entity,
        action: query.action,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: query.limit ? parseInt(query.limit) : 50,
      skip: query.offset ? parseInt(query.offset) : 0,
    });
  })
  .get("/:id", async ({ params, set }) => {
    const log = await prisma.auditLog.findUnique({
      where: { id: params.id },
      include: {
        user: true,
      },
    });
    if (!log) { set.status = 404; return "Audit log not found"; }return log;
  })
  .post(
    "/",
    async ({ body, set }) => {
      set.status = 201;
      return prisma.auditLog.create({
        data: {
          userId: body.userId,
          action: body.action,
          entity: body.entity,
          entityId: body.entityId,
          oldData: body.oldData,
          newData: body.newData,
          changes: body.changes,
          ipAddress: body.ipAddress,
          userAgent: body.userAgent,
        },
      });
    },
    {
      body: t.Object({
        userId: t.String(),
        action: t.String(),
        entity: t.String(),
        entityId: t.String(),
        oldData: t.Optional(t.Any()),
        newData: t.Optional(t.Any()),
        changes: t.Optional(t.Any()),
        ipAddress: t.Optional(t.String()),
        userAgent: t.Optional(t.String()),
      }),
    },
  );
