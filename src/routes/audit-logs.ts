import { Elysia, t } from "elysia";
import { AuditAction } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { requireTenantId } from "../lib/tenant";
import { auditActionSchema } from "../lib/schemas";

export const auditLogRoutes = new Elysia({
  prefix: "/audit-logs",
})
  .get("/", async ({ query, set }) => {
    const tenantId = requireTenantId({ query, set });
    if (!tenantId) return { message: "tenantId is required" };

    return prisma.auditLog.findMany({
      where: {
        tenantId,
        ...(query.userId ? { userId: query.userId } : {}),
        ...(query.entity ? { entity: query.entity } : {}),
        ...(query.action ? { action: query.action as AuditAction } : {}),
      },
      include: { user: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
      take: query.limit ? parseInt(query.limit) : 50,
      skip: query.offset ? parseInt(query.offset) : 0,
    });
  })
  .get("/:id", async ({ params, set }) => {
    const log = await prisma.auditLog.findUnique({
      where: { id: params.id },
      include: { user: true },
    });
    if (!log) {
      set.status = 404;
      return { message: "Audit log not found" };
    }
    return log;
  })
  .post(
    "/",
    async ({ body, set }) => {
      set.status = 201;
      return prisma.auditLog.create({
        data: {
          tenantId: body.tenantId,
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
        tenantId: t.String(),
        userId: t.String(),
        action: auditActionSchema,
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
