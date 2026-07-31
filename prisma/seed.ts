import { prisma } from "../src/lib/prisma";
import {
  Role,
  AccountType,
  MovementType,
  PaymentMethod,
  OrderStatus,
  PaymentStatus,
  CustomerTier,
} from "@prisma/client";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import path from "path";

// Load .env
dotenv.config({ path: path.join(__dirname, "../.env") });

if (!process.env.DATABASE_URL) {
  console.error(
    "❌ DATABASE_URL is not defined. Please set it in your .env file.",
  );
  process.exit(1);
}

console.log("✅ DATABASE_URL found, connecting to database...");

async function main() {
  console.log("🌱 Seeding database...");

  // ============================================
  // 1. CURRENCIES & EXCHANGE RATES
  // ============================================
  console.log("📊 Seeding currencies...");
  const currencies = [
    { code: "USD", name: "US Dollar", symbol: "$", decimalPlaces: 2 },
    { code: "MMK", name: "Myanmar Kyat", symbol: "K", decimalPlaces: 0 },
    { code: "EUR", name: "Euro", symbol: "€", decimalPlaces: 2 },
  ];
  for (const c of currencies) {
    await prisma.currency.upsert({
      where: { code: c.code },
      update: {},
      create: c,
    });
  }

  console.log("💱 Seeding exchange rates...");
  await prisma.exchangeRate.upsert({
    where: {
      fromCode_toCode_date: {
        fromCode: "USD",
        toCode: "MMK",
        date: new Date(),
      },
    },
    update: { rate: 2100 },
    create: {
      fromCode: "USD",
      toCode: "MMK",
      rate: 2100,
      date: new Date(),
      source: "SEED",
    },
  });
  await prisma.exchangeRate.upsert({
    where: {
      fromCode_toCode_date: {
        fromCode: "USD",
        toCode: "EUR",
        date: new Date(),
      },
    },
    update: { rate: 0.85 },
    create: {
      fromCode: "USD",
      toCode: "EUR",
      rate: 0.85,
      date: new Date(),
      source: "SEED",
    },
  });

  // ============================================
  // 2. SYSTEM ADMIN (SUPER ADMIN)
  // ============================================
  console.log("👑 Creating Super Admin...");
  const adminPassword = await bcrypt.hash("admin123", 12);
  const admin = await prisma.systemAdmin.upsert({
    where: { email: "admin@demo.com" },
    update: {},
    create: {
      email: "admin@demo.com",
      passwordHash: adminPassword,
      name: "Super Admin",
      role: "SUPER_ADMIN",
      isActive: true,
    },
  });
  console.log(`✅ Super Admin created: ${admin.email} (password: admin123)`);

  // ============================================
  // 3. DEMO TENANT
  // ============================================
  console.log("🏢 Creating demo tenant...");
  const tenant = await prisma.tenant.upsert({
    where: { code: "DEMO-TNT" },
    update: {},
    create: {
      code: "DEMO-TNT",
      name: "Demo Organization",
      email: "demo@organization.com",
      phone: "+1-555-1234",
      isActive: true,
      currencyCode: "USD",
    },
  });
  console.log(`✅ Tenant created: ${tenant.name} (${tenant.code})`);

  // ============================================
  // 4. SUBSCRIPTION PLAN & SUBSCRIPTION
  // ============================================
  console.log("📦 Seeding subscription plan...");
  const plan = await prisma.subscriptionPlan.upsert({
    where: { name: "PRO" },
    update: {},
    create: {
      name: "PRO",
      description: "Professional plan with full features",
      priceMonthly: 99.99,
      priceYearly: 999.99,
      currencyCode: "USD",
      maxStores: 10,
      maxUsers: 50,
      maxProducts: 10000,
      maxCustomers: 5000,
      maxApiCalls: 100000,
      features: {
        advanced_reports: true,
        api_access: true,
        multi_currency: true,
      },
      isActive: true,
      sortOrder: 1,
    },
  });

  await prisma.tenantSubscription.upsert({
    where: { tenantId: tenant.id },
    update: {},
    create: {
      tenantId: tenant.id,
      planId: plan.id,
      startDate: new Date(),
      endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      status: "ACTIVE",
      autoRenew: true,
      billingCycle: "MONTHLY",
      currentStores: 0,
      currentUsers: 0,
      currentProducts: 0,
      currentCustomers: 0,
    },
  });

  // ============================================
  // 5. STORES
  // ============================================
  console.log("🏪 Creating stores...");
  const store1 = await prisma.store.create({
    data: {
      tenantId: tenant.id,
      code: "HQ-001",
      name: "Main Store - Headquarters",
      address: "123 Main Street, City",
      phone: "+1-555-0001",
      email: "hq@demo.com",
      taxNumber: "TAX-001",
      isActive: true,
    },
  });
  const store2 = await prisma.store.create({
    data: {
      tenantId: tenant.id,
      code: "BR-002",
      name: "Branch Store - Downtown",
      address: "456 Oak Avenue, City",
      phone: "+1-555-0002",
      email: "downtown@demo.com",
      taxNumber: "TAX-002",
      isActive: true,
    },
  });
  console.log(
    `✅ Created ${await prisma.store.count({ where: { tenantId: tenant.id } })} stores`,
  );

  // Update subscription store count
  await prisma.tenantSubscription.update({
    where: { tenantId: tenant.id },
    data: { currentStores: { increment: 2 } },
  });

  // ============================================
  // 5.1 CASH REGISTERS (default) 🆕
  // ============================================
  console.log("💵 Creating default cash registers...");
  await prisma.cashRegister.upsert({
    where: { id: "default-register" },
    update: {},
    create: {
      id: "default-register",
      tenantId: tenant.id,
      storeId: store1.id,
      name: "Default Register",
      status: "CLOSED",
    },
  });
  await prisma.cashRegister.upsert({
    where: { id: "default-register-2" },
    update: {},
    create: {
      id: "default-register-2",
      tenantId: tenant.id,
      storeId: store2.id,
      name: "Default Register (Branch)",
      status: "CLOSED",
    },
  });
  console.log(`✅ Default registers created`);

  // ============================================
  // 6. USERS (Staff)
  // ============================================
  console.log("👤 Creating staff users...");
  const userPassword = await bcrypt.hash("staff123", 12);

  const adminUser = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      username: "admin",
      email: "admin@demo.com",
      passwordHash: userPassword,
      name: "Organization Admin",
      role: "ADMIN",
      isActive: true,
      stores: {
        create: [
          { storeId: store1.id, isPrimary: true },
          { storeId: store2.id, isPrimary: false },
        ],
      },
      userPermissions: {
        create: [
          { permission: "VIEW_REPORTS" },
          { permission: "EDIT_PRICES" },
          { permission: "VOID_ORDERS" },
          { permission: "MANAGE_STAFF" },
          { permission: "MANAGE_INVENTORY" },
          { permission: "REFUND_ORDERS" },
          { permission: "VIEW_AUDIT_LOGS" },
          { permission: "MANAGE_PROMOTIONS" },
          { permission: "VIEW_ANALYTICS" },
          { permission: "MANAGE_API_KEYS" },
          { permission: "MANAGE_WEBHOOKS" },
        ],
      },
    },
  });

  const managerUser = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      username: "manager",
      email: "manager@demo.com",
      passwordHash: userPassword,
      name: "Store Manager",
      role: "MANAGER",
      isActive: true,
      stores: {
        create: [{ storeId: store1.id, isPrimary: true }],
      },
      userPermissions: {
        create: [
          { permission: "VIEW_REPORTS" },
          { permission: "EDIT_PRICES" },
          { permission: "VOID_ORDERS" },
          { permission: "MANAGE_INVENTORY" },
          { permission: "REFUND_ORDERS" },
        ],
      },
    },
  });

  const cashierUser = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      username: "cashier",
      email: "cashier@demo.com",
      passwordHash: userPassword,
      name: "Cashier",
      role: "CASHIER",
      isActive: true,
      stores: {
        create: [{ storeId: store1.id, isPrimary: true }],
      },
      userPermissions: {
        create: [],
      },
    },
  });

  console.log(
    `✅ Created ${await prisma.user.count({ where: { tenantId: tenant.id } })} staff users`,
  );
  console.log(`   Admin: admin@demo.com / staff123`);
  console.log(`   Manager: manager@demo.com / staff123`);
  console.log(`   Cashier: cashier@demo.com / staff123`);

  // Update subscription user count
  await prisma.tenantSubscription.update({
    where: { tenantId: tenant.id },
    data: { currentUsers: { increment: 3 } },
  });

  // ============================================
  // 7. CATEGORIES
  // ============================================
  console.log("📂 Creating categories...");
  const categoryElectronics = await prisma.category.create({
    data: {
      tenantId: tenant.id,
      name: "Electronics",
      slug: "electronics",
      description: "Electronic devices and accessories",
      isActive: true,
      sortOrder: 1,
    },
  });
  const categoryClothing = await prisma.category.create({
    data: {
      tenantId: tenant.id,
      name: "Clothing",
      slug: "clothing",
      description: "Apparel and fashion",
      isActive: true,
      sortOrder: 2,
    },
  });
  const categoryFood = await prisma.category.create({
    data: {
      tenantId: tenant.id,
      name: "Food & Beverage",
      slug: "food-beverage",
      description: "Food items and drinks",
      isActive: true,
      sortOrder: 3,
    },
  });

  // Subcategories
  await prisma.category.create({
    data: {
      tenantId: tenant.id,
      name: "Smartphones",
      slug: "smartphones",
      parentId: categoryElectronics.id,
      isActive: true,
      sortOrder: 1,
    },
  });
  await prisma.category.create({
    data: {
      tenantId: tenant.id,
      name: "Laptops",
      slug: "laptops",
      parentId: categoryElectronics.id,
      isActive: true,
      sortOrder: 2,
    },
  });
  console.log(
    `✅ Created ${await prisma.category.count({ where: { tenantId: tenant.id } })} categories`,
  );

  // ============================================
  // 8. BRANDS
  // ============================================
  console.log("🏷️ Creating brands...");
  const brandApple = await prisma.brand.create({
    data: {
      tenantId: tenant.id,
      name: "Apple",
      description: "Apple Inc.",
      isActive: true,
    },
  });
  const brandSamsung = await prisma.brand.create({
    data: {
      tenantId: tenant.id,
      name: "Samsung",
      description: "Samsung Electronics",
      isActive: true,
    },
  });
  const brandNike = await prisma.brand.create({
    data: {
      tenantId: tenant.id,
      name: "Nike",
      description: "Nike Inc.",
      isActive: true,
    },
  });
  console.log(
    `✅ Created ${await prisma.brand.count({ where: { tenantId: tenant.id } })} brands`,
  );

  // ============================================
  // 9. SUPPLIERS
  // ============================================
  console.log("🚚 Creating suppliers...");
  const supplier1 = await prisma.supplier.create({
    data: {
      tenantId: tenant.id,
      code: "SUP-001",
      name: "Tech Distributors Ltd.",
      contactName: "John Tech",
      phone: "+1-555-1001",
      email: "info@techdist.com",
      address: "789 Tech Park",
      taxId: "TAX-SUP-001",
      paymentTerms: 30,
      creditLimit: 5000,
      isActive: true,
    },
  });
  const supplier2 = await prisma.supplier.create({
    data: {
      tenantId: tenant.id,
      code: "SUP-002",
      name: "Fashion Wholesale Co.",
      contactName: "Jane Fashion",
      phone: "+1-555-1002",
      email: "info@fashionwholesale.com",
      address: "456 Fashion Blvd",
      taxId: "TAX-SUP-002",
      paymentTerms: 45,
      creditLimit: 3000,
      isActive: true,
    },
  });
  console.log(
    `✅ Created ${await prisma.supplier.count({ where: { tenantId: tenant.id } })} suppliers`,
  );

  // ============================================
  // 10. PRODUCTS
  // ============================================
  console.log("📦 Creating products...");
  const productsData = [
    {
      name: "iPhone 15 Pro",
      sku: "APL-IP15P-001",
      barcode: "1234567890123",
      costPrice: 999.99,
      sellingPrice: 1299.99,
      wholesalePrice: 1199.99,
      categoryId: categoryElectronics.id,
      brandId: brandApple.id,
      supplierId: supplier1.id,
      description: "Latest iPhone with A17 chip",
      isTaxable: true,
      isActive: true,
      isReturnable: true,
      variants: [
        {
          name: "128GB Black",
          price: 1299.99,
          costPrice: 999.99,
          color: "Black",
          size: null,
        },
        {
          name: "256GB Silver",
          price: 1399.99,
          costPrice: 1099.99,
          color: "Silver",
          size: null,
        },
      ],
      initialStock: 10,
    },
    {
      name: "Samsung Galaxy S24",
      sku: "SAM-GS24-001",
      barcode: "9876543210123",
      costPrice: 799.99,
      sellingPrice: 1099.99,
      wholesalePrice: 999.99,
      categoryId: categoryElectronics.id,
      brandId: brandSamsung.id,
      supplierId: supplier1.id,
      description: "Samsung flagship with AI features",
      isTaxable: true,
      isActive: true,
      isReturnable: true,
      variants: [
        {
          name: "128GB Black",
          price: 1099.99,
          costPrice: 799.99,
          color: "Black",
          size: null,
        },
        {
          name: "256GB White",
          price: 1199.99,
          costPrice: 899.99,
          color: "White",
          size: null,
        },
      ],
      initialStock: 8,
    },
    {
      name: "Nike Air Max 2024",
      sku: "NIK-AM-001",
      barcode: "4567890123456",
      costPrice: 89.99,
      sellingPrice: 149.99,
      wholesalePrice: 129.99,
      categoryId: categoryClothing.id,
      brandId: brandNike.id,
      supplierId: supplier2.id,
      description: "Comfortable running shoes",
      isTaxable: true,
      isActive: true,
      isReturnable: true,
      variants: [
        {
          name: "Size 8 Black",
          price: 149.99,
          costPrice: 89.99,
          color: "Black",
          size: "8",
        },
        {
          name: "Size 9 White",
          price: 149.99,
          costPrice: 89.99,
          color: "White",
          size: "9",
        },
      ],
      initialStock: 20,
    },
    {
      name: "Premium Coffee Beans 1kg",
      sku: "FNB-COF-001",
      barcode: "3216549870123",
      costPrice: 12.5,
      sellingPrice: 24.99,
      wholesalePrice: 19.99,
      categoryId: categoryFood.id,
      supplierId: supplier2.id,
      description: "Single-origin Arabica",
      isTaxable: true,
      isActive: true,
      isReturnable: false,
      variants: [],
      initialStock: 50,
    },
  ];

  let products = [];
  for (const p of productsData) {
    const product = await prisma.product.create({
      data: {
        tenantId: tenant.id,
        name: p.name,
        sku: p.sku,
        barcode: p.barcode,
        costPrice: p.costPrice,
        sellingPrice: p.sellingPrice,
        wholesalePrice: p.wholesalePrice,
        categoryId: p.categoryId,
        brandId: p.brandId || null,
        supplierId: p.supplierId || null,
        description: p.description,
        isTaxable: p.isTaxable,
        isActive: p.isActive,
        isReturnable: p.isReturnable,
        variants:
          p.variants.length > 0
            ? {
                create: p.variants.map((v) => ({
                  tenantId: tenant.id,
                  name: v.name,
                  sku: `${p.sku}-${v.name.replace(/\s/g, "").toUpperCase()}`,
                  price: v.price,
                  costPrice: v.costPrice,
                  color: v.color,
                  size: v.size,
                  isActive: true,
                })),
              }
            : undefined,
      },
      include: { variants: true },
    });
    products.push(product);

    // Create inventory for store1 with initial stock
    await prisma.inventory.create({
      data: {
        tenantId: tenant.id,
        storeId: store1.id,
        productId: product.id,
        quantity: p.initialStock || 0,
        reservedQty: 0,
        reorderPoint: 5,
        reorderQty: 10,
      },
    });
    // Also create inventory for store2 with some stock
    if (store2) {
      await prisma.inventory.create({
        data: {
          tenantId: tenant.id,
          storeId: store2.id,
          productId: product.id,
          quantity: Math.floor((p.initialStock || 0) / 2),
          reservedQty: 0,
          reorderPoint: 3,
          reorderQty: 5,
        },
      });
    }

    // Create initial price history
    await prisma.priceHistory.create({
      data: {
        tenantId: tenant.id,
        productId: product.id,
        oldPrice: 0,
        newPrice: p.sellingPrice,
        changedById: adminUser.id,
        reason: "Initial product creation",
      },
    });
  }
  console.log(`✅ Created ${products.length} products with inventory`);

  // Update subscription product count
  await prisma.tenantSubscription.update({
    where: { tenantId: tenant.id },
    data: { currentProducts: { increment: products.length } },
  });

  // ============================================
  // 11. CUSTOMERS
  // ============================================
  console.log("👥 Creating customers...");
  const customer1 = await prisma.customer.create({
    data: {
      tenantId: tenant.id,
      code: "CUS-001",
      name: "Alice Johnson",
      phone: "+1-555-2001",
      email: "alice@example.com",
      address: "789 Customer Ln",
      tier: CustomerTier.GOLD,
      loyaltyPoints: 150,
      totalSpent: 500.0,
      totalOrders: 3,
      isActive: true,
    },
  });
  const customer2 = await prisma.customer.create({
    data: {
      tenantId: tenant.id,
      code: "CUS-002",
      name: "Bob Smith",
      phone: "+1-555-2002",
      email: "bob@example.com",
      address: "456 Client Ave",
      tier: CustomerTier.SILVER,
      loyaltyPoints: 75,
      totalSpent: 250.0,
      totalOrders: 1,
      isActive: true,
    },
  });
  const customer3 = await prisma.customer.create({
    data: {
      tenantId: tenant.id,
      code: "CUS-003",
      name: "Carol White",
      phone: "+1-555-2003",
      email: "carol@example.com",
      address: "123 Buyer St",
      tier: CustomerTier.BRONZE,
      loyaltyPoints: 0,
      totalSpent: 0,
      totalOrders: 0,
      isActive: true,
    },
  });
  console.log(
    `✅ Created ${await prisma.customer.count({ where: { tenantId: tenant.id } })} customers`,
  );

  // Update subscription customer count
  await prisma.tenantSubscription.update({
    where: { tenantId: tenant.id },
    data: { currentCustomers: { increment: 3 } },
  });

  // ============================================
  // 12. CHART OF ACCOUNTS
  // ============================================
  console.log("📊 Creating chart of accounts...");
  const accounts = [
    { code: "1000", name: "Cash", type: AccountType.ASSET, isSystem: true },
    { code: "1100", name: "Accounts Receivable", type: AccountType.ASSET },
    {
      code: "1200",
      name: "Inventory",
      type: AccountType.ASSET,
      isSystem: true,
    },
    { code: "1300", name: "Fixed Assets", type: AccountType.ASSET },
    { code: "2000", name: "Accounts Payable", type: AccountType.LIABILITY },
    { code: "2100", name: "Accrued Expenses", type: AccountType.LIABILITY },
    { code: "3000", name: "Owner's Equity", type: AccountType.EQUITY },
    { code: "3100", name: "Retained Earnings", type: AccountType.EQUITY },
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
    { code: "5200", name: "Rent Expense", type: AccountType.EXPENSE },
    { code: "5300", name: "Utilities Expense", type: AccountType.EXPENSE },
  ];

  for (const acc of accounts) {
    await prisma.account.upsert({
      where: {
        tenantId_code: {
          tenantId: tenant.id,
          code: acc.code,
        },
      },
      update: {},
      create: {
        ...acc,
        tenantId: tenant.id,
        isActive: true,
      },
    });
  }
  console.log(`✅ Created ${accounts.length} accounts`);

  // ============================================
  // 13. DEMO ORDERS
  // ============================================
  console.log("🧾 Creating demo orders...");
  const order1 = await prisma.order.create({
    data: {
      tenantId: tenant.id,
      orderNumber: `ORD-${Date.now()}-001`,
      storeId: store1.id,
      userId: cashierUser.id,
      customerId: customer1.id,
      status: OrderStatus.COMPLETED,
      paymentStatus: PaymentStatus.PAID,
      subTotal: 1299.99,
      taxAmount: 129.99,
      discountAmount: 50.0,
      grandTotal: 1379.98,
      paymentMethod: PaymentMethod.CASH,
      paidAmount: 1400.0,
      changeAmount: 20.02,
      completedAt: new Date(Date.now() - 3600000),
      items: {
        create: [
          {
            productId: products[0].id, // iPhone
            quantity: 1,
            unitPrice: 1299.99,
            discountAmount: 50.0,
            subTotal: 1249.99,
          },
        ],
      },
    },
    include: { items: true },
  });

  const order2 = await prisma.order.create({
    data: {
      tenantId: tenant.id,
      orderNumber: `ORD-${Date.now()}-002`,
      storeId: store2.id,
      userId: managerUser.id,
      customerId: customer2.id,
      status: OrderStatus.PENDING,
      paymentStatus: PaymentStatus.PENDING,
      subTotal: 149.99,
      taxAmount: 14.99,
      discountAmount: 0,
      grandTotal: 164.98,
      paymentMethod: PaymentMethod.CARD,
      paidAmount: 0,
      changeAmount: 0,
      items: {
        create: [
          {
            productId: products[2].id, // Nike shoes
            quantity: 1,
            unitPrice: 149.99,
            discountAmount: 0,
            subTotal: 149.99,
          },
        ],
      },
    },
    include: { items: true },
  });
  console.log(
    `✅ Created ${await prisma.order.count({ where: { tenantId: tenant.id } })} orders`,
  );

  // ============================================
  // 14. PAYMENTS
  // ============================================
  console.log("💳 Creating payments...");
  await prisma.payment.create({
    data: {
      tenantId: tenant.id,
      orderId: order1.id,
      amount: 1379.98,
      method: PaymentMethod.CASH,
      status: PaymentStatus.PAID,
      processedById: cashierUser.id,
      processedAt: new Date(Date.now() - 3600000),
    },
  });
  console.log(
    `✅ Created ${await prisma.payment.count({ where: { tenantId: tenant.id } })} payments`,
  );

  // ============================================
  // 15. GIFT CARDS & WALLETS
  // ============================================
  console.log("🎁 Creating gift cards and wallets...");
  await prisma.giftCard.create({
    data: {
      tenantId: tenant.id,
      customerId: customer1.id,
      cardNumber: `GC-${Date.now()}`,
      pinCode: "1234",
      initialAmount: 50.0,
      currentBalance: 50.0,
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      status: "ACTIVE",
    },
  });

  const wallet = await prisma.customerWallet.create({
    data: {
      tenantId: tenant.id,
      customerId: customer1.id,
      balance: 100.0,
    },
  });
  await prisma.walletTransaction.create({
    data: {
      tenantId: tenant.id,
      walletId: wallet.id,
      amount: 100.0,
      type: "DEPOSIT",
      description: "Initial wallet deposit",
    },
  });
  console.log(`✅ Gift cards and wallets created`);

  // ============================================
  // 16. AUDIT LOGS (some demo entries)
  // ============================================
  console.log("📝 Creating audit logs...");
  await prisma.auditLog.create({
    data: {
      tenantId: tenant.id,
      userId: adminUser.id,
      action: "CREATE",
      entity: "Tenant",
      entityId: tenant.id,
      newData: { name: tenant.name },
    },
  });
  await prisma.auditLog.create({
    data: {
      tenantId: tenant.id,
      userId: adminUser.id,
      action: "CREATE",
      entity: "User",
      entityId: adminUser.id,
      newData: { name: adminUser.name, role: adminUser.role },
    },
  });
  console.log(`✅ Audit logs created`);

  console.log("✅ Seeding complete!");
}

main()
  .catch((e) => {
    console.error("❌ Seeding failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
