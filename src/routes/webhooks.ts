import { Elysia, t } from "elysia";
import { randomBytes } from "crypto";
import { prisma } from "../lib/prisma";
import { requireTenantId } from "../lib/tenant";

export const webhookRoutes = new Elysia({
  prefix: "/webhooks",
})
  .get("/", async ({ query, set }) => {
    const tenantId = requireTenantId({ query, set });
    if (!tenantId) return { message: "tenantId is required" };

    return prisma.webhook.findMany({
      where: { tenantId, isActive: true },
      orderBy: { createdAt: "desc" },
    });
  })
  .get("/:id", async ({ params, set }) => {
    const webhook = await prisma.webhook.findUnique({
      where: { id: params.id },
      include: {
        deliveries: { take: 20, orderBy: { deliveredAt: "desc" } },
      },
    });
    if (!webhook) {
      set.status = 404;
      return { message: "Webhook not found" };
    }
    return webhook;
  })
  .post(
    "/",
    async ({ body, set }) => {
      set.status = 201;
      return prisma.webhook.create({
        data: {
          tenantId: body.tenantId,
          name: body.name,
          url: body.url,
          events: body.events,
          secret: body.secret ?? randomBytes(16).toString("hex"),
        },
      });
    },
    {
      body: t.Object({
        tenantId: t.String(),
        name: t.String(),
        url: t.String(),
        events: t.Array(t.String()),
        secret: t.Optional(t.String()),
      }),
    },
  )
  .put(
    "/:id",
    async ({ params, body }) => {
      return prisma.webhook.update({
        where: { id: params.id },
        data: body,
      });
    },
    {
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
  .delete("/:id", async ({ params }) => {
    return prisma.webhook.update({
      where: { id: params.id },
      data: { isActive: false },
    });
  });
