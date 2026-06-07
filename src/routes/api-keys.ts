import { Elysia, t } from "elysia";
import { randomBytes } from "crypto";
import { prisma } from "../lib/prisma";
import { requireTenantId } from "../lib/tenant";

function generateApiKey() {
  return `pk_${randomBytes(24).toString("hex")}`;
}

function generateApiSecret() {
  return `sk_${randomBytes(32).toString("hex")}`;
}

export const apiKeyRoutes = new Elysia({
  prefix: "/api-keys",
})
  .get("/", async ({ query, set }) => {
    const tenantId = requireTenantId({ query, set });
    if (!tenantId) return { message: "tenantId is required" };

    return prisma.apiKey.findMany({
      where: { tenantId, isActive: true },
      select: {
        id: true,
        name: true,
        key: true,
        permissions: true,
        lastUsedAt: true,
        expiresAt: true,
        isActive: true,
        createdAt: true,
        user: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  })
  .post(
    "/",
    async ({ body, set }) => {
      set.status = 201;
      return prisma.apiKey.create({
        data: {
          tenantId: body.tenantId,
          userId: body.userId,
          name: body.name,
          key: generateApiKey(),
          secret: generateApiSecret(),
          permissions: body.permissions ?? ["READ"],
          expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
        },
        select: {
          id: true,
          name: true,
          key: true,
          secret: true,
          permissions: true,
          expiresAt: true,
          createdAt: true,
        },
      });
    },
    {
      body: t.Object({
        tenantId: t.String(),
        userId: t.String(),
        name: t.String(),
        permissions: t.Optional(t.Array(t.String())),
        expiresAt: t.Optional(t.String()),
      }),
    },
  )
  .delete("/:id", async ({ params }) => {
    return prisma.apiKey.update({
      where: { id: params.id },
      data: { isActive: false },
    });
  });
