import { Elysia, t } from "elysia";
import { randomBytes, createHash } from "crypto";
import { prisma } from "../lib/prisma";
import { tenantAuthMiddleware } from "../../middlewares/tenantAuthMiddleware";

// Helper Functions
const generateApiKey = () => `pk_${randomBytes(24).toString("hex")}`;
const generateApiSecret = () => `sk_${randomBytes(32).toString("hex")}`;
const hashSecret = (secret: string) =>
  createHash("sha256").update(secret).digest("hex");

export const apiKeyRoutes = new Elysia({
  prefix: "/api-keys",
})
  .use(tenantAuthMiddleware)

  /**
   * 1. GET ALL API KEYS (Tenant Isolated)
   */
  .get("/", async ({ tenantId }) => {
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
        user: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  })

  /**
   * 2. POST: CREATE NEW API KEY
   */
  .post(
    "/",
    async ({ body, tenantId, userId: creatorId, set }) => {
      const rawSecret = generateApiSecret();
      const hashedSecret = hashSecret(rawSecret);

      const apiKey = await prisma.$transaction(async (tx) => {
        const created = await tx.apiKey.create({
          data: {
            tenantId,
            userId: body.userId,
            name: body.name.trim(),
            key: generateApiKey(),
            secret: hashedSecret, // 💡 Secret ကို Hash လုပ်ပြီးမှ သိမ်းခြင်း
            permissions: body.permissions ?? ["READ"],
            expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
          },
        });

        await tx.auditLog.create({
          data: {
            tenantId,
            userId: creatorId,
            action: "CREATE",
            entity: "ApiKey",
            entityId: created.id,
            newData: { name: created.name, permissions: created.permissions },
          },
        });

        return { ...created, secret: rawSecret }; // 💡 Secret ကို တစ်ကြိမ်သာ ပြသခြင်း
      });

      set.status = 201;
      return { success: true, apiKey };
    },
    {
      body: t.Object({
        userId: t.String(),
        name: t.String(),
        permissions: t.Optional(t.Array(t.String())),
        expiresAt: t.Optional(t.String()),
      }),
    },
  )

  /**
   * 3. DELETE: REVOKE API KEY
   */
  .delete(
    "/:id",
    async ({ params: { id }, tenantId, userId, set }) => {
      const apiKey = await prisma.apiKey.findFirst({
        where: { id, tenantId, isActive: true },
      });

      if (!apiKey) {
        set.status = 404;
        return {
          success: false,
          message: "API Key not found or access denied.",
        };
      }

      await prisma.$transaction(async (tx) => {
        await tx.apiKey.update({
          where: { id },
          data: { isActive: false },
        });

        await tx.auditLog.create({
          data: {
            tenantId,
            userId,
            action: "DELETE",
            entity: "ApiKey",
            entityId: id,
            oldData: { name: apiKey.name },
          },
        });
      });

      return { success: true, message: "API Key revoked successfully." };
    },
    { params: t.Object({ id: t.String() }) },
  );

// import { Elysia, t } from "elysia";
// import { randomBytes } from "crypto";
// import { prisma } from "../lib/prisma";
// import { requireTenantId } from "../lib/tenant";

// function generateApiKey() {
//   return `pk_${randomBytes(24).toString("hex")}`;
// }

// function generateApiSecret() {
//   return `sk_${randomBytes(32).toString("hex")}`;
// }

// export const apiKeyRoutes = new Elysia({
//   prefix: "/api-keys",
// })
//   .get("/", async ({ query, set }) => {
//     const tenantId = requireTenantId({ query, set });
//     if (!tenantId) return { message: "tenantId is required" };

//     return prisma.apiKey.findMany({
//       where: { tenantId, isActive: true },
//       select: {
//         id: true,
//         name: true,
//         key: true,
//         permissions: true,
//         lastUsedAt: true,
//         expiresAt: true,
//         isActive: true,
//         createdAt: true,
//         user: { select: { id: true, name: true } },
//       },
//       orderBy: { createdAt: "desc" },
//     });
//   })
//   .post(
//     "/",
//     async ({ body, set }) => {
//       set.status = 201;
//       return prisma.apiKey.create({
//         data: {
//           tenantId: body.tenantId,
//           userId: body.userId,
//           name: body.name,
//           key: generateApiKey(),
//           secret: generateApiSecret(),
//           permissions: body.permissions ?? ["READ"],
//           expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
//         },
//         select: {
//           id: true,
//           name: true,
//           key: true,
//           secret: true,
//           permissions: true,
//           expiresAt: true,
//           createdAt: true,
//         },
//       });
//     },
//     {
//       body: t.Object({
//         tenantId: t.String(),
//         userId: t.String(),
//         name: t.String(),
//         permissions: t.Optional(t.Array(t.String())),
//         expiresAt: t.Optional(t.String()),
//       }),
//     },
//   )
//   .delete("/:id", async ({ params }) => {
//     return prisma.apiKey.update({
//       where: { id: params.id },
//       data: { isActive: false },
//     });
//   });
