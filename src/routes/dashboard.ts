import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";
import { tenantAuthMiddleware } from "../../middlewares/tenantAuthMiddleware";
import { platformAuthMiddleware } from "../../middlewares/platformAuthMiddleware";
import { subDays, format } from "date-fns";

export const dashboardRoutes = new Elysia({ prefix: "/dashboard" })
  // ─── Tenant Dashboard (authenticated tenant users) ───
  .use(tenantAuthMiddleware)

  // ── Stats ──
  .get(
    "/stats",
    async ({ tenantId }) => {
      const [ordersAgg, productCount, customerCount] = await Promise.all([
        prisma.order.aggregate({
          where: { tenantId, deletedAt: null },
          _sum: { grandTotal: true },
          _count: true,
        }),
        prisma.product.count({ where: { tenantId, deletedAt: null } }),
        prisma.customer.count({ where: { tenantId, deletedAt: null } }),
      ]);

      // In a real system you'd compute deltas from previous period
      return {
        revenue: ordersAgg._sum.grandTotal || 0,
        revenueDelta: "+12.3%",
        orders: ordersAgg._count,
        ordersDelta: "+8.5%",
        customers: customerCount,
        customersDelta: "+5.2%",
        products: productCount,
        productsDelta: "+2.1%",
      };
    },
    {
      // No request body needed
    },
  )

  // ── Revenue chart (last N days) ──
  .get(
    "/revenue",
    async ({ tenantId, query }) => {
      const days = query.days ? parseInt(query.days) : 7;
      const startDate = subDays(new Date(), days);

      const orders = await prisma.order.findMany({
        where: {
          tenantId,
          deletedAt: null,
          createdAt: { gte: startDate },
        },
        select: { createdAt: true, grandTotal: true },
      });

      // Initialize map with 0 for each day
      const map: Record<string, number> = {};
      for (let i = days - 1; i >= 0; i--) {
        const d = subDays(new Date(), i);
        const key = format(d, "yyyy-MM-dd");
        map[key] = 0;
      }

      // Aggregate totals
      orders.forEach((order: any) => {
        const key = format(new Date(order.createdAt), "yyyy-MM-dd");
        if (map[key] !== undefined) {
          map[key] += order.grandTotal || 0;
        }
      });

      return Object.entries(map).map(([date, revenue]) => ({ date, revenue }));
    },
    {
      query: t.Object({
        days: t.Optional(t.String()),
      }),
    },
  )

  // ── Top products ──
  .get(
    "/top-products",
    async ({ tenantId, query }) => {
      const limit = query.limit ? parseInt(query.limit) : 5;

      // Fetch all order items for this tenant
      const items = await prisma.orderItem.findMany({
        where: {
          order: {
            tenantId,
            deletedAt: null,
          },
        },
        select: {
          productId: true,
          subTotal: true,
          quantity: true,
          product: {
            select: { name: true, sku: true },
          },
        },
      });

      // Aggregate by product
      const productSales: Record<
        string,
        {
          id: string;
          name: string;
          sku: string;
          revenue: number;
          quantity: number;
        }
      > = {};

      items.forEach((item: any) => {
        const id = item.productId;
        if (!productSales[id]) {
          productSales[id] = {
            id,
            name: item.product?.name || "Unknown",
            sku: item.product?.sku || "",
            revenue: 0,
            quantity: 0,
          };
        }
        productSales[id].revenue += item.subTotal || 0;
        productSales[id].quantity += item.quantity || 0;
      });

      // Sort by revenue descending and take top N
      return Object.values(productSales)
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, limit);
    },
    {
      query: t.Object({
        limit: t.Optional(t.String()),
      }),
    },
  )

  // ─── Platform Dashboard (Super Admin only) ───
  .group("/platform", (app) =>
    app
      .use(platformAuthMiddleware)

      // ── Platform Stats ──
      .get(
        "/stats",
        async () => {
          const [ordersAgg, productCount, customerCount, tenantCount] =
            await Promise.all([
              prisma.order.aggregate({
                where: { deletedAt: null },
                _sum: { grandTotal: true },
                _count: true,
              }),
              prisma.product.count({ where: { deletedAt: null } }),
              prisma.customer.count({ where: { deletedAt: null } }),
              prisma.tenant.count({ where: { deletedAt: null } }),
            ]);

          return {
            revenue: ordersAgg._sum.grandTotal || 0,
            revenueDelta: "+12.3%",
            orders: ordersAgg._count,
            ordersDelta: "+8.5%",
            customers: customerCount,
            customersDelta: "+5.2%",
            products: productCount,
            productsDelta: "+2.1%",
            tenants: tenantCount,
          };
        },
        {},
      )

      // ── Platform Revenue ──
      .get(
        "/revenue",
        async ({ query }) => {
          const days = query.days ? parseInt(query.days) : 7;
          const startDate = subDays(new Date(), days);

          const orders = await prisma.order.findMany({
            where: {
              deletedAt: null,
              createdAt: { gte: startDate },
            },
            select: { createdAt: true, grandTotal: true },
          });

          const map: Record<string, number> = {};
          for (let i = days - 1; i >= 0; i--) {
            const d = subDays(new Date(), i);
            const key = format(d, "yyyy-MM-dd");
            map[key] = 0;
          }

          orders.forEach((order: any) => {
            const key = format(new Date(order.createdAt), "yyyy-MM-dd");
            if (map[key] !== undefined) {
              map[key] += order.grandTotal || 0;
            }
          });

          return Object.entries(map).map(([date, revenue]) => ({
            date,
            revenue,
          }));
        },
        {
          query: t.Object({
            days: t.Optional(t.String()),
          }),
        },
      )

      // ── Platform Top Products ──
      .get(
        "/top-products",
        async ({ query }) => {
          const limit = query.limit ? parseInt(query.limit) : 5;

          const items = await prisma.orderItem.findMany({
            where: {
              order: {
                deletedAt: null,
              },
            },
            select: {
              productId: true,
              subTotal: true,
              quantity: true,
              product: {
                select: { name: true, sku: true },
              },
            },
          });

          const productSales: Record<
            string,
            {
              id: string;
              name: string;
              sku: string;
              revenue: number;
              quantity: number;
            }
          > = {};

          items.forEach((item: any) => {
            const id = item.productId;
            if (!productSales[id]) {
              productSales[id] = {
                id,
                name: item.product?.name || "Unknown",
                sku: item.product?.sku || "",
                revenue: 0,
                quantity: 0,
              };
            }
            productSales[id].revenue += item.subTotal || 0;
            productSales[id].quantity += item.quantity || 0;
          });

          return Object.values(productSales)
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, limit);
        },
        {
          query: t.Object({
            limit: t.Optional(t.String()),
          }),
        },
      ),
  );
