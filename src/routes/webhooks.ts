import { Elysia, t } from "elysia";
import { randomBytes } from "crypto";
import { prisma } from "../lib/prisma";
import { tenantAuthMiddleware } from "../../middlewares/tenantAuthMiddleware";

export const webhookRoutes = new Elysia({
  prefix: "/webhooks",
})
  // 🔐 Multi-Tenant Authentication Middleware ချိတ်ဆက်ခြင်း
  .use(tenantAuthMiddleware)

  /**
   * 1. GET ALL WEBHOOK SUBSCRIPTIONS WITH TENANT ISOLATION & PAGINATION
   */
  .get(
    "/",
    async ({ tenantId, query }) => {
      const page = query.page ? parseInt(query.page as string) : 1;
      const limit = query.limit ? parseInt(query.limit as string) : 20;
      const skip = (page - 1) * limit;

      const whereCondition: any = {
        tenantId,
        // query.all ပါမှသာ ဖျက်ထား/ရပ်ဆိုင်းထားသည်များကိုပါ ပြမည်။ မပါပါက Active များသာ ပြမည်။
        ...(query.all === "true" ? {} : { isActive: true }),
      };

      const [total, webhooks] = await prisma.$transaction([
        prisma.webhook.count({ where: whereCondition }),
        prisma.webhook.findMany({
          where: whereCondition,
          orderBy: { createdAt: "desc" },
          skip,
          take: limit,
        }),
      ]);

      return {
        success: true,
        meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
        webhooks,
      };
    },
    {
      query: t.Optional(
        t.Object({
          page: t.Optional(t.String()),
          limit: t.Optional(t.String()),
          all: t.Optional(t.String()), // "true" ဖြစ်ပါက ယာယီပိတ်ထားသော Webhooks ပါပြမည်
        }),
      ),
    },
  )

  /**
   * 2. GET SINGLE WEBHOOK SUBSCRIPTION DETAIL WITH RECENT DELIVERIES
   */

  // ✅ ပြင်ဆင်ပြီးသား Type-safe ကုဒ်ဗားရှင်း
  .get(
    "/:id",
    async ({ params: { id }, tenantId, set }) => {
      const webhook = await prisma.webhook.findFirst({
        where: { id, tenantId },
        include: {
          deliveries: {
            take: 20,
            orderBy: { deliveredAt: "desc" },
            select: {
              id: true,
              event: true, // 💡 'eventType' နေရာတွင် 'event' ဟု ပြောင်းလဲလိုက်ပါ
              responseStatus: true,
              success: true,
              deliveredAt: true,
            },
          },
        },
      });

      if (!webhook) {
        set.status = 404;
        return {
          success: false,
          message: "Webhook subscription not found or access denied.",
        };
      }

      return { success: true, webhook };
    },
    { params: t.Object({ id: t.String() }) },
  )

  /**
   * 3. POST: REGISTER/CREATE NEW WEBHOOK ENDPOINT
   */
  .post(
    "/",
    async ({ body, tenantId, userId, set }) => {
      // Endpoint URL သင့်လျော်မှန်ကန်မှု ရှိမရှိ Validation စစ်ဆေးခြင်း
      try {
        const parsedUrl = new URL(body.url);
        if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
          throw new Error();
        }
      } catch {
        set.status = 400;
        return {
          success: false,
          message:
            "Invalid endpoint format. URL must start with http:// or https://",
        };
      }

      // စနစ်တကျ ကာကွယ်ရန် Secure HMAC Token အတွက် 64-character Hex String အား အလိုအလျောက် ထုတ်ပေးခြင်း
      const secureSecret = body.secret
        ? body.secret.trim()
        : randomBytes(32).toString("hex");

      const webhook = await prisma.$transaction(async (tx) => {
        const created = await tx.webhook.create({
          data: {
            tenantId,
            name: body.name.trim(),
            url: body.url.trim(),
            events: body.events.map((event) => event.trim().toLowerCase()), // Format ညှိခြင်း (e.g. order.created)
            secret: secureSecret,
            isActive: true,
          },
        });

        // Track Registrations inside Security Audit Logs
        await tx.auditLog.create({
          data: {
            tenantId,
            userId,
            action: "CREATE",
            entity: "Webhook",
            entityId: created.id,
            newData: {
              name: created.name,
              url: created.url,
              events: created.events,
            },
          },
        });

        return created;
      });

      set.status = 201;
      return {
        success: true,
        message: "Webhook subscription successfully registered.",
        webhook,
      };
    },
    {
      body: t.Object({
        name: t.String({ minLength: 2 }),
        url: t.String({ minLength: 10 }), // ဥပမာ - https://api.client.com/callback
        events: t.Array(t.String(), { minItems: 1 }), // အနည်းဆုံး Event ၁ ခု ရွေးချယ်ရမည်
        secret: t.Optional(t.String()),
      }),
    },
  )

  /**
   * 4. PUT: MODIFY WEBHOOK ENDPOINT DETAILS
   */
  .put(
    "/:id",
    async ({ params: { id }, body, tenantId, userId, set }) => {
      const currentWebhook = await prisma.webhook.findFirst({
        where: { id, tenantId },
      });

      if (!currentWebhook) {
        set.status = 404;
        return {
          success: false,
          message: "Webhook subscription profile not found or access denied.",
        };
      }

      const updatedWebhook = await prisma.$transaction(async (tx) => {
        const updated = await tx.webhook.update({
          where: { id },
          data: {
            name: body.name ? body.name.trim() : undefined,
            url: body.url ? body.url.trim() : undefined,
            events: body.events
              ? body.events.map((ev) => ev.trim().toLowerCase())
              : undefined,
            isActive: body.isActive,
          },
        });

        // Sync Trail inside Audit System
        await tx.auditLog.create({
          data: {
            tenantId,
            userId,
            action: "UPDATE",
            entity: "Webhook",
            entityId: id,
            oldData: {
              name: currentWebhook.name,
              url: currentWebhook.url,
              events: currentWebhook.events,
              isActive: currentWebhook.isActive,
            },
            newData: {
              name: updated.name,
              url: updated.url,
              events: updated.events,
              isActive: updated.isActive,
            },
          },
        });

        return updated;
      });

      return {
        success: true,
        message: "Webhook endpoint properties modified successfully.",
        webhook: updatedWebhook,
      };
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Partial(
        t.Object({
          name: t.Optional(t.String()),
          url: t.Optional(t.String()),
          events: t.Optional(t.Array(t.String())),
          isActive: t.Optional(t.Boolean()),
        }),
      ),
    },
  )

  /**
   * 5. DELETE: DEACTIVATE / SOFT-DELETE WEBHOOK
   */
  .delete(
    "/:id",
    async ({ params: { id }, tenantId, userId, set }) => {
      const webhook = await prisma.webhook.findFirst({
        where: { id, tenantId, isActive: true },
      });

      if (!webhook) {
        set.status = 404;
        return {
          success: false,
          message:
            "Active Webhook subscription not found or already deactivated.",
        };
      }

      await prisma.$transaction(async (tx) => {
        await tx.webhook.update({
          where: { id },
          data: { isActive: false },
        });

        // Audit Log Track
        await tx.auditLog.create({
          data: {
            tenantId,
            userId,
            action: "DELETE",
            entity: "Webhook",
            entityId: id,
            oldData: { name: webhook.name, url: webhook.url },
            newData: { isActive: false },
          },
        });
      });

      return {
        success: true,
        message:
          "Webhook listener subscription has been successfully archived.",
      };
    },
    { params: t.Object({ id: t.String() }) },
  );
// import { Elysia, t } from "elysia";
// import { randomBytes } from "crypto";
// import { prisma } from "../lib/prisma";
// import { requireTenantId } from "../lib/tenant";

// export const webhookRoutes = new Elysia({
//   prefix: "/webhooks",
// })
//   .get("/", async ({ query, set }) => {
//     const tenantId = requireTenantId({ query, set });
//     if (!tenantId) return { message: "tenantId is required" };

//     return prisma.webhook.findMany({
//       where: { tenantId, isActive: true },
//       orderBy: { createdAt: "desc" },
//     });
//   })
//   .get("/:id", async ({ params, set }) => {
//     const webhook = await prisma.webhook.findUnique({
//       where: { id: params.id },
//       include: {
//         deliveries: { take: 20, orderBy: { deliveredAt: "desc" } },
//       },
//     });
//     if (!webhook) {
//       set.status = 404;
//       return { message: "Webhook not found" };
//     }
//     return webhook;
//   })
//   .post(
//     "/",
//     async ({ body, set }) => {
//       set.status = 201;
//       return prisma.webhook.create({
//         data: {
//           tenantId: body.tenantId,
//           name: body.name,
//           url: body.url,
//           events: body.events,
//           secret: body.secret ?? randomBytes(16).toString("hex"),
//         },
//       });
//     },
//     {
//       body: t.Object({
//         tenantId: t.String(),
//         name: t.String(),
//         url: t.String(),
//         events: t.Array(t.String()),
//         secret: t.Optional(t.String()),
//       }),
//     },
//   )
//   .put(
//     "/:id",
//     async ({ params, body }) => {
//       return prisma.webhook.update({
//         where: { id: params.id },
//         data: body,
//       });
//     },
//     {
//       body: t.Partial(
//         t.Object({
//           name: t.Optional(t.String()),
//           url: t.Optional(t.String()),
//           events: t.Optional(t.Array(t.String())),
//           isActive: t.Optional(t.Boolean()),
//         }),
//       ),
//     },
//   )
//   .delete("/:id", async ({ params }) => {
//     return prisma.webhook.update({
//       where: { id: params.id },
//       data: { isActive: false },
//     });
//   });
