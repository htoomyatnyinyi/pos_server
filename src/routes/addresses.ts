import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";

export const addressRoutes = new Elysia({
  prefix: "/addresses",
})
  .get("/:userId", async ({ params }) => {
    return prisma.address.findMany({
      where: { userId: params.userId },
    });
  })
  .post(
    "/",
    async ({ body }) => {
      // If setting as default, unset previous default
      if (body.isDefault) {
        await prisma.address.updateMany({
          where: { userId: body.userId, isDefault: true },
          data: { isDefault: false },
        });
      }

      return prisma.address.create({
        data: body,
      });
    },
    {
      body: t.Object({
        userId: t.String(),
        street: t.String(),
        city: t.String(),
        state: t.Optional(t.String()),
        country: t.String(),
        postalCode: t.String(),
        isDefault: t.Boolean(),
      }),
    },
  )
  .delete("/:id", async ({ params }) => {
    return prisma.address.delete({
      where: { id: params.id },
    });
  });
