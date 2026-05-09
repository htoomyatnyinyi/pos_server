/*
  Warnings:

  - You are about to drop the column `availableQuantity` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the `_CustomerToReturn` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `_OrderToSession` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `_PromotionCategories` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `_PromotionProducts` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `_UserStore` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "PriceHistory" DROP CONSTRAINT "PriceHistory_productId_fkey";

-- DropForeignKey
ALTER TABLE "_CustomerToReturn" DROP CONSTRAINT "_CustomerToReturn_A_fkey";

-- DropForeignKey
ALTER TABLE "_CustomerToReturn" DROP CONSTRAINT "_CustomerToReturn_B_fkey";

-- DropForeignKey
ALTER TABLE "_OrderToSession" DROP CONSTRAINT "_OrderToSession_A_fkey";

-- DropForeignKey
ALTER TABLE "_OrderToSession" DROP CONSTRAINT "_OrderToSession_B_fkey";

-- DropForeignKey
ALTER TABLE "_PromotionCategories" DROP CONSTRAINT "_PromotionCategories_A_fkey";

-- DropForeignKey
ALTER TABLE "_PromotionCategories" DROP CONSTRAINT "_PromotionCategories_B_fkey";

-- DropForeignKey
ALTER TABLE "_PromotionProducts" DROP CONSTRAINT "_PromotionProducts_A_fkey";

-- DropForeignKey
ALTER TABLE "_PromotionProducts" DROP CONSTRAINT "_PromotionProducts_B_fkey";

-- DropForeignKey
ALTER TABLE "_UserStore" DROP CONSTRAINT "_UserStore_A_fkey";

-- DropForeignKey
ALTER TABLE "_UserStore" DROP CONSTRAINT "_UserStore_B_fkey";

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "sessionId" TEXT;

-- AlterTable
ALTER TABLE "Product" DROP COLUMN "availableQuantity";

-- AlterTable
ALTER TABLE "Return" ADD COLUMN     "customerId" TEXT;

-- DropTable
DROP TABLE "_CustomerToReturn";

-- DropTable
DROP TABLE "_OrderToSession";

-- DropTable
DROP TABLE "_PromotionCategories";

-- DropTable
DROP TABLE "_PromotionProducts";

-- DropTable
DROP TABLE "_UserStore";

-- CreateTable
CREATE TABLE "StoreUser" (
    "storeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "StoreUser_pkey" PRIMARY KEY ("storeId","userId")
);

-- CreateTable
CREATE TABLE "PromotionProduct" (
    "promotionId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,

    CONSTRAINT "PromotionProduct_pkey" PRIMARY KEY ("promotionId","productId")
);

-- CreateTable
CREATE TABLE "PromotionCategory" (
    "promotionId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,

    CONSTRAINT "PromotionCategory_pkey" PRIMARY KEY ("promotionId","categoryId")
);

-- CreateIndex
CREATE INDEX "StoreUser_userId_idx" ON "StoreUser"("userId");

-- CreateIndex
CREATE INDEX "PromotionProduct_productId_idx" ON "PromotionProduct"("productId");

-- CreateIndex
CREATE INDEX "PromotionCategory_categoryId_idx" ON "PromotionCategory"("categoryId");

-- CreateIndex
CREATE INDEX "InventoryCountItem_productId_idx" ON "InventoryCountItem"("productId");

-- CreateIndex
CREATE INDEX "Order_sessionId_idx" ON "Order"("sessionId");

-- CreateIndex
CREATE INDEX "PurchaseOrderItem_productId_idx" ON "PurchaseOrderItem"("productId");

-- CreateIndex
CREATE INDEX "Return_customerId_idx" ON "Return"("customerId");

-- CreateIndex
CREATE INDEX "ReturnItem_orderItemId_idx" ON "ReturnItem"("orderItemId");

-- CreateIndex
CREATE INDEX "StockTransferItem_productId_idx" ON "StockTransferItem"("productId");

-- CreateIndex
CREATE INDEX "StoreSetting_settingKey_idx" ON "StoreSetting"("settingKey");

-- AddForeignKey
ALTER TABLE "StoreUser" ADD CONSTRAINT "StoreUser_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreUser" ADD CONSTRAINT "StoreUser_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceHistory" ADD CONSTRAINT "PriceHistory_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Return" ADD CONSTRAINT "Return_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnItem" ADD CONSTRAINT "ReturnItem_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionProduct" ADD CONSTRAINT "PromotionProduct_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "Promotion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionProduct" ADD CONSTRAINT "PromotionProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionCategory" ADD CONSTRAINT "PromotionCategory_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "Promotion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionCategory" ADD CONSTRAINT "PromotionCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;
