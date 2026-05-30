import { prisma } from "../src/lib/prisma";

async function main() {
  console.log("Seeding database...");

  // 1. Create a Store
  const store = await prisma.store.upsert({
    where: { code: "MAIN" },
    update: {},
    create: {
      code: "MAIN",
      name: "Main Store",
      address: "123 Main St",
      phone: "1234567890",
    },
  });

  // 2. Create Categories
  const catBeverages = await prisma.category.upsert({
    where: { slug: "beverages" },
    update: {},
    create: {
      name: "Beverages",
      slug: "beverages",
      description: "Drinks and beverages",
    },
  });

  const catSnacks = await prisma.category.upsert({
    where: { slug: "snacks" },
    update: {},
    create: {
      name: "Snacks",
      slug: "snacks",
      description: "Light snacks and chips",
    },
  });

  // 3. Create Supplier
  const supplier = await prisma.supplier.upsert({
    where: { code: "SUP-01" },
    update: {},
    create: {
      code: "SUP-01",
      name: "General Supplier Inc.",
      contactName: "John Doe",
      phone: "0987654321",
    },
  });

  // 4. Create Products
  await prisma.product.upsert({
    where: { sku: "COLA-01" },
    update: {},
    create: {
      sku: "COLA-01",
      barcode: "1000000001",
      name: "Coca Cola 330ml",
      description: "Canned Coca Cola",
      brand: "Coca Cola",
      costPrice: 0.5,
      sellingPrice: 1.5,
      stockQuantity: 100,
      categoryId: catBeverages.id,
      supplierId: supplier.id,
    },
  });

  await prisma.product.upsert({
    where: { sku: "LAYS-01" },
    update: {},
    create: {
      sku: "LAYS-01",
      barcode: "1000000002",
      name: "Lays Classic",
      description: "Classic Potato Chips",
      brand: "Lays",
      costPrice: 0.8,
      sellingPrice: 2.0,
      stockQuantity: 50,
      categoryId: catSnacks.id,
      supplierId: supplier.id,
    },
  });

  console.log("Seeding completed.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
