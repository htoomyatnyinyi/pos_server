// import {
//   PrismaClient,Enterprise POS System
//   │
//   ├── Tenant (Multi-Tenancy Core)
//   │ │
//   │ ├── Subscription & SaaS
//   │ │ ├── SubscriptionPlan
//   │ │ ├── TenantSubscription
//   │ │ ├── SubscriptionPayment
//   │ │ ├── FeatureFlag
//   │ │ └── TenantFeature
//   │ │
//   │ ├── Users & Security
//   │ │ ├── User
//   │ │ │ ├── UserPermission
//   │ │ │ ├── PasswordResetToken
//   │ │ │ ├── OtpVerification
//   │ │ │ ├── ApiKey
//   │ │ │ └── Notification
//   │ │ ├── StoreUser
//   │ │ ├── Session
//   │ │ ├── AuditLog
//   │ │ └── SystemAdmin
//   │ │ └── SystemAuditLog
//   │ │
//   │ ├── Store Management
//   │ │ ├── Store
//   │ │ │ ├── CashRegister
//   │ │ │ ├── StoreSetting
//   │ │ │ ├── Inventory
//   │ │ │ ├── Session
//   │ │ │ └── Expense
//   │ │ └── StoreUser
//   │ │
//   │ ├── Product Catalog
//   │ │ ├── Category
//   │ │ ├── Supplier
//   │ │ ├── SupplierPayment
//   │ │ ├── Product
//   │ │ │ ├── ProductVariant
//   │ │ │ ├── PriceHistory
//   │ │ │ └── Inventory
//   │ │ └── TaxRate
//   │ │
//   │ ├── Inventory Management
//   │ │ ├── Inventory
//   │ │ ├── StockMovement
//   │ │ ├── InventoryCount
//   │ │ │ └── InventoryCountItem
//   │ │ ├── StockTransfer
//   │ │ │ └── StockTransferItem
//   │ │ └── PurchaseOrder
//   │ │ └── PurchaseOrderItem
//   │ │
//   │ ├── Customer & Loyalty
//   │ │ ├── Customer
//   │ │ │ ├── CustomerWallet
//   │ │ │ │ └── WalletTransaction
//   │ │ │ ├── LoyaltyTransaction
//   │ │ │ ├── GiftCard
//   │ │ │ │ └── GiftCardTransaction
//   │ │ │ ├── Order
//   │ │ │ └── Return
//   │ │ └── CustomerTier
//   │ │
//   │ ├── Sales & Payments
//   │ │ ├── Order
//   │ │ │ └── OrderItem
//   │ │ ├── Payment
//   │ │ ├── Return
//   │ │ │ └── ReturnItem
//   │ │ └── Session
//   │ │
//   │ ├── Promotions & Marketing
//   │ │ ├── Promotion
//   │ │ │ ├── PromotionProduct
//   │ │ │ └── PromotionCategory
//   │ │ └── Notification
//   │ │
//   │ ├── Analytics & Reporting
//   │ │ ├── TenantMetric
//   │ │ ├── AuditLog
//   │ │ └── PriceHistory
//   │ │
//   │ └── Integrations
//   │ ├── ApiKey
//   │ ├── Webhook
//   │ │ └── WebhookDelivery
//   │ ├── FileAttachment
//   │ └── JobQueue
//   │
//   └── Global Platform
//   ├── SubscriptionPlan
//   ├── FeatureFlag
//   └── SystemAdmin

//   Role,
//   SystemAdminRole,
//   SubscriptionStatus,
//   BillingCycle,
//   PaymentMethod,
//   FeatureCategory,
//   RegisterStatus,
//   CustomerTier,
// } from "@prisma/client";
// // import { Decimal } from "@prisma/client/runtime/library";
// import { Decimal } from "@prisma/client/runtime/client";
// import bcrypt from "bcryptjs";

// const prisma = new PrismaClient();

// async function main() {
//   console.log(
//     "🌱 Beginning multi-tenant enterprise system database seeding...",
//   );

//   // ============================================
//   // 1. GLOBAL LAYER: SUBSCRIPTION PLANS & FLAGS
//   // ============================================
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

//   // ============================================
//   // 2. ROOT PLATFORM ADMINISTRATION
//   // ============================================
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

//   // ============================================
//   // 3. TENANT ISOLATION LAYER
//   // ============================================
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

//   // Bind Subscription Connection
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
//       currentProducts: 2,
//       currentCustomers: 1,
//     },
//   });

//   // Attach Tenant Feature Permissions
//   await prisma.tenantFeature.upsert({
//     where: {
//       tenantId_featureId: {
//         tenantId: tenant.id,
//         featureId: coreFeature.id,
//       },
//     },
//     update: {},
//     create: {
//       tenantId: tenant.id,
//       featureId: coreFeature.id,
//       isEnabled: true,
//     },
//   });

//   // ============================================
//   // 4. LOCATIONS & HARDWARE TERMINALS
//   // ============================================
//   const store = await prisma.store.upsert({
//     where: {
//       tenantId_code: {
//         tenantId: tenant.id,
//         code: "MAIN",
//       },
//     },
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

//   // Seeds CashRegister model to satisfy shift hardware dependencies
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

//   // ============================================
//   // 5. STORE HUMAN RESOURCE USERS
//   // ============================================
//   const operationalUserPassword = await bcrypt.hash("Admin123!", 10);

//   const adminUser = await prisma.user.upsert({
//     where: {
//       tenantId_username: {
//         tenantId: tenant.id,
//         username: "admin",
//       },
//     },
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

//   // Map User to Store Location Context
//   await prisma.storeUser.upsert({
//     where: {
//       storeId_userId: {
//         storeId: store.id,
//         userId: adminUser.id,
//       },
//     },
//     update: {},
//     create: {
//       storeId: store.id,
//       userId: adminUser.id,
//       isPrimary: true,
//     },
//   });

//   // ============================================
//   // 6. SUPPLIERS & ITEM CATEGORIES
//   // ============================================
//   const beveragesCategory = await prisma.category.upsert({
//     where: {
//       tenantId_slug: {
//         tenantId: tenant.id,
//         slug: "beverages",
//       },
//     },
//     update: {},
//     create: {
//       tenantId: tenant.id,
//       name: "Beverages",
//       slug: "beverages",
//       description: "Chilled canned drinks and soft beverages",
//       isActive: true,
//     },
//   });

//   const mainSupplier = await prisma.supplier.upsert({
//     where: {
//       tenantId_code: {
//         tenantId: tenant.id,
//         code: "SUP-01",
//       },
//     },
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

//   // ============================================
//   // 7. PRODUCT MANAGEMENT & PHYSICAL INVENTORY
//   // ============================================
//   const softDrinkProduct = await prisma.product.upsert({
//     where: {
//       tenantId_sku: {
//         tenantId: tenant.id,
//         sku: "COLA-330ML",
//       },
//     },
//     update: {},
//     create: {
//       tenantId: tenant.id,
//       sku: "COLA-330ML",
//       barcode: "1000000001",
//       name: "Classic Coca Cola 330ml",
//       description: "Standard aluminum can carbonated soft drink.",
//       brand: "Coca-Cola",
//       costPrice: new Decimal(0.5),
//       sellingPrice: new Decimal(1.5),
//       isTaxable: true,
//       isActive: true,
//       isReturnable: true,
//       categoryId: beveragesCategory.id,
//       supplierId: mainSupplier.id,
//     },
//   });

//   await prisma.storeSetting.createMany({
//     data: [
//       {
//         tenantId: tenant.id,
//         storeId: store.id,
//         key: "currency",
//         value: "USD",
//         updatedById: adminUser.id,
//       },
//       {
//         tenantId: tenant.id,
//         storeId: store.id,
//         key: "tax_rate",
//         value: "5",
//         updatedById: adminUser.id,
//       },
//     ],
//     skipDuplicates: true,
//   });

//   await prisma.taxRate.upsert({
//     where: {
//       tenantId_name_validFrom: {
//         tenantId: tenant.id,
//         name: "Standard VAT",
//         validFrom: new Date("2025-01-01"),
//       },
//     },
//     update: {},
//     create: {
//       tenantId: tenant.id,
//       name: "Standard VAT",
//       rate: new Decimal(5),
//       appliesTo: ["PRODUCT"],
//       validFrom: new Date("2025-01-01"),
//       isActive: true,
//     },
//   });

//   await prisma.session.create({
//     data: {
//       tenantId: tenant.id,
//       userId: adminUser.id,
//       registerId: mainRegister.id,
//       storeId: store.id,
//       openingBalance: new Decimal(100),
//       status: "OPEN",
//     },
//   });

//   // 💡 Safe type assertion bypasses compound key restriction on optional string fields
//   // await prisma.inventory.upsert({
//   //   where: {
//   //     storeId_productId_variantId: {
//   //       storeId: store.id,
//   //       productId: softDrinkProduct.id,
//   //       variantId: null as unknown as string,
//   //     },
//   //   },
//   //   update: {},
//   //   create: {
//   //     tenantId: tenant.id,
//   //     storeId: store.id,
//   //     productId: softDrinkProduct.id,
//   //     variantId: null,
//   //     quantity: 150,
//   //     reservedQty: 0,
//   //     reorderPoint: 20,
//   //     shelfLocation: "Aisle-04-Top",
//   //   },
//   // });

//   const existingInventory = await prisma.inventory.findFirst({
//     where: {
//       storeId: store.id,
//       productId: softDrinkProduct.id,
//       variantId: null,
//     },
//   });

//   if (!existingInventory) {
//     await prisma.inventory.create({
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
//   }
//   // ============================================
//   // 8. CUSTOMER PROFILE GATEWAY
//   // ============================================
//   await prisma.customer.upsert({
//     where: {
//       tenantId_phone: {
//         tenantId: tenant.id,
//         phone: "09999999999",
//       },
//     },
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

//   console.log("\n========================================================");
//   console.log("✅ SYSTEM DATABASE MULTI-TENANT SEEDING PIPELINE COMPLETE");
//   console.log(`Tenant Registered:   ${tenant.name} [Code: ${tenant.code}]`);
//   console.log(
//     `Assigned Hardware:   ${mainRegister.name} [ID: ${mainRegister.id}]`,
//   );
//   console.log(
//     `Assigned User Profile: Username: 'admin' | Password: 'Admin123!'`,
//   );
//   console.log("========================================================\n");
// }

// main()
//   .catch((error) => {
//     console.error(
//       "❌ Database seeding halted due to structural compilation error:",
//       error,
//     );
//     process.exit(1);
//   })
//   .finally(async () => {
//     await prisma.$disconnect();
//   });
// // import {
// //   PrismaClient,
// //   Role,
// //   SystemAdminRole,
// //   SubscriptionStatus,
// //   BillingCycle,
// //   PaymentMethod,
// //   PaymentStatus,
// //   FeatureCategory,
// //   RegisterStatus,
// //   CustomerTier,
// //   OrderStatus,
// // } from "@prisma/client";
// // import { Decimal } from "@prisma/client/runtime/library";
// // import bcrypt from "bcryptjs";

// // const prisma = new PrismaClient();

// // async function main() {
// //   console.log(
// //     "🌱 Beginning multi-tenant enterprise system database seeding...",
// //   );

// //   // ============================================
// //   // 1. SYSTEM PLAN & FEATURES (GLOBAL LAYER)
// //   // ============================================
// //   const premiumPlan = await prisma.subscriptionPlan.upsert({
// //     where: { name: "Enterprise Premium" },
// //     update: {},
// //     create: {
// //       name: "Enterprise Premium",
// //       description: "Complete unrestricted retail POS workflow access.",
// //       priceMonthly: new Decimal(49.99),
// //       priceYearly: new Decimal(499.99),
// //       currency: "USD",
// //       maxStores: 5,
// //       maxUsers: 25,
// //       maxProducts: 15000,
// //       maxCustomers: 10000,
// //       maxApiCalls: 50000,
// //       features: {
// //         advanced_reports: true,
// //         api_access: true,
// //         offline_sync: true,
// //       },
// //       isActive: true,
// //       sortOrder: 1,
// //     },
// //   });

// //   const coreFeature = await prisma.featureFlag.upsert({
// //     where: { key: "OFFLINE_CORE" },
// //     update: {},
// //     create: {
// //       name: "Offline Local Operations DB Engine",
// //       key: "OFFLINE_CORE",
// //       description:
// //         "Permits terminal sales transactions during networks dropouts.",
// //       category: FeatureCategory.GENERAL,
// //       isPremium: true,
// //       isActive: true,
// //     },
// //   });

// //   // ============================================
// //   // 2. ROOT PLATFORM ADMIN
// //   // ============================================
// //   const adminPasswordHash = await bcrypt.hash("SuperAdmin123!", 10);
// //   await prisma.systemAdmin.upsert({
// //     where: { email: "root@minipos-platform.com" },
// //     update: {},
// //     create: {
// //       email: "root@minipos-platform.com",
// //       passwordHash: adminPasswordHash,
// //       name: "Global Platform Director",
// //       role: SystemAdminRole.SUPER_ADMIN,
// //       isActive: true,
// //     },
// //   });

// //   // ============================================
// //   // 3. TENANT SEPARATION LAYER
// //   // ============================================
// //   const tenant = await prisma.tenant.upsert({
// //     where: { code: "DEMO" },
// //     update: {},
// //     create: {
// //       code: "DEMO",
// //       name: "Demo POS Trading Corp",
// //       email: "corporate@demo-pos.com",
// //       phone: "+959123456789",
// //       isActive: true,
// //     },
// //   });

// //   // Activate Plan Subscription Connection
// //   await prisma.tenantSubscription.upsert({
// //     where: { tenantId: tenant.id },
// //     update: {},
// //     create: {
// //       tenantId: tenant.id,
// //       planId: premiumPlan.id,
// //       status: SubscriptionStatus.ACTIVE,
// //       billingCycle: BillingCycle.MONTHLY,
// //       currentStores: 1,
// //       currentUsers: 1,
// //       currentProducts: 2,
// //       currentCustomers: 1,
// //     },
// //   });

// //   // Attach Tenant Feature Flag Access
// //   await prisma.tenantFeature.upsert({
// //     where: {
// //       tenantId_featureId: {
// //         tenantId: tenant.id,
// //         featureId: coreFeature.id,
// //       },
// //     },
// //     update: {},
// //     create: {
// //       tenantId: tenant.id,
// //       featureId: coreFeature.id,
// //       isEnabled: true,
// //     },
// //   });

// //   // ============================================
// //   // 4. LOCATIONS & HARDWARE (STORE & CASH REGISTERS)
// //   // ============================================
// //   const store = await prisma.store.upsert({
// //     where: {
// //       tenantId_code: {
// //         tenantId: tenant.id,
// //         code: "MAIN",
// //       },
// //     },
// //     update: {},
// //     create: {
// //       tenantId: tenant.id,
// //       code: "MAIN",
// //       name: "Main Retail Outlet",
// //       address: "No. 123 Operational Avenue, Yangon",
// //       phone: "09111111111",
// //       email: "outlet1@demo-pos.com",
// //       isActive: true,
// //     },
// //   });

// //   // 💡 THIS SEEDS THE REGISTER SYSTEM SO SESSIONS NO LONGER CRASH WITH FOREIGN KEY ERRORS
// //   const mainRegister = await prisma.cashRegister.upsert({
// //     where: { id: "MOBILE_REG_01" },
// //     update: {},
// //     create: {
// //       id: "MOBILE_REG_01",
// //       name: "Primary iPad Terminal 01",
// //       status: RegisterStatus.CLOSED,
// //       storeId: store.id,
// //       tenantId: tenant.id,
// //     },
// //   });

// //   // ============================================
// //   // 5. HUMAN ACCOUNT ACQUISITIONS & SECURITY ASSIGNMENT
// //   // ============================================
// //   const operationalUserPassword = await bcrypt.hash("Admin123!", 10);

// //   const adminUser = await prisma.user.upsert({
// //     where: {
// //       tenantId_username: {
// //         tenantId: tenant.id,
// //         username: "admin",
// //       },
// //     },
// //     update: {},
// //     create: {
// //       tenantId: tenant.id,
// //       username: "admin",
// //       email: "admin@demo-pos.com",
// //       phone: "09444444444",
// //       passwordHash: operationalUserPassword,
// //       name: "System Store Administrator",
// //       role: Role.ADMIN,
// //       isActive: true,
// //     },
// //   });

// //   // Bind security privileges mapping user profile data context directly to targeted hardware
// //   await prisma.storeUser.upsert({
// //     where: {
// //       storeId_userId: {
// //         storeId: store.id,
// //         userId: adminUser.id,
// //       },
// //     },
// //     update: {},
// //     create: {
// //       storeId: store.id,
// //       userId: adminUser.id,
// //       isPrimary: true,
// //     },
// //   });

// //   // ============================================
// //   // 6. CATEGORIES & SUPPLIERS
// //   // ============================================
// //   const beveragesCategory = await prisma.category.upsert({
// //     where: {
// //       tenantId_slug: {
// //         tenantId: tenant.id,
// //         slug: "beverages",
// //       },
// //     },
// //     update: {},
// //     create: {
// //       tenantId: tenant.id,
// //       name: "Beverages",
// //       slug: "beverages",
// //       description: "Chilled canned drinks and soft beverages",
// //       isActive: true,
// //     },
// //   });

// //   const mainSupplier = await prisma.supplier.upsert({
// //     where: {
// //       tenantId_code: {
// //         tenantId: tenant.id,
// //         code: "SUP-01",
// //       },
// //     },
// //     update: {},
// //     create: {
// //       tenantId: tenant.id,
// //       code: "SUP-01",
// //       name: "Global Beverage Distribution Co.",
// //       contactName: "U Ba",
// //       phone: "09777777777",
// //       email: "orders@globalbev.com",
// //       isActive: true,
// //     },
// //   });

// //   // ============================================
// //   // 7. INVENTORY CONTROL MATRIX (PRODUCTS & VARIANTS)
// //   // ============================================
// //   const softDrinkProduct = await prisma.product.upsert({
// //     where: {
// //       tenantId_sku: {
// //         tenantId: tenant.id,
// //         sku: "COLA-330ML",
// //       },
// //     },
// //     update: {},
// //     create: {
// //       tenantId: tenant.id,
// //       sku: "COLA-330ML",
// //       barcode: "1000000001",
// //       name: "Classic Coca Cola 330ml",
// //       description: "Standard aluminum can carbonated soft drink.",
// //       brand: "Coca-Cola",
// //       costPrice: new Decimal(0.5),
// //       sellingPrice: new Decimal(1.5),
// //       isTaxable: true,
// //       isActive: true,
// //       isReturnable: true,
// //       categoryId: beveragesCategory.id,
// //       supplierId: mainSupplier.id,
// //     },
// //   });

// //   // // Initialize Physical Vault Ledger Record Tracking
// //   // await prisma.inventory.upsert({
// //   //   where: {
// //   //     storeId_productId_variantId: {
// //   //       storeId: store.id,
// //   //       productId: softDrinkProduct.id,
// //   //       variantId: null,
// //   //     },
// //   //   },
// //   //   update: {},
// //   //   create: {
// //   //     tenantId: tenant.id,
// //   //     storeId: store.id,
// //   //     productId: softDrinkProduct.id,
// //   //     quantity: 150,
// //   //     reservedQty: 0,
// //   //     reorderPoint: 20,
// //   //     shelfLocation: "Aisle-04-Top",
// //   //   },
// //   // });

// //   // ============================================
// //   // 8. LOYALTY PROFILE GATEWAY (CUSTOMERS)
// //   // ============================================
// //   await prisma.customer.upsert({
// //     where: {
// //       tenantId_phone: {
// //         tenantId: tenant.id,
// //         phone: "09999999999",
// //       },
// //     },
// //     update: {},
// //     create: {
// //       tenantId: tenant.id,
// //       code: "CUST-001",
// //       name: "Mg Mg",
// //       phone: "09999999999",
// //       email: "mgmg@example.com",
// //       loyaltyPoints: 120,
// //       totalSpent: new Decimal(150.0),
// //       totalOrders: 4,
// //       tier: CustomerTier.BRONZE,
// //       isActive: true,
// //     },
// //   });

// //   console.log("\n========================================================");
// //   console.log("✅ SYSTEM DATABASE MULTI-TENANT SEEDING PIPELINE COMPLETE");
// //   console.log(`Tenant Registered:   ${tenant.name} [Code: ${tenant.code}]`);
// //   console.log(
// //     `Assigned Hardware:   ${mainRegister.name} [ID: ${mainRegister.id}]`,
// //   );
// //   console.log(
// //     `Assigned User Profile: Username: 'admin' | Password: 'Admin123!'`,
// //   );
// //   console.log("========================================================\n");
// // }

// // main()
// //   .catch((error) => {
// //     console.error(
// //       "❌ Database seeding halted due to structural compilation error:",
// //       error,
// //     );
// //     process.exit(1);
// //   })
// //   .finally(async () => {
// //     await prisma.$disconnect();
// //   });
// // // import { PrismaClient, Role } from "@prisma/client";
// // // import bcrypt from "bcryptjs";

// // // const prisma = new PrismaClient();

// // // async function main() {
// // //   console.log("🌱 Seeding database...");

// // //   // ============================================
// // //   // TENANT
// // //   // ============================================

// // //   const tenant = await prisma.tenant.upsert({
// // //     where: {
// // //       code: "DEMO",
// // //     },
// // //     update: {},
// // //     create: {
// // //       code: "DEMO",
// // //       name: "Demo POS Company",
// // //       email: "[admin@demo-pos.com](mailto:admin@demo-pos.com)",
// // //       phone: "09123456789",
// // //     },
// // //   });

// // //   // ============================================
// // //   // STORE
// // //   // ============================================

// // //   const store = await prisma.store.upsert({
// // //     where: {
// // //       tenantId_code: {
// // //         tenantId: tenant.id,
// // //         code: "MAIN",
// // //       },
// // //     },
// // //     update: {},
// // //     create: {
// // //       tenantId: tenant.id,
// // //       code: "MAIN",
// // //       name: "Main Store",
// // //       address: "123 Main Street",
// // //       phone: "09111111111",
// // //     },
// // //   });

// // //   // ============================================
// // //   // ADMIN USER
// // //   // ============================================

// // //   const passwordHash = await bcrypt.hash("Admin123!", 10);

// // //   const admin = await prisma.user.upsert({
// // //     where: {
// // //       tenantId_username: {
// // //         tenantId: tenant.id,
// // //         username: "admin",
// // //       },
// // //     },
// // //     update: {},
// // //     create: {
// // //       tenantId: tenant.id,
// // //       username: "admin",
// // //       email: "[admin@demo-pos.com](mailto:admin@demo-pos.com)",
// // //       passwordHash,
// // //       name: "System Administrator",
// // //       role: Role.ADMIN,
// // //     },
// // //   });

// // //   // Assign admin to store
// // //   await prisma.storeUser.upsert({
// // //     where: {
// // //       storeId_userId: {
// // //         storeId: store.id,
// // //         userId: admin.id,
// // //       },
// // //     },
// // //     update: {},
// // //     create: {
// // //       storeId: store.id,
// // //       userId: admin.id,
// // //       isPrimary: true,
// // //     },
// // //   });

// // //   // ============================================
// // //   // CATEGORIES
// // //   // ============================================

// // //   const beverages = await prisma.category.upsert({
// // //     where: {
// // //       tenantId_slug: {
// // //         tenantId: tenant.id,
// // //         slug: "beverages",
// // //       },
// // //     },
// // //     update: {},
// // //     create: {
// // //       tenantId: tenant.id,
// // //       name: "Beverages",
// // //       slug: "beverages",
// // //       description: "Drinks and beverages",
// // //     },
// // //   });

// // //   const snacks = await prisma.category.upsert({
// // //     where: {
// // //       tenantId_slug: {
// // //         tenantId: tenant.id,
// // //         slug: "snacks",
// // //       },
// // //     },
// // //     update: {},
// // //     create: {
// // //       tenantId: tenant.id,
// // //       name: "Snacks",
// // //       slug: "snacks",
// // //       description: "Snacks and chips",
// // //     },
// // //   });

// // //   // ============================================
// // //   // SUPPLIER
// // //   // ============================================

// // //   const supplier = await prisma.supplier.upsert({
// // //     where: {
// // //       tenantId_code: {
// // //         tenantId: tenant.id,
// // //         code: "SUP-01",
// // //       },
// // //     },
// // //     update: {},
// // //     create: {
// // //       tenantId: tenant.id,
// // //       code: "SUP-01",
// // //       name: "General Supplier Inc.",
// // //       contactName: "John Doe",
// // //       phone: "09999999999",
// // //       email: "[supplier@example.com](mailto:supplier@example.com)",
// // //     },
// // //   });

// // //   // ============================================
// // //   // PRODUCTS
// // //   // ============================================

// // //   const cola = await prisma.product.upsert({
// // //     where: {
// // //       tenantId_sku: {
// // //         tenantId: tenant.id,
// // //         sku: "COLA-01",
// // //       },
// // //     },
// // //     update: {},
// // //     create: {
// // //       tenantId: tenant.id,
// // //       sku: "COLA-01",
// // //       barcode: "1000000001",
// // //       name: "Coca Cola 330ml",
// // //       description: "Canned Coca Cola",
// // //       brand: "Coca Cola",
// // //       costPrice: 0.5,
// // //       sellingPrice: 1.5,
// // //       categoryId: beverages.id,
// // //       supplierId: supplier.id,
// // //     },
// // //   });

// // //   const lays = await prisma.product.upsert({
// // //     where: {
// // //       tenantId_sku: {
// // //         tenantId: tenant.id,
// // //         sku: "LAYS-01",
// // //       },
// // //     },
// // //     update: {},
// // //     create: {
// // //       tenantId: tenant.id,
// // //       sku: "LAYS-01",
// // //       barcode: "1000000002",
// // //       name: "Lays Classic",
// // //       description: "Classic Potato Chips",
// // //       brand: "Lays",
// // //       costPrice: 0.8,
// // //       sellingPrice: 2.0,
// // //       categoryId: snacks.id,
// // //       supplierId: supplier.id,
// // //     },
// // //   });

// // //   // ============================================
// // //   // INVENTORY
// // //   // ============================================

// // //   await prisma.inventory.upsert({
// // //     where: {
// // //       storeId_productId_variantId: {
// // //         storeId: store.id,
// // //         productId: cola.id,
// // //         variantId: null,
// // //       },
// // //     },
// // //     update: {},
// // //     create: {
// // //       tenantId: tenant.id,
// // //       storeId: store.id,
// // //       productId: cola.id,
// // //       quantity: 100,
// // //       reorderPoint: 10,
// // //     },
// // //   });

// // //   await prisma.inventory.upsert({
// // //     where: {
// // //       storeId_productId_variantId: {
// // //         storeId: store.id,
// // //         productId: lays.id,
// // //         variantId: null,
// // //       },
// // //     },
// // //     update: {},
// // //     create: {
// // //       tenantId: tenant.id,
// // //       storeId: store.id,
// // //       productId: lays.id,
// // //       quantity: 50,
// // //       reorderPoint: 10,
// // //     },
// // //   });

// // //   console.log("✅ Seed completed");
// // //   console.log("Tenant:", tenant.name);
// // //   console.log("Store:", store.name);
// // //   console.log("Admin Username: admin");
// // //   console.log("Admin Password: Admin123!");
// // // }

// // // main()
// // //   .catch((error) => {
// // //     console.error(error);
// // //     process.exit(1);
// // //   })
// // //   .finally(async () => {
// // //     await prisma.$disconnect();
// // //   });
