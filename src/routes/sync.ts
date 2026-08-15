// routes/sync.ts
import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";
import { tenantAuthMiddleware } from "../../middlewares/tenantAuthMiddleware";

export const syncRoutes = new Elysia({ prefix: "/sync" })
  .use(tenantAuthMiddleware)

  // ── Pull orders modified after timestamp ──
  .get(
    "/orders",
    async ({ tenantId, query }) => {
      const since = query.since ? parseInt(query.since as string) : 0;
      const orders = await prisma.order.findMany({
        where: {
          tenantId,
          deletedAt: null,
          updatedAt: { gt: new Date(since) },
        },
        include: {
          items: true,
          customer: { select: { id: true, name: true } },
        },
        orderBy: { updatedAt: "asc" },
      });
      return orders.map((o: any) => ({
        ...o,
        lastModified: o.updatedAt.getTime(),
      }));
    },
    {
      query: t.Object({
        since: t.Optional(t.String()),
      }),
    },
  )

  // ── Pull products modified after timestamp ──
  .get(
    "/products",
    async ({ tenantId, query }) => {
      const since = query.since ? parseInt(query.since as string) : 0;
      const products = await prisma.product.findMany({
        where: {
          tenantId,
          deletedAt: null,
          updatedAt: { gt: new Date(since) },
        },
        include: {
          variants: true,
          category: true,
          brand: true,
          supplier: true,
        },
        orderBy: { updatedAt: "asc" },
      });
      return products.map((p: any) => ({
        ...p,
        lastModified: p.updatedAt.getTime(),
      }));
    },
    {
      query: t.Object({
        since: t.Optional(t.String()),
      }),
    },
  )

  // ── Pull customers modified after timestamp ──
  .get(
    "/customers",
    async ({ tenantId, query }) => {
      const since = query.since ? parseInt(query.since as string) : 0;
      const customers = await prisma.customer.findMany({
        where: {
          tenantId,
          deletedAt: null,
          updatedAt: { gt: new Date(since) },
        },
        orderBy: { updatedAt: "asc" },
      });
      return customers.map((c: any) => ({
        ...c,
        lastModified: c.updatedAt.getTime(),
      }));
    },
    {
      query: t.Object({
        since: t.Optional(t.String()),
      }),
    },
  )

  // ── Pull inventory modified after timestamp ──
  .get(
    "/inventory",
    async ({ tenantId, query }) => {
      const since = query.since ? parseInt(query.since as string) : 0;
      const inventory = await prisma.inventory.findMany({
        where: {
          tenantId,
          updatedAt: { gt: new Date(since) },
        },
        include: {
          product: true,
          variant: true,
          store: true,
        },
        orderBy: { updatedAt: "asc" },
      });
      return inventory.map((i: any) => ({
        ...i,
        lastModified: i.updatedAt.getTime(),
      }));
    },
    {
      query: t.Object({
        since: t.Optional(t.String()),
      }),
    },
  );
