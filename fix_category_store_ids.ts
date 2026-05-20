import { prisma } from "./src/lib/prisma";

async function main() {
  console.log("Fixing categories with null storeId...");
  const categories = await prisma.category.findMany({
    where: { storeId: null },
    include: { products: { select: { storeId: true } } }
  });

  console.log(`Found ${categories.length} categories with null storeId.`);

  for (const cat of categories) {
    // Find the first product's storeId if available
    const productStoreId = cat.products.find(p => p.storeId)?.storeId;
    if (productStoreId) {
      await prisma.category.update({
        where: { id: cat.id },
        data: { storeId: productStoreId }
      });
      console.log(`Updated Category "${cat.name}" to storeId: ${productStoreId}`);
    } else {
      // If no product is linked, assign to the first store in the database so it appears in the app!
      const firstStore = await prisma.store.findFirst();
      if (firstStore) {
        await prisma.category.update({
          where: { id: cat.id },
          data: { storeId: firstStore.id }
        });
        console.log(`Updated empty Category "${cat.name}" to first storeId: ${firstStore.id}`);
      }
    }
  }
  console.log("Done fixing categories!");
}

main().catch(e => {
  console.error(e);
  process.exit(1);
}).finally(async () => {
  await prisma.$disconnect();
});
