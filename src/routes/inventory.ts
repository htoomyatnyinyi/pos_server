import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";

export const inventoryRoutes = new Elysia({
  prefix: "/inventory",
})
  .group("/movements", (app) =>
    app
      .get("/", async () => {
        return prisma.stockMovement.findMany({
          include: {
            product: true,
            user: true,
          },
          orderBy: {
            createdAt: "desc",
          },
        });
      })
      .post(
        "/",
        async ({ body }) => {
          // 1. Get current stock
          const product = await prisma.product.findUnique({
            where: { id: body.productId },
          });

          if (!product) throw new Error("Product not found");

          const previousStock = product.stockQuantity;
          const newStock = previousStock + body.quantity;

          // 2. Create movement and update product stock in a transaction
          return prisma.$transaction(async (tx) => {
            const movement = await tx.stockMovement.create({
              data: {
                productId: body.productId,
                quantity: body.quantity,
                previousStock,
                newStock,
                type: body.type,
                referenceId: body.referenceId,
                referenceType: body.referenceType,
                reason: body.reason,
                userId: body.userId,
              },
            });

            await tx.product.update({
              where: { id: body.productId },
              data: {
                stockQuantity: newStock,
              },
            });

            return movement;
          });
        },
        {
          body: t.Object({
            productId: t.String(),
            quantity: t.Integer(),
            type: t.Enum({
              PURCHASE: "PURCHASE",
              SALE: "SALE",
              RETURN_IN: "RETURN_IN",
              RETURN_OUT: "RETURN_OUT",
              ADJUSTMENT: "ADJUSTMENT",
              DAMAGE: "DAMAGE",
              EXPIRED: "EXPIRED",
              TRANSFER_IN: "TRANSFER_IN",
              TRANSFER_OUT: "TRANSFER_OUT",
              OPENING_STOCK: "OPENING_STOCK",
              COUNTING: "COUNTING",
            }),
            referenceId: t.String(),
            referenceType: t.String(),
            reason: t.Optional(t.String()),
            userId: t.String(),
          }),
        },
      ),
  )
  .group("/counts", (app) =>
    app
      .get("/", async () => {
        return prisma.inventoryCount.findMany({
          include: {
            store: true,
            created: true,
            approved: true,
          },
          orderBy: {
            createdAt: "desc",
          },
        });
      })
      .post(
        "/",
        async ({ body }) => {
          const countNumber = `CNT-${Date.now()}`;
          return prisma.inventoryCount.create({
            data: {
              countNumber,
              storeId: body.storeId,
              scheduledDate: new Date(body.scheduledDate),
              createdBy: body.userId,
              items: {
                create: body.items.map((item) => ({
                  productId: item.productId,
                  systemQuantity: item.systemQuantity,
                  countedQuantity: item.countedQuantity,
                  variance: item.countedQuantity - item.systemQuantity,
                  reason: item.reason,
                })),
              },
            },
            include: {
              items: true,
            },
          });
        },
        {
          body: t.Object({
            storeId: t.Optional(t.String()),
            scheduledDate: t.String(),
            userId: t.String(),
            items: t.Array(
              t.Object({
                productId: t.String(),
                systemQuantity: t.Integer(),
                countedQuantity: t.Integer(),
                reason: t.Optional(t.String()),
              }),
            ),
          }),
        },
      ),
  );
