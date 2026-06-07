import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";
import { requireTenantId } from "../lib/tenant";

export const cashRegisterRoutes = new Elysia({
  prefix: "/cash-registers",
})
  .get("/", async ({ query, set }) => {
    const tenantId = requireTenantId({ query, set });
    if (!tenantId) return { message: "tenantId is required" };

    return prisma.cashRegister.findMany({
      where: {
        tenantId,
        deletedAt: null,
        ...(query.storeId ? { storeId: query.storeId } : {}),
      },
      include: { store: true },
      orderBy: { createdAt: "desc" },
    });
  })
  .get("/:id", async ({ params, set }) => {
    const register = await prisma.cashRegister.findUnique({
      where: { id: params.id },
      include: { store: true, sessions: { take: 10, orderBy: { openedAt: "desc" } } },
    });
    if (!register) {
      set.status = 404;
      return { message: "Cash register not found" };
    }
    return register;
  })
  .post(
    "/",
    async ({ body, set }) => {
      set.status = 201;
      return prisma.cashRegister.create({
        data: {
          tenantId: body.tenantId,
          storeId: body.storeId,
          name: body.name,
          status: body.status || "CLOSED",
        },
      });
    },
    {
      body: t.Object({
        tenantId: t.String(),
        storeId: t.String(),
        name: t.String(),
        status: t.Optional(
          t.Enum({
            OPEN: "OPEN",
            CLOSED: "CLOSED",
            SUSPENDED: "SUSPENDED",
            MAINTENANCE: "MAINTENANCE",
          }),
        ),
      }),
    },
  )
  .put(
    "/:id",
    async ({ params, body }) => {
      return prisma.cashRegister.update({
        where: { id: params.id },
        data: body,
      });
    },
    {
      body: t.Partial(
        t.Object({
          name: t.Optional(t.String()),
          status: t.Optional(
            t.Enum({
              OPEN: "OPEN",
              CLOSED: "CLOSED",
              SUSPENDED: "SUSPENDED",
              MAINTENANCE: "MAINTENANCE",
            }),
          ),
        }),
      ),
    },
  )
  .delete("/:id", async ({ params }) => {
    return prisma.cashRegister.update({
      where: { id: params.id },
      data: { deletedAt: new Date(), status: "CLOSED" },
    });
  });
