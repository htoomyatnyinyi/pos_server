import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";
import { tenantAuthMiddleware } from "../../middlewares/tenantAuthMiddleware";
import { adjustInventory } from "../lib/inventory";
import { OrderStatus, PaymentMethod, PaymentStatus } from "@prisma/client";
import { validateStore, requireRoles } from "../lib/security";

export const orderRoutes = new Elysia({ prefix: "/orders" })
  .use(tenantAuthMiddleware)

  // ─── GET orders ──────────────────────────────────────────
  .get(
    "/",
    async ({ tenantId, query }) => {
      const page = query.page ? parseInt(query.page as string) : 1;
      const limit = query.limit ? parseInt(query.limit as string) : 20;
      const skip = (page - 1) * limit;
      const whereCondition: any = {
        tenantId,
        deletedAt: null,
        ...(query.storeId ? { storeId: query.storeId as string } : {}),
        ...(query.sessionId ? { sessionId: query.sessionId as string } : {}),
        ...(query.status ? { status: query.status as OrderStatus } : {}),
      };
      const [total, orders] = await prisma.$transaction([
        prisma.order.count({ where: whereCondition }),
        prisma.order.findMany({
          where: whereCondition,
          include: {
            items: { include: { product: true, variant: true } },
            user: { select: { id: true, name: true, email: true } },
            customer: true,
          },
          orderBy: { createdAt: "desc" },
          skip,
          take: limit,
        }),
      ]);
      return {
        success: true,
        meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
        orders,
      };
    },
    {
      query: t.Optional(
        t.Object({
          page: t.Optional(t.String()),
          limit: t.Optional(t.String()),
          storeId: t.Optional(t.String()),
          sessionId: t.Optional(t.String()),
          status: t.Optional(t.String()),
        }),
      ),
    },
  )

  // ─── GET order by ID ─────────────────────────────────────
  .get(
    "/:id",
    async ({ params: { id }, tenantId, set }) => {
      const order = await prisma.order.findFirst({
        where: { id, tenantId, deletedAt: null },
        include: {
          items: { include: { product: true, variant: true } },
          user: { select: { id: true, name: true, email: true } },
          customer: true,
        },
      });
      if (!order) {
        set.status = 404;
        return { success: false, message: "Order not found or access denied." };
      }
      return { success: true, order };
    },
    { params: t.Object({ id: t.String() }) },
  )

  // ─── POST create order ───────────────────────────────────
  .post(
    "/",
    async ({ body, tenantId, userId, role, set }) => {
      requireRoles(role, ["ADMIN", "MANAGER", "CASHIER", "SUPER_ADMIN"], set);

      // Validate store
      await validateStore(body.storeId, tenantId);

      // ─── 1. BYPASS / SAFE SESSION RESOLUTION ─────────────────────
      let activeSessionId = body.sessionId;
      if (activeSessionId) {
        const session = await prisma.session.findFirst({
          where: { id: activeSessionId, tenantId, status: "OPEN" },
        });
        // If session is closed, invalid, or belongs to another store, ignore it
        if (!session || session.storeId !== body.storeId) {
          activeSessionId = undefined;
        }
      }

      // ─── 2. BYPASS / AUTO-RESOLVE CASH REGISTER ───────────────────
      let registerId = body.registerId;

      if (registerId) {
        const existingReg = await prisma.cashRegister.findFirst({
          where: { id: registerId, storeId: body.storeId, tenantId },
        });

        if (existingReg) {
          if (existingReg.status !== "OPEN") {
            await prisma.cashRegister.update({
              where: { id: existingReg.id },
              data: { status: "OPEN" },
            });
          }
        } else {
          registerId = undefined; // Reset if ID doesn't exist in DB
        }
      }

      // Fallback: Resolve or create "default-register" via upsert
      if (!registerId) {
        const defaultReg = await prisma.cashRegister.upsert({
          where: { id: "default-register" },
          update: { status: "OPEN" },
          create: {
            id: "default-register",
            tenantId,
            storeId: body.storeId,
            name: "Default POS Register",
            status: "OPEN",
          },
        });
        registerId = defaultReg.id;
      }

      // ─── Validate products & check stock ──────────────────────────
      const productIds = body.items.map((i) => i.productId);
      const products = await prisma.product.findMany({
        where: {
          id: { in: productIds },
          tenantId,
          isActive: true,
          deletedAt: null,
        },
        include: { variants: true },
      });
      const productMap = new Map(products.map((p: any) => [p.id, p]));
      for (const item of body.items) {
        const product = productMap.get(item.productId);
        if (!product) {
          set.status = 400;
          return {
            success: false,
            message: `Product ${item.productId} not found or inactive.`,
          };
        }
        if (item.variantId) {
          const variant = product.variants.find(
            (v: any) => v.id === item.variantId,
          );
          if (!variant) {
            set.status = 400;
            return {
              success: false,
              message: `Variant ${item.variantId} not found.`,
            };
          }
        }
      }

      const orderNumber = `ORD-${Date.now()}`;

      const createdOrder = await prisma.$transaction(async (tx: any) => {
        const order = await tx.order.create({
          data: {
            tenantId,
            orderNumber,
            subTotal: body.subTotal,
            taxAmount: body.taxAmount ?? 0,
            discountAmount: body.discountAmount ?? 0,
            grandTotal: body.grandTotal,
            paidAmount: body.paidAmount,
            changeAmount: body.changeAmount,
            paymentStatus: PaymentStatus.PENDING,
            status: OrderStatus.PENDING,
            paymentMethod: body.paymentMethod as PaymentMethod,
            userId,
            customerId: body.customerId,
            sessionId: activeSessionId ?? null,
            storeId: body.storeId,
            registerId: registerId,
            items: {
              create: body.items.map((item) => ({
                productId: item.productId,
                variantId: item.variantId ?? null,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                discountAmount: item.discountAmount ?? 0,
                subTotal: item.subTotal,
              })),
            },
          },
          include: { items: true },
        });

        // Deduct inventory
        for (const item of order.items) {
          await adjustInventory(tx, {
            tenantId,
            storeId: body.storeId,
            productId: item.productId,
            variantId: item.variantId,
            quantityDelta: -item.quantity,
            userId,
            type: "SALE",
            referenceId: order.id,
            referenceType: "Order",
            reason: `POS Checkout - Voucher: ${orderNumber}`,
          });
        }

        // Update session sales only if active session exists
        if (activeSessionId) {
          const updateField: any = {};
          const method = body.paymentMethod as PaymentMethod;
          if (method === "CASH") {
            updateField.cashSales = { increment: body.grandTotal };
          } else if (method === "CARD") {
            updateField.cardSales = { increment: body.grandTotal };
          } else {
            updateField.digitalSales = { increment: body.grandTotal };
          }
          await tx.session.update({
            where: { id: activeSessionId },
            data: updateField,
          });
        }

        await tx.auditLog.create({
          data: {
            tenantId,
            userId,
            action: "CREATE",
            entity: "Order",
            entityId: order.id,
            newData: JSON.parse(JSON.stringify(order)),
          },
        });

        return order;
      });

      set.status = 201;
      return {
        success: true,
        message: "Order placed successfully.",
        order: createdOrder,
      };
    },
    {
      body: t.Object({
        subTotal: t.Number(),
        taxAmount: t.Optional(t.Number()),
        discountAmount: t.Optional(t.Number()),
        grandTotal: t.Number(),
        paymentMethod: t.String(),
        paidAmount: t.Number(),
        changeAmount: t.Number(),
        customerId: t.Optional(t.String()),
        sessionId: t.Optional(t.String()),
        storeId: t.String(),
        registerId: t.Optional(t.String()),
        items: t.Array(
          t.Object({
            productId: t.String(),
            variantId: t.Optional(t.String()),
            quantity: t.Integer(),
            unitPrice: t.Number(),
            discountAmount: t.Optional(t.Number()),
            subTotal: t.Number(),
          }),
        ),
      }),
    },
  )

  // ─── PATCH complete order ─────────────────────────────────
  .patch(
    "/:id/complete",
    async ({ params: { id }, tenantId, userId, role, set }) => {
      requireRoles(role, ["ADMIN", "MANAGER", "CASHIER", "SUPER_ADMIN"], set);
      const order = await prisma.order.findFirst({
        where: { id, tenantId },
        include: { items: true },
      });
      if (!order) {
        set.status = 404;
        return { success: false, message: "Order not found." };
      }
      if (order.status !== OrderStatus.PENDING) {
        set.status = 400;
        return {
          success: false,
          message: "Only pending orders can be completed.",
        };
      }
      const updated = await prisma.order.update({
        where: { id },
        data: {
          status: OrderStatus.COMPLETED,
          paymentStatus: PaymentStatus.PAID,
          completedAt: new Date(),
        },
      });
      await prisma.auditLog.create({
        data: {
          tenantId,
          userId,
          action: "UPDATE",
          entity: "Order",
          entityId: id,
          oldData: JSON.parse(JSON.stringify(order)),
          newData: JSON.parse(JSON.stringify(updated)),
        },
      });
      return { success: true, message: "Order completed.", order: updated };
    },
    { params: t.Object({ id: t.String() }) },
  )

  // ─── PATCH update order status ────────────────────────────
  .patch(
    "/:id/status",
    async ({ params: { id }, body, tenantId, userId, role, set }) => {
      requireRoles(role, ["ADMIN", "MANAGER", "SUPER_ADMIN"], set);
      const order = await prisma.order.findFirst({
        where: { id, tenantId },
      });
      if (!order) {
        set.status = 404;
        return { success: false, message: "Order not found." };
      }
      const updatedOrder = await prisma.order.update({
        where: { id },
        data: { status: body.status as OrderStatus },
      });
      await prisma.auditLog.create({
        data: {
          tenantId,
          userId,
          action: "UPDATE",
          entity: "Order",
          entityId: id,
          oldData: JSON.parse(JSON.stringify(order)),
          newData: JSON.parse(JSON.stringify(updatedOrder)),
        },
      });
      return {
        success: true,
        message: "Order status updated.",
        order: updatedOrder,
      };
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({ status: t.String() }),
    },
  )

  // ─── DELETE / void order ──────────────────────────────────
  .delete(
    "/:id",
    async ({ params: { id }, tenantId, role, userId, set }) => {
      requireRoles(role, ["ADMIN", "MANAGER", "SUPER_ADMIN"], set);
      const order = await prisma.order.findFirst({
        where: { id, tenantId },
        include: { items: true },
      });
      if (!order) {
        set.status = 404;
        return { success: false, message: "Order not found or access denied." };
      }
      if (order.status === OrderStatus.VOIDED) {
        set.status = 400;
        return { success: false, message: "Order already voided." };
      }
      return await prisma.$transaction(async (tx: any) => {
        const voidedOrder = await tx.order.update({
          where: { id },
          data: {
            status: OrderStatus.VOIDED,
            paymentStatus: PaymentStatus.REFUNDED,
          },
        });
        // Restock inventory
        for (const item of order.items) {
          if (order.storeId) {
            await adjustInventory(tx, {
              tenantId,
              storeId: order.storeId,
              productId: item.productId,
              variantId: item.variantId,
              quantityDelta: item.quantity,
              userId,
              type: "RETURN_IN",
              referenceId: order.id,
              referenceType: "Order",
              reason: `Voucher Cancelled/Voided - Restocking Items`,
            });
          }
        }
        await tx.auditLog.create({
          data: {
            tenantId,
            userId,
            action: "VOID",
            entity: "Order",
            entityId: id,
            oldData: JSON.parse(JSON.stringify(order)),
            newData: JSON.parse(JSON.stringify(voidedOrder)),
          },
        });
        return {
          success: true,
          message: "Order voided and inventory restored.",
        };
      });
    },
    { params: t.Object({ id: t.String() }) },
  );

// deepseek bypass
// import { Elysia, t } from "elysia";
// import { prisma } from "../lib/prisma";
// import { tenantAuthMiddleware } from "../../middlewares/tenantAuthMiddleware";
// import { adjustInventory } from "../lib/inventory";
// import { OrderStatus, PaymentMethod, PaymentStatus } from "@prisma/client";
// import { validateStore, requireRoles } from "../lib/security";

// export const orderRoutes = new Elysia({ prefix: "/orders" })
//   .use(tenantAuthMiddleware)

//   // ─── GET orders ──────────────────────────────────────────
//   .get(
//     "/",
//     async ({ tenantId, query }) => {
//       const page = query.page ? parseInt(query.page as string) : 1;
//       const limit = query.limit ? parseInt(query.limit as string) : 20;
//       const skip = (page - 1) * limit;
//       const whereCondition: any = {
//         tenantId,
//         deletedAt: null,
//         ...(query.storeId ? { storeId: query.storeId as string } : {}),
//         ...(query.sessionId ? { sessionId: query.sessionId as string } : {}),
//         ...(query.status ? { status: query.status as OrderStatus } : {}),
//       };
//       const [total, orders] = await prisma.$transaction([
//         prisma.order.count({ where: whereCondition }),
//         prisma.order.findMany({
//           where: whereCondition,
//           include: {
//             items: { include: { product: true, variant: true } },
//             user: { select: { id: true, name: true, email: true } },
//             customer: true,
//           },
//           orderBy: { createdAt: "desc" },
//           skip,
//           take: limit,
//         }),
//       ]);
//       return {
//         success: true,
//         meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
//         orders,
//       };
//     },
//     {
//       query: t.Optional(
//         t.Object({
//           page: t.Optional(t.String()),
//           limit: t.Optional(t.String()),
//           storeId: t.Optional(t.String()),
//           sessionId: t.Optional(t.String()),
//           status: t.Optional(t.String()),
//         }),
//       ),
//     },
//   )

//   // ─── GET order by ID ─────────────────────────────────────
//   .get(
//     "/:id",
//     async ({ params: { id }, tenantId, set }) => {
//       const order = await prisma.order.findFirst({
//         where: { id, tenantId, deletedAt: null },
//         include: {
//           items: { include: { product: true, variant: true } },
//           user: { select: { id: true, name: true, email: true } },
//           customer: true,
//         },
//       });
//       if (!order) {
//         set.status = 404;
//         return { success: false, message: "Order not found or access denied." };
//       }
//       return { success: true, order };
//     },
//     { params: t.Object({ id: t.String() }) },
//   )

//   // ─── POST create order ─────────────────────────────────────
//   .post(
//     "/",
//     async ({ body, tenantId, userId, role, set }) => {
//       requireRoles(role, ["ADMIN", "MANAGER", "CASHIER", "SUPER_ADMIN"], set);

//       console.log("role", role, tenantId, userId, "session", body.sessionId);

//       // Validate store
//       await validateStore(body.storeId, tenantId);

//       // Validate session if provided
//       if (body.sessionId) {
//         const session = await prisma.session.findFirst({
//           where: { id: body.sessionId, tenantId, status: "OPEN" },
//         });
//         if (!session) {
//           set.status = 400;
//           return {
//             success: false,
//             message: "The provided register session is closed or invalid.",
//           };
//         }
//         if (session.storeId !== body.storeId) {
//           set.status = 400;
//           return {
//             success: false,
//             message: "Store mismatch between session and order.",
//           };
//         }
//       }

//       // ─── AUTO‑REGISTER LOGIC ──────────────────────────────────
//       let registerId = body.registerId;
//       if (!registerId) {
//         const existingRegister = await prisma.cashRegister.findFirst({
//           where: {
//             storeId: body.storeId,
//             tenantId,
//             // status: "OPEN", // during development i do not use cash-registerId
//           },
//         });
//         if (existingRegister) {
//           registerId = existingRegister.id;
//         } else {
//           const newRegister = await prisma.cashRegister.create({
//             data: {
//               tenantId,
//               storeId: body.storeId,
//               name: "Default POS Register",
//               // status: "OPEN",
//             },
//           });
//           registerId = newRegister.id;
//         }
//       } else {
//         // If provided, verify it exists and is open
//         const register = await prisma.cashRegister.findFirst({
//           where: {
//             id: registerId,
//             storeId: body.storeId,
//             tenantId,
//             status: "OPEN",
//           },
//         });
//         if (!register) {
//           set.status = 400;
//           return {
//             success: false,
//             message:
//               "Invalid or closed cash register. Please provide a valid register.",
//           };
//         }
//       }

//       // ─── Validate products & check stock (variant‑aware) ──
//       const productIds = body.items.map((i) => i.productId);
//       const products = await prisma.product.findMany({
//         where: {
//           id: { in: productIds },
//           tenantId,
//           isActive: true,
//           deletedAt: null,
//         },
//         include: { variants: true },
//       });
//       const productMap = new Map(products.map((p: any) => [p.id, p]));

//       // Build inventory map (key: productId or productId:variantId)
//       const invMap = new Map<string, any>();
//       for (const item of body.items) {
//         const key = item.variantId
//           ? `${item.productId}:${item.variantId}`
//           : item.productId;
//         const inv = await prisma.inventory.findFirst({
//           where: {
//             storeId: body.storeId,
//             productId: item.productId,
//             variantId: item.variantId ?? null,
//             tenantId,
//           },
//         });
//         invMap.set(key, inv || { quantity: 0 });
//       }

//       // Validate each item
//       for (const item of body.items) {
//         const product = productMap.get(item.productId);
//         if (!product) {
//           set.status = 400;
//           return {
//             success: false,
//             message: `Product ${item.productId} not found or inactive.`,
//           };
//         }
//         let variant = null;
//         if (item.variantId) {
//           variant = product.variants.find((v: any) => v.id === item.variantId);
//           if (!variant) {
//             set.status = 400;
//             return {
//               success: false,
//               message: `Variant ${item.variantId} not found.`,
//             };
//           }
//         }
//         console.log("============>item", item);
//         const key = item.variantId
//           ? `${item.productId}:${item.variantId}`
//           : item.productId;

//         const inv = invMap.get(key);
//         console.log("============>inv", inv);

//         const currentStock = inv?.quantity || 0;
//         if (currentStock < item.quantity) {
//           set.status = 400;
//           return {
//             success: false,
//             message: `Insufficient stock for ${product.name}${variant ? ` (${variant.name})` : ""}. Available: ${currentStock}, Required: ${item.quantity}.`,
//           };
//         }
//       }

//       const orderNumber = `ORD-${Date.now()}`;

//       const createdOrder = await prisma.$transaction(async (tx: any) => {
//         const order = await tx.order.create({
//           data: {
//             tenantId,
//             orderNumber,
//             subTotal: body.subTotal,
//             taxAmount: body.taxAmount ?? 0,
//             discountAmount: body.discountAmount ?? 0,
//             grandTotal: body.grandTotal,
//             paidAmount: body.paidAmount,
//             changeAmount: body.changeAmount,
//             paymentStatus: PaymentStatus.PENDING,
//             status: OrderStatus.PENDING,
//             paymentMethod: body.paymentMethod as PaymentMethod,
//             userId,
//             customerId: body.customerId,
//             sessionId: body.sessionId,
//             storeId: body.storeId,
//             registerId, // now always defined
//             items: {
//               create: body.items.map((item) => ({
//                 productId: item.productId,
//                 variantId: item.variantId ?? null,
//                 quantity: item.quantity,
//                 unitPrice: item.unitPrice,
//                 discountAmount: item.discountAmount ?? 0,
//                 subTotal: item.subTotal,
//               })),
//             },
//           },
//           include: { items: true },
//         });

//         // Deduct inventory (variant‑aware)
//         for (const item of order.items) {
//           await adjustInventory(tx, {
//             tenantId,
//             storeId: body.storeId,
//             productId: item.productId,
//             variantId: item.variantId, // include variantId
//             quantityDelta: -item.quantity,
//             userId,
//             type: "SALE",
//             referenceId: order.id,
//             referenceType: "Order",
//             reason: `POS Checkout - Voucher: ${orderNumber}`,
//           });
//         }

//         // Update session sales if session provided
//         if (body.sessionId) {
//           const updateField: any = {};
//           const method = body.paymentMethod as PaymentMethod;
//           if (method === "CASH") {
//             updateField.cashSales = { increment: body.grandTotal };
//           } else if (method === "CARD") {
//             updateField.cardSales = { increment: body.grandTotal };
//           } else if (["KBZ_PAY", "CB_PAY", "WAVE_PAY"].includes(method)) {
//             updateField.digitalSales = { increment: body.grandTotal };
//           } else {
//             updateField.digitalSales = { increment: body.grandTotal };
//           }
//           await tx.session.update({
//             where: { id: body.sessionId },
//             data: updateField,
//           });
//         }

//         await tx.auditLog.create({
//           data: {
//             tenantId,
//             userId,
//             action: "CREATE",
//             entity: "Order",
//             entityId: order.id,
//             newData: JSON.parse(JSON.stringify(order)),
//           },
//         });

//         return order;
//       });

//       set.status = 201;
//       return {
//         success: true,
//         message: "Order placed successfully.",
//         order: createdOrder,
//       };
//     },
//     {
//       body: t.Object({
//         subTotal: t.Number(),
//         taxAmount: t.Optional(t.Number()),
//         discountAmount: t.Optional(t.Number()),
//         grandTotal: t.Number(),
//         paymentMethod: t.String(),
//         paidAmount: t.Number(),
//         changeAmount: t.Number(),
//         customerId: t.Optional(t.String()),
//         sessionId: t.Optional(t.String()),
//         storeId: t.String(),
//         registerId: t.Optional(t.String()),
//         items: t.Array(
//           t.Object({
//             productId: t.String(),
//             variantId: t.Optional(t.String()),
//             quantity: t.Integer(),
//             unitPrice: t.Number(),
//             discountAmount: t.Optional(t.Number()),
//             subTotal: t.Number(),
//           }),
//         ),
//       }),
//     },
//   )

//   // ─── PATCH complete order ─────────────────────────────────
//   .patch(
//     "/:id/complete",
//     async ({ params: { id }, tenantId, userId, role, set }) => {
//       requireRoles(role, ["ADMIN", "MANAGER", "CASHIER", "SUPER_ADMIN"], set);
//       const order = await prisma.order.findFirst({
//         where: { id, tenantId },
//         include: { items: true },
//       });
//       if (!order) {
//         set.status = 404;
//         return { success: false, message: "Order not found." };
//       }
//       if (order.status !== OrderStatus.PENDING) {
//         set.status = 400;
//         return {
//           success: false,
//           message: "Only pending orders can be completed.",
//         };
//       }
//       const updated = await prisma.order.update({
//         where: { id },
//         data: {
//           status: OrderStatus.COMPLETED,
//           paymentStatus: PaymentStatus.PAID,
//           completedAt: new Date(),
//         },
//       });
//       await prisma.auditLog.create({
//         data: {
//           tenantId,
//           userId,
//           action: "UPDATE",
//           entity: "Order",
//           entityId: id,
//           oldData: JSON.parse(JSON.stringify(order)),
//           newData: JSON.parse(JSON.stringify(updated)),
//         },
//       });
//       return { success: true, message: "Order completed.", order: updated };
//     },
//     { params: t.Object({ id: t.String() }) },
//   )

//   // ─── PATCH update order status ────────────────────────────
//   .patch(
//     "/:id/status",
//     async ({ params: { id }, body, tenantId, userId, role, set }) => {
//       requireRoles(role, ["ADMIN", "MANAGER", "SUPER_ADMIN"], set);
//       const order = await prisma.order.findFirst({
//         where: { id, tenantId },
//       });
//       if (!order) {
//         set.status = 404;
//         return { success: false, message: "Order not found." };
//       }
//       const updatedOrder = await prisma.order.update({
//         where: { id },
//         data: { status: body.status as OrderStatus },
//       });
//       await prisma.auditLog.create({
//         data: {
//           tenantId,
//           userId,
//           action: "UPDATE",
//           entity: "Order",
//           entityId: id,
//           oldData: JSON.parse(JSON.stringify(order)),
//           newData: JSON.parse(JSON.stringify(updatedOrder)),
//         },
//       });
//       return {
//         success: true,
//         message: "Order status updated.",
//         order: updatedOrder,
//       };
//     },
//     {
//       params: t.Object({ id: t.String() }),
//       body: t.Object({ status: t.String() }),
//     },
//   )

//   // ─── DELETE / void order ──────────────────────────────────
//   .delete(
//     "/:id",
//     async ({ params: { id }, tenantId, role, userId, set }) => {
//       requireRoles(role, ["ADMIN", "MANAGER", "SUPER_ADMIN"], set);
//       const order = await prisma.order.findFirst({
//         where: { id, tenantId },
//         include: { items: true },
//       });
//       if (!order) {
//         set.status = 404;
//         return { success: false, message: "Order not found or access denied." };
//       }
//       if (order.status === OrderStatus.VOIDED) {
//         set.status = 400;
//         return { success: false, message: "Order already voided." };
//       }
//       return await prisma.$transaction(async (tx: any) => {
//         const voidedOrder = await tx.order.update({
//           where: { id },
//           data: {
//             status: OrderStatus.VOIDED,
//             paymentStatus: PaymentStatus.REFUNDED,
//           },
//         });
//         // Restock inventory
//         for (const item of order.items) {
//           if (order.storeId) {
//             await adjustInventory(tx, {
//               tenantId,
//               storeId: order.storeId,
//               productId: item.productId,
//               variantId: item.variantId,
//               quantityDelta: item.quantity,
//               userId,
//               type: "RETURN_IN",
//               referenceId: order.id,
//               referenceType: "Order",
//               reason: `Voucher Cancelled/Voided - Restocking Items`,
//             });
//           }
//         }
//         await tx.auditLog.create({
//           data: {
//             tenantId,
//             userId,
//             action: "VOID",
//             entity: "Order",
//             entityId: id,
//             oldData: JSON.parse(JSON.stringify(order)),
//             newData: JSON.parse(JSON.stringify(voidedOrder)),
//           },
//         });
//         return {
//           success: true,
//           message: "Order voided and inventory restored.",
//         };
//       });
//     },
//     { params: t.Object({ id: t.String() }) },
//   );

// // original
// // import { Elysia, t } from "elysia";
// // import { prisma } from "../lib/prisma";
// // import { tenantAuthMiddleware } from "../../middlewares/tenantAuthMiddleware";
// // import { adjustInventory } from "../lib/inventory";
// // import { OrderStatus, PaymentMethod, PaymentStatus } from "@prisma/client";
// // import { validateStore, requireRoles } from "../lib/security";

// // export const orderRoutes = new Elysia({ prefix: "/orders" })
// //   .use(tenantAuthMiddleware)

// //   .get(
// //     "/",
// //     async ({ tenantId, query }) => {
// //       const page = query.page ? parseInt(query.page as string) : 1;
// //       const limit = query.limit ? parseInt(query.limit as string) : 20;
// //       const skip = (page - 1) * limit;
// //       const whereCondition: any = {
// //         tenantId,
// //         deletedAt: null,
// //         ...(query.storeId ? { storeId: query.storeId as string } : {}),
// //         ...(query.sessionId ? { sessionId: query.sessionId as string } : {}),
// //         ...(query.status ? { status: query.status as OrderStatus } : {}),
// //       };
// //       const [total, orders] = await prisma.$transaction([
// //         prisma.order.count({ where: whereCondition }),
// //         prisma.order.findMany({
// //           where: whereCondition,
// //           include: {
// //             items: { include: { product: true, variant: true } },
// //             user: { select: { id: true, name: true, email: true } },
// //             customer: true,
// //           },
// //           orderBy: { createdAt: "desc" },
// //           skip,
// //           take: limit,
// //         }),
// //       ]);
// //       return {
// //         success: true,
// //         meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
// //         orders,
// //       };
// //     },
// //     {
// //       query: t.Optional(
// //         t.Object({
// //           page: t.Optional(t.String()),
// //           limit: t.Optional(t.String()),
// //           storeId: t.Optional(t.String()),
// //           sessionId: t.Optional(t.String()),
// //           status: t.Optional(t.String()),
// //         }),
// //       ),
// //     },
// //   )

// //   .get(
// //     "/:id",
// //     async ({ params: { id }, tenantId, set }) => {
// //       const order = await prisma.order.findFirst({
// //         where: { id, tenantId, deletedAt: null },
// //         include: {
// //           items: { include: { product: true, variant: true } },
// //           user: { select: { id: true, name: true, email: true } },
// //           customer: true,
// //         },
// //       });
// //       if (!order) {
// //         set.status = 404;
// //         return { success: false, message: "Order not found or access denied." };
// //       }
// //       return { success: true, order };
// //     },
// //     { params: t.Object({ id: t.String() }) },
// //   )

// //   .post(
// //     "/",
// //     async ({ body, tenantId, userId, role, set }) => {
// //       requireRoles(role, ["ADMIN", "MANAGER", "CASHIER", "SUPER_ADMIN"], set);

// //       // Validate store
// //       await validateStore(body.storeId, tenantId);

// //       // Validate session if provided
// //       if (body.sessionId) {
// //         const session = await prisma.session.findFirst({
// //           where: { id: body.sessionId, tenantId, status: "OPEN" },
// //         });
// //         if (!session) {
// //           set.status = 400;
// //           return {
// //             success: false,
// //             message: "The provided register session is closed or invalid.",
// //           };
// //         }
// //         if (session.storeId !== body.storeId) {
// //           set.status = 400;
// //           return {
// //             success: false,
// //             message: "Store mismatch between session and order.",
// //           };
// //         }
// //       }

// //       // Validate all products exist and belong to tenant
// //       const productIds = body.items.map((i) => i.productId);
// //       const products = await prisma.product.findMany({
// //         where: {
// //           id: { in: productIds },
// //           tenantId,
// //           isActive: true,
// //           deletedAt: null,
// //         },
// //         include: { variants: true },
// //       });
// //       const productMap = new Map(products.map((p: any) => [p.id, p]));
// //       for (const item of body.items) {
// //         const product = productMap.get(item.productId);
// //         if (!product) {
// //           set.status = 400;
// //           return {
// //             success: false,
// //             message: `Product ${item.productId} not found or inactive.`,
// //           };
// //         }
// //         if (item.variantId) {
// //           const variant = product.variants.find(
// //             (v: any) => v.id === item.variantId,
// //           );
// //           if (!variant) {
// //             set.status = 400;
// //             return {
// //               success: false,
// //               message: `Variant ${item.variantId} not found.`,
// //             };
// //           }
// //         }
// //         // Optional: check inventory availability (skip for brevity)
// //       }

// //       const orderNumber = `ORD-${Date.now()}`;

// //       const createdOrder = await prisma.$transaction(async (tx: any) => {
// //         const order = await tx.order.create({
// //           data: {
// //             tenantId,
// //             orderNumber,
// //             subTotal: body.subTotal,
// //             taxAmount: body.taxAmount ?? 0,
// //             discountAmount: body.discountAmount ?? 0,
// //             grandTotal: body.grandTotal,
// //             paidAmount: body.paidAmount,
// //             changeAmount: body.changeAmount,
// //             paymentStatus: PaymentStatus.PENDING,
// //             status: OrderStatus.PENDING,
// //             paymentMethod: body.paymentMethod as PaymentMethod,
// //             userId,
// //             customerId: body.customerId,
// //             sessionId: body.sessionId,
// //             storeId: body.storeId,
// //             registerId: body.registerId,
// //             items: {
// //               create: body.items.map((item) => ({
// //                 productId: item.productId,
// //                 variantId: item.variantId ?? null,
// //                 quantity: item.quantity,
// //                 unitPrice: item.unitPrice,
// //                 discountAmount: item.discountAmount ?? 0,
// //                 subTotal: item.subTotal,
// //               })),
// //             },
// //           },
// //           include: { items: true },
// //         });

// //         // Deduct inventory
// //         for (const item of order.items) {
// //           await adjustInventory(tx, {
// //             tenantId,
// //             storeId: body.storeId,
// //             productId: item.productId,
// //             variantId: item.variantId,
// //             quantityDelta: -item.quantity,
// //             userId,
// //             type: "SALE",
// //             referenceId: order.id,
// //             referenceType: "Order",
// //             reason: `POS Checkout - Voucher: ${orderNumber}`,
// //           });
// //         }

// //         // Update session sales if session provided
// //         if (body.sessionId) {
// //           const updateField: any = {};
// //           const method = body.paymentMethod as PaymentMethod;
// //           if (method === "CASH") {
// //             updateField.cashSales = { increment: body.grandTotal };
// //           } else if (method === "CARD") {
// //             updateField.cardSales = { increment: body.grandTotal };
// //           } else if (["KBZ_PAY", "CB_PAY", "WAVE_PAY"].includes(method)) {
// //             updateField.digitalSales = { increment: body.grandTotal };
// //           } else {
// //             // For MIXED_PAYMENT, GIFT_CARD, WALLET – treat as digital for now
// //             updateField.digitalSales = { increment: body.grandTotal };
// //           }
// //           await tx.session.update({
// //             where: { id: body.sessionId },
// //             data: updateField,
// //           });
// //         }

// //         await tx.auditLog.create({
// //           data: {
// //             tenantId,
// //             userId,
// //             action: "CREATE",
// //             entity: "Order",
// //             entityId: order.id,
// //             newData: JSON.parse(JSON.stringify(order)),
// //           },
// //         });

// //         return order;
// //       });

// //       set.status = 201;
// //       return {
// //         success: true,
// //         message: "Order placed successfully.",
// //         order: createdOrder,
// //       };
// //     },
// //     {
// //       body: t.Object({
// //         subTotal: t.Number(),
// //         taxAmount: t.Optional(t.Number()),
// //         discountAmount: t.Optional(t.Number()),
// //         grandTotal: t.Number(),
// //         paymentMethod: t.String(),
// //         paidAmount: t.Number(),
// //         changeAmount: t.Number(),
// //         customerId: t.Optional(t.String()),
// //         sessionId: t.Optional(t.String()),
// //         storeId: t.String(),
// //         registerId: t.Optional(t.String()),
// //         items: t.Array(
// //           t.Object({
// //             productId: t.String(),
// //             variantId: t.Optional(t.String()),
// //             quantity: t.Integer(),
// //             unitPrice: t.Number(),
// //             discountAmount: t.Optional(t.Number()),
// //             subTotal: t.Number(),
// //           }),
// //         ),
// //       }),
// //     },
// //   )

// //   .patch(
// //     "/:id/complete",
// //     async ({ params: { id }, tenantId, userId, role, set }) => {
// //       requireRoles(role, ["ADMIN", "MANAGER", "CASHIER", "SUPER_ADMIN"], set);
// //       const order = await prisma.order.findFirst({
// //         where: { id, tenantId },
// //         include: { items: true },
// //       });
// //       if (!order) {
// //         set.status = 404;
// //         return { success: false, message: "Order not found." };
// //       }
// //       if (order.status !== OrderStatus.PENDING) {
// //         set.status = 400;
// //         return {
// //           success: false,
// //           message: "Only pending orders can be completed.",
// //         };
// //       }
// //       const updated = await prisma.order.update({
// //         where: { id },
// //         data: {
// //           status: OrderStatus.COMPLETED,
// //           paymentStatus: PaymentStatus.PAID,
// //           completedAt: new Date(),
// //         },
// //       });
// //       await prisma.auditLog.create({
// //         data: {
// //           tenantId,
// //           userId,
// //           action: "UPDATE",
// //           entity: "Order",
// //           entityId: id,
// //           oldData: JSON.parse(JSON.stringify(order)),
// //           newData: JSON.parse(JSON.stringify(updated)),
// //         },
// //       });
// //       return { success: true, message: "Order completed.", order: updated };
// //     },
// //     { params: t.Object({ id: t.String() }) },
// //   )

// //   .patch(
// //     "/:id/status",
// //     async ({ params: { id }, body, tenantId, userId, role, set }) => {
// //       requireRoles(role, ["ADMIN", "MANAGER", "SUPER_ADMIN"], set);
// //       const order = await prisma.order.findFirst({
// //         where: { id, tenantId },
// //       });
// //       if (!order) {
// //         set.status = 404;
// //         return { success: false, message: "Order not found." };
// //       }
// //       const updatedOrder = await prisma.order.update({
// //         where: { id },
// //         data: { status: body.status as OrderStatus },
// //       });
// //       await prisma.auditLog.create({
// //         data: {
// //           tenantId,
// //           userId,
// //           action: "UPDATE",
// //           entity: "Order",
// //           entityId: id,
// //           oldData: JSON.parse(JSON.stringify(order)),
// //           newData: JSON.parse(JSON.stringify(updatedOrder)),
// //         },
// //       });
// //       return {
// //         success: true,
// //         message: "Order status updated.",
// //         order: updatedOrder,
// //       };
// //     },
// //     {
// //       params: t.Object({ id: t.String() }),
// //       body: t.Object({ status: t.String() }),
// //     },
// //   )

// //   .delete(
// //     "/:id",
// //     async ({ params: { id }, tenantId, role, userId, set }) => {
// //       requireRoles(role, ["ADMIN", "MANAGER", "SUPER_ADMIN"], set);
// //       const order = await prisma.order.findFirst({
// //         where: { id, tenantId },
// //         include: { items: true },
// //       });
// //       if (!order) {
// //         set.status = 404;
// //         return { success: false, message: "Order not found or access denied." };
// //       }
// //       if (order.status === OrderStatus.VOIDED) {
// //         set.status = 400;
// //         return { success: false, message: "Order already voided." };
// //       }
// //       return await prisma.$transaction(async (tx: any) => {
// //         const voidedOrder = await tx.order.update({
// //           where: { id },
// //           data: {
// //             status: OrderStatus.VOIDED,
// //             paymentStatus: PaymentStatus.REFUNDED,
// //           },
// //         });
// //         // Restock inventory
// //         for (const item of order.items) {
// //           if (order.storeId) {
// //             await adjustInventory(tx, {
// //               tenantId,
// //               storeId: order.storeId,
// //               productId: item.productId,
// //               variantId: item.variantId,
// //               quantityDelta: item.quantity,
// //               userId,
// //               type: "RETURN_IN",
// //               referenceId: order.id,
// //               referenceType: "Order",
// //               reason: `Voucher Cancelled/Voided - Restocking Items`,
// //             });
// //           }
// //         }
// //         await tx.auditLog.create({
// //           data: {
// //             tenantId,
// //             userId,
// //             action: "VOID",
// //             entity: "Order",
// //             entityId: id,
// //             oldData: JSON.parse(JSON.stringify(order)),
// //             newData: JSON.parse(JSON.stringify(voidedOrder)),
// //           },
// //         });
// //         return {
// //           success: true,
// //           message: "Order voided and inventory restored.",
// //         };
// //       });
// //     },
// //     { params: t.Object({ id: t.String() }) },
// //   );
