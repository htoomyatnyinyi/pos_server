import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";

export const orderRoutes = new Elysia({
  prefix: "/orders",
})
  .get("/", async () => {
    return prisma.order.findMany({
      include: {
        items: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });
  })
  .post(
    "/",
    async ({ body, set }) => {
      // In a real app, userId would come from the JWT token
      // For now, we'll require it in the body or use a dummy one if needed
      if (!body.userId) {
        set.status = 400;
        return { error: "userId is required" };
      }

      // Fetch products to get names for the snapshot
      const productIds = body.items.map((i: any) => i.id);
      const products = await prisma.product.findMany({
        where: { id: { in: productIds } },
      });

      const order = await prisma.order.create({
        data: {
          totalAmount: body.total,
          userId: body.userId,
          status: "PENDING",
          items: {
            create: body.items.map((item: any) => {
              const product = products.find((p) => p.id === item.id);
              return {
                productId: item.id,
                quantity: item.qty,
                price: item.price,
                productName: product?.name || "Unknown Product",
              };
            }),
          },
        },
        include: {
          items: true,
        },
      });

      // decrease stock
      for (const item of body.items) {
        await prisma.product.update({
          where: {
            id: item.id,
          },
          data: {
            stock: {
              decrement: item.qty,
            },
          },
        });
      }

      return order;
    },
    {
      body: t.Object({
        total: t.Number(),
        userId: t.Optional(t.String()), // Temporary, should be from auth
        items: t.Array(
          t.Object({
            id: t.String(),
            qty: t.Number(),
            price: t.Number(),
          }),
        ),
      }),
    },
  );
