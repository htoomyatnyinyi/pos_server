import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";

export const productRoutes = new Elysia({
  prefix: "/products",
})
  .get("/", async () => {
    return prisma.product.findMany({
      orderBy: {
        createdAt: "desc",
      },
    });
  })
  .get("/:id", async ({ params }) => {
    return prisma.product.findUnique({
      where: {
        id: params.id,
      },
    });
  })
  .post(
    "/",
    async ({ body }) => {
      return prisma.product.create({
        data: {
          name: body.name,
          price: body.price,
          stock: body.stock,
          imageUrl: body.image, // Map image to imageUrl
        },
      });
    },
    {
      body: t.Object({
        name: t.String(),
        price: t.Number(),
        stock: t.Number(),
        image: t.Optional(t.String()),
      }),
    },
  );
