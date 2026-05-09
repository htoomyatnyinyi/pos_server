import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";

export const cartRoutes = new Elysia({
  prefix: "/cart",
})
  .get("/:userId", async ({ params }) => {
    return prisma.cart.findUnique({
      where: { userId: params.userId },
      include: {
        items: {
          include: {
            product: true,
          },
        },
      },
    });
  })
  .post(
    "/items",
    async ({ body }) => {
      // Ensure cart exists
      let cart = await prisma.cart.findUnique({
        where: { userId: body.userId },
      });

      if (!cart) {
        cart = await prisma.cart.create({
          data: { userId: body.userId },
        });
      }

      // Add or update item
      const existingItem = await prisma.cartItem.findFirst({
        where: {
          cartId: cart.id,
          productId: body.productId,
        },
      });

      if (existingItem) {
        return prisma.cartItem.update({
          where: { id: existingItem.id },
          data: { quantity: existingItem.quantity + body.quantity },
        });
      }

      return prisma.cartItem.create({
        data: {
          cartId: cart.id,
          productId: body.productId,
          quantity: body.quantity,
        },
      });
    },
    {
      body: t.Object({
        userId: t.String(),
        productId: t.String(),
        quantity: t.Number(),
      }),
    },
  )
  .delete("/items/:id", async ({ params }) => {
    return prisma.cartItem.delete({
      where: { id: params.id },
    });
  });
