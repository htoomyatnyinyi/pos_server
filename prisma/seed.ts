import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database...");

  // ============================================
  // TENANT
  // ============================================

  const tenant = await prisma.tenant.upsert({
    where: {
      code: "DEMO",
    },
    update: {},
    create: {
      code: "DEMO",
      name: "Demo POS Company",
      email: "[admin@demo-pos.com](mailto:admin@demo-pos.com)",
      phone: "09123456789",
    },
  });

  // ============================================
  // STORE
  // ============================================

  const store = await prisma.store.upsert({
    where: {
      tenantId_code: {
        tenantId: tenant.id,
        code: "MAIN",
      },
    },
    update: {},
    create: {
      tenantId: tenant.id,
      code: "MAIN",
      name: "Main Store",
      address: "123 Main Street",
      phone: "09111111111",
    },
  });

  // ============================================
  // ADMIN USER
  // ============================================

  const passwordHash = await bcrypt.hash("Admin123!", 10);

  const admin = await prisma.user.upsert({
    where: {
      tenantId_username: {
        tenantId: tenant.id,
        username: "admin",
      },
    },
    update: {},
    create: {
      tenantId: tenant.id,
      username: "admin",
      email: "[admin@demo-pos.com](mailto:admin@demo-pos.com)",
      passwordHash,
      name: "System Administrator",
      role: Role.ADMIN,
    },
  });

  // Assign admin to store
  await prisma.storeUser.upsert({
    where: {
      storeId_userId: {
        storeId: store.id,
        userId: admin.id,
      },
    },
    update: {},
    create: {
      storeId: store.id,
      userId: admin.id,
      isPrimary: true,
    },
  });

  // ============================================
  // CATEGORIES
  // ============================================

  const beverages = await prisma.category.upsert({
    where: {
      tenantId_slug: {
        tenantId: tenant.id,
        slug: "beverages",
      },
    },
    update: {},
    create: {
      tenantId: tenant.id,
      name: "Beverages",
      slug: "beverages",
      description: "Drinks and beverages",
    },
  });

  const snacks = await prisma.category.upsert({
    where: {
      tenantId_slug: {
        tenantId: tenant.id,
        slug: "snacks",
      },
    },
    update: {},
    create: {
      tenantId: tenant.id,
      name: "Snacks",
      slug: "snacks",
      description: "Snacks and chips",
    },
  });

  // ============================================
  // SUPPLIER
  // ============================================

  const supplier = await prisma.supplier.upsert({
    where: {
      tenantId_code: {
        tenantId: tenant.id,
        code: "SUP-01",
      },
    },
    update: {},
    create: {
      tenantId: tenant.id,
      code: "SUP-01",
      name: "General Supplier Inc.",
      contactName: "John Doe",
      phone: "09999999999",
      email: "[supplier@example.com](mailto:supplier@example.com)",
    },
  });

  // ============================================
  // PRODUCTS
  // ============================================

  const cola = await prisma.product.upsert({
    where: {
      tenantId_sku: {
        tenantId: tenant.id,
        sku: "COLA-01",
      },
    },
    update: {},
    create: {
      tenantId: tenant.id,
      sku: "COLA-01",
      barcode: "1000000001",
      name: "Coca Cola 330ml",
      description: "Canned Coca Cola",
      brand: "Coca Cola",
      costPrice: 0.5,
      sellingPrice: 1.5,
      categoryId: beverages.id,
      supplierId: supplier.id,
    },
  });

  const lays = await prisma.product.upsert({
    where: {
      tenantId_sku: {
        tenantId: tenant.id,
        sku: "LAYS-01",
      },
    },
    update: {},
    create: {
      tenantId: tenant.id,
      sku: "LAYS-01",
      barcode: "1000000002",
      name: "Lays Classic",
      description: "Classic Potato Chips",
      brand: "Lays",
      costPrice: 0.8,
      sellingPrice: 2.0,
      categoryId: snacks.id,
      supplierId: supplier.id,
    },
  });

  // ============================================
  // INVENTORY
  // ============================================

  await prisma.inventory.upsert({
    where: {
      storeId_productId_variantId: {
        storeId: store.id,
        productId: cola.id,
        variantId: null,
      },
    },
    update: {},
    create: {
      tenantId: tenant.id,
      storeId: store.id,
      productId: cola.id,
      quantity: 100,
      reorderPoint: 10,
    },
  });

  await prisma.inventory.upsert({
    where: {
      storeId_productId_variantId: {
        storeId: store.id,
        productId: lays.id,
        variantId: null,
      },
    },
    update: {},
    create: {
      tenantId: tenant.id,
      storeId: store.id,
      productId: lays.id,
      quantity: 50,
      reorderPoint: 10,
    },
  });

  console.log("✅ Seed completed");
  console.log("Tenant:", tenant.name);
  console.log("Store:", store.name);
  console.log("Admin Username: admin");
  console.log("Admin Password: Admin123!");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
