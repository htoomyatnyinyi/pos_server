import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";
import { tenantAuthMiddleware } from "../../middlewares/tenantAuthMiddleware";
import { requireRoles } from "../lib/security";

export const webhookRoutes = new Elysia({ prefix: "/webhooks" })
  .use(tenantAuthMiddleware)

  .get(
    "/",
    async ({ tenantId, query }) => {
      const page = query.page ? parseInt(query.page as string) : 1;
      const limit = query.limit ? parseInt(query.limit as string) : 20;
      const skip = (page - 1) * limit;

      const whereCondition: any = { tenantId };
      const webhooks = await prisma.webhook.findMany({
        where: whereCondition,
        include: { deliveries: { take: 5, orderBy: { deliveredAt: "desc" } } },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      });

      return { success: true, webhooks };
    },
    {
      query: t.Optional(
        t.Object({
          page: t.Optional(t.String()),
          limit: t.Optional(t.String()),
          all: t.Optional(t.String()),
        }),
      ),
    },
  )

  .get(
    "/:id",
    async ({ params: { id }, tenantId, set }) => {
      const webhook = await prisma.webhook.findFirst({
        where: { id, tenantId },
        include: { deliveries: { take: 20, orderBy: { deliveredAt: "desc" } } },
      });
      if (!webhook) {
        set.status = 404;
        return { success: false, message: "Webhook not found." };
      }
      return { success: true, webhook };
    },
    { params: t.Object({ id: t.String() }) },
  )

  .post(
    "/",
    async ({ body, tenantId, userId, role, set }) => {
      requireRoles(role, ["ADMIN", "MANAGER", "SUPER_ADMIN"], set);

      const webhook = await prisma.$transaction(async (tx: any) => {
        const created = await tx.webhook.create({
          data: {
            tenantId,
            name: body.name.trim(),
            url: body.url.trim(),
            events: body.events,
            secret: body.secret,
            isActive: true,
          },
        });
        await tx.auditLog.create({
          data: {
            tenantId,
            userId,
            action: "CREATE",
            entity: "Webhook",
            entityId: created.id,
            newData: JSON.parse(JSON.stringify(created)),
          },
        });
        return created;
      });

      set.status = 201;
      return {
        success: true,
        message: "Webhook created successfully.",
        webhook,
      };
    },
    {
      body: t.Object({
        name: t.String({ minLength: 2 }),
        url: t.String({ minLength: 10 }),
        events: t.Array(t.String(), { minItems: 1 }),
        secret: t.Optional(t.String()),
      }),
    },
  )

  .put(
    "/:id",
    async ({ params: { id }, body, tenantId, userId, role, set }) => {
      requireRoles(role, ["ADMIN", "MANAGER", "SUPER_ADMIN"], set);

      const current = await prisma.webhook.findFirst({
        where: { id, tenantId },
      });
      if (!current) {
        set.status = 404;
        return { success: false, message: "Webhook not found." };
      }

      const updated = await prisma.webhook.update({
        where: { id },
        data: {
          name: body.name?.trim(),
          url: body.url?.trim(),
          events: body.events,
          isActive: body.isActive,
        },
      });

      await prisma.auditLog.create({
        data: {
          tenantId,
          userId,
          action: "UPDATE",
          entity: "Webhook",
          entityId: id,
          oldData: JSON.parse(JSON.stringify(current)),
          newData: JSON.parse(JSON.stringify(updated)),
        },
      });

      return {
        success: true,
        message: "Webhook updated successfully.",
        webhook: updated,
      };
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Partial(
        t.Object({
          name: t.Optional(t.String()),
          url: t.Optional(t.String()),
          events: t.Optional(t.Array(t.String())),
          isActive: t.Optional(t.Boolean()),
        }),
      ),
    },
  )

  .delete(
    "/:id",
    async ({ params: { id }, tenantId, userId, role, set }) => {
      requireRoles(role, ["ADMIN", "MANAGER", "SUPER_ADMIN"], set);

      const webhook = await prisma.webhook.findFirst({
        where: { id, tenantId },
      });
      if (!webhook) {
        set.status = 404;
        return { success: false, message: "Webhook not found." };
      }

      await prisma.$transaction(async (tx: any) => {
        await tx.webhook.delete({ where: { id } });
        await tx.auditLog.create({
          data: {
            tenantId,
            userId,
            action: "DELETE",
            entity: "Webhook",
            entityId: id,
            oldData: JSON.parse(JSON.stringify(webhook)),
          },
        });
      });

      return { success: true, message: "Webhook deleted successfully." };
    },
    { params: t.Object({ id: t.String() }) },
  );
