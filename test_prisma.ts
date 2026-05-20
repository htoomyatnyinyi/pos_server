import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  try {
    const category = await prisma.category.upsert({
      where: { slug: 'snacks' },
      update: {},
      create: { name: 'Snacks', slug: 'snacks' }
    });

    const product = await prisma.product.create({
      data: {
        name: "Test Product",
        sku: "TEST-SKU-1",
        sellingPrice: 10.5,
        costPrice: 5.0,
        stockQuantity: 100,
        categoryId: category.id
      }
    });
    console.log("Product created:", product);
  } catch (err) {
    console.error("Error creating product:", err);
  } finally {
    await prisma.$disconnect();
  }
}
main();
