import { PrismaClient, AccountType, DebitCredit } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // 1. Currencies
  await prisma.currency.upsert({
    where: { code: "USD" },
    update: {},
    create: { code: "USD", name: "US Dollar", symbol: "$", decimalPlaces: 2 },
  });
  await prisma.currency.upsert({
    where: { code: "MMK" },
    update: {},
    create: {
      code: "MMK",
      name: "Myanmar Kyat",
      symbol: "K",
      decimalPlaces: 0,
    },
  });

  // 2. Exchange Rates
  await prisma.exchangeRate.create({
    data: {
      fromCode: "USD",
      toCode: "MMK",
      rate: 2100,
      date: new Date(),
      source: "SEED",
    },
  });

  // 3. Chart of Accounts (for a default tenant – you may need to create per tenant)
  const tenant = await prisma.tenant.findFirst(); // or create a default tenant
  if (tenant) {
    const accounts = [
      { code: "1000", name: "Cash", type: AccountType.ASSET, isSystem: true },
      { code: "1100", name: "Accounts Receivable", type: AccountType.ASSET },
      {
        code: "1200",
        name: "Inventory",
        type: AccountType.ASSET,
        isSystem: true,
      },
      { code: "2000", name: "Accounts Payable", type: AccountType.LIABILITY },
      { code: "3000", name: "Owner's Equity", type: AccountType.EQUITY },
      {
        code: "4000",
        name: "Sales Revenue",
        type: AccountType.REVENUE,
        isSystem: true,
      },
      { code: "4100", name: "Sales Returns", type: AccountType.REVENUE },
      {
        code: "5000",
        name: "Cost of Goods Sold",
        type: AccountType.EXPENSE,
        isSystem: true,
      },
      { code: "5100", name: "Operating Expenses", type: AccountType.EXPENSE },
    ];
    for (const acc of accounts) {
      await prisma.account.upsert({
        where: { tenantId_code: { tenantId: tenant.id, code: acc.code } },
        update: {},
        create: { ...acc, tenantId: tenant.id },
      });
    }
  }
}

main();

// import {
//   PrismaClient,
//   Role,
//   SystemAdminRole,
//   SubscriptionStatus,
//   BillingCycle,
//   FeatureCategory,
//   RegisterStatus,
//   CustomerTier,
//   OrderStatus,
//   PaymentStatus,
//   PaymentMethod,
//   MovementType,
//   AuditAction,
//   SessionStatus,
// } from "@prisma/client";
// import { PrismaPg } from "@prisma/adapter-pg";
// import { Decimal } from "@prisma/client/runtime/client";
// // import { Decimal } from "@prisma/client/runtime/library";
// import { Pool } from "pg";
// import bcrypt from "bcryptjs";

// // Connection config pulling from the Docker internal network setup
// const connectionString = process.env.DATABASE_URL;
// const pool = new Pool({ connectionString });
// const adapter = new PrismaPg(pool);
// const prisma = new PrismaClient({ adapter });

// async function main() {
//   console.log("\n========================================================");
//   console.log("🌱 INITIALIZING ENTERPRISE MULTI-TENANT SEED PIPELINE...");
//   console.log("========================================================\n");

//   // 1. GLOBAL PLANS & FLAGS
//   const premiumPlan = await prisma.subscriptionPlan.upsert({
//     where: { name: "Enterprise Premium" },
//     update: {},
//     create: {
//       name: "Enterprise Premium",
//       description: "Complete unrestricted retail POS workflow access.",
//       priceMonthly: new Decimal(49.99),
//       priceYearly: new Decimal(499.99),
//       currency: "USD",
//       maxStores: 5,
//       maxUsers: 25,
//       maxProducts: 15000,
//       maxCustomers: 10000,
//       maxApiCalls: 50000,
//       features: {
//         advanced_reports: true,
//         api_access: true,
//         offline_sync: true,
//       },
//       isActive: true,
//       sortOrder: 1,
//     },
//   });

//   const coreFeature = await prisma.featureFlag.upsert({
//     where: { key: "OFFLINE_CORE" },
//     update: {},
//     create: {
//       name: "Offline Local Operations DB Engine",
//       key: "OFFLINE_CORE",
//       description:
//         "Permits terminal sales transactions during network dropouts.",
//       category: FeatureCategory.GENERAL,
//       isPremium: true,
//       isActive: true,
//     },
//   });

//   // 2. ROOT PLATFORM ADMIN
//   const adminPasswordHash = await bcrypt.hash("SuperAdmin123!", 10);
//   await prisma.systemAdmin.upsert({
//     where: { email: "root@minipos-platform.com" },
//     update: {},
//     create: {
//       email: "root@minipos-platform.com",
//       passwordHash: adminPasswordHash,
//       name: "Global Platform Director",
//       role: SystemAdminRole.SUPER_ADMIN,
//       isActive: true,
//     },
//   });

//   // 3. TENANT ISOLATION LAYER
//   const tenant = await prisma.tenant.upsert({
//     where: { code: "DEMO" },
//     update: {},
//     create: {
//       code: "DEMO",
//       name: "Demo POS Trading Corp",
//       email: "corporate@demo-pos.com",
//       phone: "+959123456789",
//       isActive: true,
//     },
//   });

//   await prisma.tenantSubscription.upsert({
//     where: { tenantId: tenant.id },
//     update: {},
//     create: {
//       tenantId: tenant.id,
//       planId: premiumPlan.id,
//       status: SubscriptionStatus.ACTIVE,
//       billingCycle: BillingCycle.MONTHLY,
//       currentStores: 1,
//       currentUsers: 1,
//       currentProducts: 1,
//       currentCustomers: 1,
//     },
//   });

//   await prisma.tenantFeature.upsert({
//     where: {
//       tenantId_featureId: { tenantId: tenant.id, featureId: coreFeature.id },
//     },
//     update: {},
//     create: { tenantId: tenant.id, featureId: coreFeature.id, isEnabled: true },
//   });

//   // 4. LOCATIONS & HARDWARE TERMINALS
//   const store = await prisma.store.upsert({
//     where: { tenantId_code: { tenantId: tenant.id, code: "MAIN" } },
//     update: {},
//     create: {
//       tenantId: tenant.id,
//       code: "MAIN",
//       name: "Main Retail Outlet",
//       address: "No. 123 Operational Avenue, Yangon",
//       phone: "09111111111",
//       email: "outlet1@demo-pos.com",
//       isActive: true,
//     },
//   });

//   const mainRegister = await prisma.cashRegister.upsert({
//     where: { id: "MOBILE_REG_01" },
//     update: {},
//     create: {
//       id: "MOBILE_REG_01",
//       name: "Primary iPad Terminal 01",
//       status: RegisterStatus.CLOSED,
//       storeId: store.id,
//       tenantId: tenant.id,
//     },
//   });

//   // 5. STAFF USERS & SYSTEM AUTH
//   const operationalUserPassword = await bcrypt.hash("Admin123!", 10);
//   const adminUser = await prisma.user.upsert({
//     where: { tenantId_username: { tenantId: tenant.id, username: "admin" } },
//     update: {},
//     create: {
//       tenantId: tenant.id,
//       username: "admin",
//       email: "admin@demo-pos.com",
//       phone: "09444444444",
//       passwordHash: operationalUserPassword,
//       name: "System Store Administrator",
//       role: Role.ADMIN,
//       isActive: true,
//     },
//   });

//   await prisma.storeUser.upsert({
//     where: { storeId_userId: { storeId: store.id, userId: adminUser.id } },
//     update: {},
//     create: { storeId: store.id, userId: adminUser.id, isPrimary: true },
//   });

//   // 6. SUPPLY CHAIN & TAXATION
//   const beveragesCategory = await prisma.category.upsert({
//     where: { tenantId_slug: { tenantId: tenant.id, slug: "beverages" } },
//     update: {},
//     create: {
//       tenantId: tenant.id,
//       name: "Beverages",
//       slug: "beverages",
//       description: "Chilled drinks",
//       isActive: true,
//     },
//   });

//   const mainSupplier = await prisma.supplier.upsert({
//     where: { tenantId_code: { tenantId: tenant.id, code: "SUP-01" } },
//     update: {},
//     create: {
//       tenantId: tenant.id,
//       code: "SUP-01",
//       name: "Global Beverage Distribution Co.",
//       contactName: "U Ba",
//       phone: "09777777777",
//       email: "orders@globalbev.com",
//       isActive: true,
//     },
//   });

//   const taxRate = await prisma.taxRate.upsert({
//     where: {
//       tenantId_name_validFrom: {
//         tenantId: tenant.id,
//         name: "Standard VAT",
//         validFrom: new Date("2026-01-01"),
//       },
//     },
//     update: {},
//     create: {
//       tenantId: tenant.id,
//       name: "Standard VAT",
//       rate: new Decimal(5.0),
//       appliesTo: ["PRODUCT"],
//       validFrom: new Date("2026-01-01"),
//       isActive: true,
//     },
//   });

//   await prisma.storeSetting.createMany({
//     data: [
//       {
//         tenantId: tenant.id,
//         storeId: store.id,
//         settingKey: "currency",
//         settingValue: "USD",
//         updatedById: adminUser.id,
//       },
//       {
//         tenantId: tenant.id,
//         storeId: store.id,
//         settingKey: "tax_rate_default",
//         settingValue: JSON.stringify({ id: taxRate.id, rate: 5.0 }),
//         updatedById: adminUser.id,
//       },
//     ],
//     skipDuplicates: true,
//   });

//   const cocaColaBrand = await prisma.brand.upsert({
//     where: { tenantId_name: { tenantId: tenant.id, name: "Coca-Cola" } },
//     update: {},
//     create: {
//       tenantId: tenant.id,
//       name: "Coca-Cola",
//       isActive: true,
//     },
//   });

//   // 7. PRODUCT & INVENTORY SYSTEM
//   const softDrinkProduct = await prisma.product.upsert({
//     where: { tenantId_sku: { tenantId: tenant.id, sku: "COLA-330ML" } },
//     update: {},
//     create: {
//       tenantId: tenant.id,
//       sku: "COLA-330ML",
//       barcode: "1000000001",
//       name: "Classic Coca Cola 330ml",
//       // brand: "Coca-Cola",
//       brandId: cocaColaBrand.id,
//       costPrice: new Decimal(0.5),
//       sellingPrice: new Decimal(1.5),
//       isTaxable: true,
//       isActive: true,
//       isReturnable: true,
//       categoryId: beveragesCategory.id,
//       supplierId: mainSupplier.id,
//     },
//   });

//   const existingInventory = await prisma.inventory.findFirst({
//     where: {
//       storeId: store.id,
//       productId: softDrinkProduct.id,
//       variantId: null,
//     },
//   });

//   let stockCardId: string;
//   if (!existingInventory) {
//     const freshInventory = await prisma.inventory.create({
//       data: {
//         tenantId: tenant.id,
//         storeId: store.id,
//         productId: softDrinkProduct.id,
//         variantId: null,
//         quantity: 150,
//         reservedQty: 0,
//         reorderPoint: 20,
//         shelfLocation: "Aisle-04-Top",
//       },
//     });
//     stockCardId = freshInventory.id;
//   } else {
//     stockCardId = existingInventory.id;
//   }

//   // 8. CRM GATEWAY
//   const customer = await prisma.customer.upsert({
//     where: { tenantId_phone: { tenantId: tenant.id, phone: "09999999999" } },
//     update: {},
//     create: {
//       tenantId: tenant.id,
//       code: "CUST-001",
//       name: "Mg Mg",
//       phone: "09999999999",
//       email: "mgmg@example.com",
//       loyaltyPoints: 120,
//       totalSpent: new Decimal(150.0),
//       totalOrders: 4,
//       tier: CustomerTier.BRONZE,
//       isActive: true,
//     },
//   });

//   // 9. TRANSACTIONAL METADATA & AUDIT LOGS
//   const checkoutSession = await prisma.session.create({
//     data: {
//       tenantId: tenant.id,
//       userId: adminUser.id,
//       registerId: mainRegister.id,
//       storeId: store.id,
//       openingBalance: new Decimal(100.0),
//       status: SessionStatus.OPEN,
//     },
//   });

//   await prisma.cashRegister.update({
//     where: { id: mainRegister.id },
//     data: { status: RegisterStatus.OPEN },
//   });

//   const totalItemsCount = 3;
//   const totalSubtotal = new Decimal(4.5);
//   const taxCalculated = new Decimal(0.23);
//   const totalGrandTotal = new Decimal(4.73);

//   const salesOrder = await prisma.order.create({
//     data: {
//       tenantId: tenant.id,
//       orderNumber: "ORD-2026-0001",
//       customerId: customer.id,
//       userId: adminUser.id,
//       sessionId: checkoutSession.id,
//       storeId: store.id,
//       registerId: mainRegister.id,
//       status: OrderStatus.COMPLETED,
//       paymentStatus: PaymentStatus.PAID,
//       subTotal: totalSubtotal,
//       taxAmount: taxCalculated,
//       grandTotal: totalGrandTotal,
//       paymentMethod: PaymentMethod.CASH,
//       paidAmount: new Decimal(5.0),
//       changeAmount: new Decimal(0.27),
//       completedAt: new Date(),
//       items: {
//         create: {
//           productId: softDrinkProduct.id,
//           quantity: totalItemsCount,
//           unitPrice: new Decimal(1.5),
//           subTotal: totalSubtotal,
//           taxAmount: taxCalculated,
//         },
//       },
//     },
//   });

//   await prisma.payment.create({
//     data: {
//       tenantId: tenant.id,
//       orderId: salesOrder.id,
//       amount: totalGrandTotal,
//       method: PaymentMethod.CASH,
//       status: PaymentStatus.PAID,
//       processedById: adminUser.id,
//     },
//   });

//   await prisma.stockMovement.create({
//     data: {
//       tenantId: tenant.id,
//       productId: softDrinkProduct.id,
//       storeId: store.id,
//       userId: adminUser.id,
//       quantity: -totalItemsCount,
//       previousStock: 150,
//       newStock: 147,
//       type: MovementType.SALE,
//       referenceId: salesOrder.id,
//       referenceType: "ORDER",
//       reason: "Point of Sale check-out optimization loop.",
//     },
//   });

//   await prisma.inventory.update({
//     where: { id: stockCardId },
//     data: { quantity: { decrement: totalItemsCount } },
//   });

//   await prisma.auditLog.create({
//     data: {
//       tenantId: tenant.id,
//       userId: adminUser.id,
//       action: AuditAction.CREATE,
//       entity: "Order",
//       entityId: salesOrder.id,
//       newData: { orderNumber: "ORD-2026-0001", grandTotal: 4.73 },
//       ipAddress: "192.168.1.45",
//       userAgent: "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X)",
//     },
//   });

//   console.log("\n========================================================");
//   console.log("✅ SYSTEM DATABASE MULTI-TENANT SEEDING PIPELINE COMPLETE");
//   console.log("========================================================\n");
// }

// main()
//   .catch((e) => {
//     console.error("❌ Seed error:", e);
//     process.exit(1);
//   })
//   .finally(async () => {
//     await prisma.$disconnect();
//     pool.end();
//   });

// /*
// Based on the seeding logic you provided, there is a clear distinction between the **Platform-Level Admin** and the **Store-Level Admin**. They serve different purposes in a multi-tenant system.

// ### 1. The Global Platform Admin (Super Admin)

// * **Purpose:** This account manages the entire platform infrastructure. They can view all tenants, configure global settings, manage billing subscriptions, and see system-wide analytics.
// * **Email:** `root@minipos-platform.com`
// * **Password:** `SuperAdmin123!`
// * **Role:** `SUPER_ADMIN`
// * **Dashboard Scope:** **Platform-wide** (The "System Admin" Dashboard).

// ### 2. The Tenant/Store Admin

// * **Purpose:** This account is isolated to a specific tenant (`DEMO`). They manage operations for their specific store, including inventory, sales orders, customer loyalty, and POS terminal sessions.
// * **Username:** `admin`
// * **Email:** `admin@demo-pos.com`
// * **Password:** `Admin123!`
// * **Role:** `ADMIN`
// * **Dashboard Scope:** **Tenant-specific** (The "POS Dashboard" for "Demo POS Trading Corp").

// ---

// ### Understanding the Multi-Tenant Architecture

// To grasp how these accounts interact with your system, it helps to visualize the separation between the global platform layer and the individual business tenants:

// > **Note on Workflow:**
// > * When you log in as the **Super Admin**, you are working at the top level of the pyramid.
// > * When you log in as the **Tenant Admin**, you are scoped strictly to the data belonging to the `DEMO` tenant code.
// >
// >

// Does this distinction help clarify which portal you should use for your specific testing tasks today?
// */
