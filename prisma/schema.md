<!-- // ##################
// // ============================================
// // PRODUCTION-GRADE POS SYSTEM SCHEMA (FULLY CORRECTED)
// // ============================================

// generator client {
// provider = "prisma-client-js"
// }

// datasource db {
// provider = "postgresql"
// }

// // ============================================
// // MODELS
// // ============================================

// // 1. Staff with granular permissions
// model User {
// id String @id @default(cuid())
// username String @unique
// email String? @unique
// passwordHash String
// name String
// role Role @default(CASHIER)
// permissions Permission[] @default([])
// isActive Boolean @default(true)
// lastLoginAt DateTime?
// lastLoginIP String?
// twoFactorSecret String?
// isMultiTenant Boolean @default(true)
// isPremium Boolean @default(false)
// isTrial Boolean @default(true)
// trialEndAt DateTime?

// // For limiting free users
// storeCount Int @default(1)
// maxStoreCount Int @default(1)
// posCount Int @default(1)
// maxPosCount Int @default(1)
// // product count limit for free users
// productCount Int @default(50)
// maxProductCount Int @default(50)
// // invoice count limit for free users
// invoiceCount Int @default(1)
// maxInvoiceCount Int @default(1)

// subscriptionPlanId String?
// subscriptionPlan SubscriptionPlan? @relation(fields: [subscriptionPlanId], references: [id])
// // Relationships
// orders Order[]
// stockMovements StockMovement[]
// auditLogs AuditLog[]
// sessions Session[]
// notifications Notification[]

// // For InventoryCount - using different relation names
// createdCounts InventoryCount[] @relation("CreatedByUser")
// approvedCounts InventoryCount[] @relation("ApprovedByUser")

// // Many-to-many with Store
// stores StoreUser[]

// deletedAt DateTime?
// createdAt DateTime @default(now())
// updatedAt DateTime @updatedAt

// @@unique([email, deletedAt])
// @@index([role, isActive])
// @@index([deletedAt])
// }

// // 1.1 Subscription Plan
// model SubscriptionPlan {
// id String @id @default(cuid())
// name String
// description String?
// price Decimal @db.Decimal(12, 2)
// currency String @default("MMK")
// isActive Boolean @default(true)
// isFree Boolean @default(false)

// // Limit settings for this plan
// maxStores Int? @default(1) // null = unlimited
// maxPOS Int? @default(1) // null = unlimited
// maxProducts Int? @default(50) // null = unlimited
// maxInvoices Int? @default(5) // null = unlimited

// // Relationships
// users User[]

// createdAt DateTime @default(now())
// updatedAt DateTime @updatedAt
// }

// // 2. Store/Branch (Multi-store support)
// model Store {
// id String @id @default(cuid())
// code String @unique
// name String
// address String?
// phone String?
// email String?
// taxNumber String?
// isActive Boolean @default(true)

// // Relationships
// users StoreUser[]
// storeSettings StoreSetting[]
// inventoryCounts InventoryCount[]
// transfersFrom StockTransfer[] @relation("FromStore")
// transfersTo StockTransfer[] @relation("ToStore")
// orders Order[]
// sessions Session[]

// products Product[]
// categories Category[]
// suppliers Supplier[]
// stockMovements StockMovement[]
// variantsOption variantsOption[]

// createdAt DateTime @default(now())
// updatedAt DateTime @updatedAt
// }

// // Junction table for User-Store many-to-many
// model StoreUser {
// storeId String
// store Store @relation(fields: [storeId], references: [id])
// userId String
// user User @relation(fields: [userId], references: [id])

// assignedAt DateTime @default(now())
// isPrimary Boolean @default(false)

// @@id([storeId, userId])
// @@index([userId])
// }

// // 3. Category with hierarchy support
// model Category {
// id String @id @default(cuid())
// name String
// slug String @unique
// description String?
// parentId String?
// parent Category? @relation("CategoryHierarchy", fields: [parentId], references: [id])
// children Category[] @relation("CategoryHierarchy")

// products Product[]
// promotions PromotionCategory[]
// isActive Boolean @default(true)
// sortOrder Int @default(0)

// storeId String?
// store Store? @relation(fields: [storeId], references: [id])

// createdAt DateTime @default(now())
// updatedAt DateTime @updatedAt

// @@unique([name, parentId, storeId])
// @@unique([slug, storeId])
// @@index([parentId])
// @@index([storeId])
// }

// // 4. Supplier
// model Supplier {
// id String @id @default(cuid())
// code String @unique
// name String
// contactName String?
// phone String?
// email String?
// address String?
// taxId String?
// isActive Boolean @default(true)

// products Product[]
// purchaseOrders PurchaseOrder[]

// paymentTerms Int?
// creditLimit Decimal? @db.Decimal(12, 2)
// currentBalance Decimal @default(0) @db.Decimal(12, 2)

// storeId String?
// store Store? @relation(fields: [storeId], references: [id])

// createdAt DateTime @default(now())
// updatedAt DateTime @updatedAt

// @@unique([code, storeId])
// @@index([isActive])
// @@index([storeId])
// }

// // 5. Product with comprehensive inventory management
// model Product {
// id String @id @default(cuid())
// sku String @unique
// barcode String? @unique
// name String
// description String? @db.Text
// brand String?

// // Pricing
// costPrice Decimal @db.Decimal(12, 2)
// sellingPrice Decimal @db.Decimal(12, 2)
// wholesalePrice Decimal? @db.Decimal(12, 2)
// promoPrice Decimal? @db.Decimal(12, 2)
// promoStartAt DateTime?
// promoEndAt DateTime?
// expiredDate DateTime?
// manufactureDate DateTime?
// bestBeforeDate DateTime?

// // Inventory
// stockQuantity Int @default(0)
// reservedQuantity Int @default(0)

// reorderPoint Int @default(10)
// reorderQuantity Int @default(50)
// maxStockLevel Int?

// weight Float?
// volume Float?
// isTaxable Boolean @default(true)

// isActive Boolean @default(true)
// isReturnable Boolean @default(true)
// expiryDate DateTime?
// manufacturingDate DateTime?

// // Relationships
// categoryId String
// category Category @relation(fields: [categoryId], references: [id])
// supplierId String?
// supplier Supplier? @relation(fields: [supplierId], references: [id])

// storeId String?
// store Store? @relation(fields: [storeId], references: [id])

// orderItems OrderItem[]
// stockMovements StockMovement[]
// inventoryItems InventoryCountItem[]
// stockTransferItems StockTransferItem[]
// purchaseOrderItems PurchaseOrderItem[]
// promotionProducts PromotionProduct[]
// priceHistory PriceHistory[]
// // variants variantsOption[]
// variantsOption variantsOption[]
// deletedAt DateTime?
// createdAt DateTime @default(now())
// updatedAt DateTime @updatedAt

// @@unique([sku, storeId])
// @@unique([barcode, storeId])
// @@index([sku, barcode])
// @@index([categoryId])
// @@index([isActive, stockQuantity])
// @@index([expiryDate])
// @@index([deletedAt])
// @@index([storeId])
// }

// // // 5.1 Variant Option for Product
// model variantsOption{
// id String @id @default(cuid())
// name String
// productId String
// product Product @relation(fields: [productId], references: [id], onDelete: Cascade)
// price Decimal @db.Decimal(12, 2)
// stockQuantity Int @default(0)
// color String?
// size String?
// weight Float?
// unitPrice Decimal @db.Decimal(12, 2)
// costPrice Decimal @db.Decimal(12, 2)
// isActive Boolean @default(true)
// createdAt DateTime @default(now())
// updatedAt DateTime @updatedAt
// sku String @unique
// barcode String? @unique

// storeId String?
// store Store? @relation(fields: [storeId], references: [id])

// @@index([productId])
// @@index([storeId])
// @@unique([productId, name])
// @@unique([storeId, name])
// }

// // 6. Price History
// model PriceHistory {
// id String @id @default(cuid())
// productId String
// product Product @relation(fields: [productId], references: [id], onDelete: Cascade)
// oldPrice Decimal @db.Decimal(12, 2)
// newPrice Decimal @db.Decimal(12, 2)
// changedBy String
// reason String?
// changedAt DateTime @default(now())

// @@index([productId, changedAt])
// }

// // 7. Customer
// model Customer {
// id String @id @default(cuid())
// code String @unique
// name String
// phone String? @unique
// email String? @unique
// address String? @db.Text
// dateOfBirth DateTime?
// gender String?

// loyaltyPoints Int @default(0)
// totalSpent Decimal @default(0) @db.Decimal(12, 2)
// totalOrders Int @default(0)

// debtAmount Decimal @default(0) @db.Decimal(12, 2)

// tier String @default("BRONZE")
// tierValidUntil DateTime?

// orders Order[]
// returns Return[]

// isActive Boolean @default(true)
// deletedAt DateTime?

// createdAt DateTime @default(now())
// updatedAt DateTime @updatedAt

// @@index([phone, email])
// @@index([loyaltyPoints])
// }

// // 8. Order
// model Order {
// id String @id @default(cuid())
// orderNumber String @unique
// status OrderStatus @default(PENDING)

// subTotal Decimal @db.Decimal(12, 2)
// taxAmount Decimal @db.Decimal(12, 2) @default(0)
// discountAmount Decimal @db.Decimal(12, 2) @default(0)
// discountPercent Decimal @default(0) @db.Decimal(5, 2)
// grandTotal Decimal @db.Decimal(12, 2)

// paymentMethod PaymentMethod @default(CASH)
// paidAmount Decimal @db.Decimal(12, 2) @default(0)
// changeAmount Decimal @db.Decimal(12, 2) @default(0)
// paymentStatus String @default("UNPAID")

// notes String? @db.Text
// voidReason String?

// userId String
// user User @relation(fields: [userId], references: [id])
// customerId String?
// customer Customer? @relation(fields: [customerId], references: [id])
// sessionId String?
// session Session? @relation(fields: [sessionId], references: [id])

// storeId String?
// store Store? @relation(fields: [storeId], references: [id])

// items OrderItem[]
// payments Payment[]
// return Return?
// // return Return? @relation(fields: [orderId], references: [id])

// createdAt DateTime @default(now())
// updatedAt DateTime @updatedAt
// completedAt DateTime?
// cancelledAt DateTime?

// @@index([orderNumber])
// @@index([status, createdAt])
// @@index([userId, createdAt])
// @@index([customerId])
// @@index([sessionId])
// @@index([storeId])
// }

// // 9. Order Items
// model OrderItem {
// id String @id @default(cuid())
// orderId String
// order Order @relation(fields: [orderId], references: [id], onDelete: Cascade)
// productId String
// product Product @relation(fields: [productId], references: [id])

// quantity Int
// unitPrice Decimal @db.Decimal(12, 2)
// discountPercent Decimal @default(0) @db.Decimal(5, 2)
// discountAmount Decimal @default(0) @db.Decimal(12, 2)
// subTotal Decimal @db.Decimal(12, 2)

// isReturned Boolean @default(false)
// returnedQuantity Int @default(0)

// returnItems ReturnItem[]

// createdAt DateTime @default(now())

// @@unique([orderId, productId])
// @@index([productId])
// }

// // 10. Payment
// model Payment {
// id String @id @default(cuid())
// orderId String
// order Order @relation(fields: [orderId], references: [id], onDelete: Cascade)
// amount Decimal @db.Decimal(12, 2)
// method PaymentMethod
// referenceNumber String?
// status String @default("COMPLETED")

// processedBy String
// processedAt DateTime @default(now())

// @@index([orderId])
// @@index([referenceNumber])
// }

// // 11. Return (Fixed one-to-one relationship)
// model Return {
// id String @id @default(cuid())
// returnNumber String @unique
// orderId String @unique // Added @unique for one-to-one
// order Order @relation(fields: [orderId], references: [id])
// customerId String?
// customer Customer? @relation(fields: [customerId], references: [id])

// totalAmount Decimal @db.Decimal(12, 2)
// refundMethod PaymentMethod
// refundStatus String @default("PENDING")

// reason String @db.Text
// approvedBy String
// approvedAt DateTime

// items ReturnItem[]
// createdAt DateTime @default(now())

// @@index([returnNumber])
// @@index([orderId])
// @@index([customerId])
// }

// // 11b. Return Items
// model ReturnItem {
// id String @id @default(cuid())
// returnId String
// return Return @relation(fields: [returnId], references: [id], onDelete: Cascade)
// orderItemId String
// orderItem OrderItem @relation(fields: [orderItemId], references: [id])
// quantity Int
// refundAmount Decimal @db.Decimal(12, 2)
// reason String?

// @@unique([returnId, orderItemId])
// @@index([orderItemId])
// }

// // 12. Stock Movement
// model StockMovement {
// id String @id @default(cuid())
// productId String
// product Product @relation(fields: [productId], references: [id])

// quantity Int
// previousStock Int
// newStock Int

// type MovementType
// referenceId String
// referenceType String

// reason String? @db.Text

// userId String
// user User @relation(fields: [userId], references: [id])

// storeId String?
// store Store? @relation(fields: [storeId], references: [id])

// createdAt DateTime @default(now())

// @@index([productId, createdAt])
// @@index([referenceId, referenceType])
// @@index([type, createdAt])
// @@index([storeId])
// }

// // 13. Inventory Counting
// model InventoryCount {
// id String @id @default(cuid())
// countNumber String @unique
// storeId String?
// store Store? @relation(fields: [storeId], references: [id])

// status StockCountStatus @default(DRAFT)
// scheduledDate DateTime
// completedDate DateTime?

// items InventoryCountItem[]
// createdBy String
// created User @relation("CreatedByUser", fields: [createdBy], references: [id])
// approvedBy String?
// approved User? @relation("ApprovedByUser", fields: [approvedBy], references: [id])

// notes String? @db.Text
// createdAt DateTime @default(now())
// updatedAt DateTime @updatedAt

// @@index([status, scheduledDate])
// }

// // 13b. Inventory Count Items
// model InventoryCountItem {
// id String @id @default(cuid())
// inventoryCountId String
// inventoryCount InventoryCount @relation(fields: [inventoryCountId], references: [id], onDelete: Cascade)
// productId String
// product Product @relation(fields: [productId], references: [id])

// systemQuantity Int
// countedQuantity Int
// variance Int
// reason String? @db.Text

// @@unique([inventoryCountId, productId])
// @@index([productId])
// }

// // 14. Cashier Session
// model Session {
// id String @id @default(cuid())
// userId String
// user User @relation(fields: [userId], references: [id])

// status SessionStatus @default(OPEN)
// openedAt DateTime @default(now())
// closedAt DateTime?

// openingBalance Decimal @db.Decimal(12, 2) @default(0)
// closingBalance Decimal? @db.Decimal(12, 2)
// expectedBalance Decimal? @db.Decimal(12, 2)
// discrepancy Decimal? @db.Decimal(12, 2)

// cashSales Decimal @default(0) @db.Decimal(12, 2)
// cardSales Decimal @default(0) @db.Decimal(12, 2)
// digitalSales Decimal @default(0) @db.Decimal(12, 2)

// notes String? @db.Text

// storeId String?
// store Store? @relation(fields: [storeId], references: [id])

// orders Order[]

// @@index([userId, status])
// @@index([openedAt])
// @@index([storeId])
// }

// // 15. Purchase Order
// model PurchaseOrder {
// id String @id @default(cuid())
// poNumber String @unique
// supplierId String
// supplier Supplier @relation(fields: [supplierId], references: [id])

// status String @default("DRAFT")
// orderDate DateTime @default(now())
// expectedDate DateTime?
// receivedDate DateTime?

// items PurchaseOrderItem[]

// subTotal Decimal @db.Decimal(12, 2)
// taxAmount Decimal @db.Decimal(12, 2) @default(0)
// grandTotal Decimal @db.Decimal(12, 2)

// createdBy String
// notes String? @db.Text

// createdAt DateTime @default(now())
// updatedAt DateTime @updatedAt

// @@index([poNumber])
// @@index([supplierId, status])
// }

// // 15b. Purchase Order Items
// model PurchaseOrderItem {
// id String @id @default(cuid())
// poId String
// purchaseOrder PurchaseOrder @relation(fields: [poId], references: [id], onDelete: Cascade)
// productId String
// product Product @relation(fields: [productId], references: [id])

// quantity Int
// unitCost Decimal @db.Decimal(12, 2)
// totalCost Decimal @db.Decimal(12, 2)

// receivedQuantity Int @default(0)

// @@unique([poId, productId])
// @@index([productId])
// }

// // 16. Stock Transfer
// model StockTransfer {
// id String @id @default(cuid())
// transferNumber String @unique

// fromStoreId String
// fromStore Store @relation("FromStore", fields: [fromStoreId], references: [id])
// toStoreId String
// toStore Store @relation("ToStore", fields: [toStoreId], references: [id])

// status String @default("PENDING")

// items StockTransferItem[]

// requestedBy String
// approvedBy String?
// requestedAt DateTime @default(now())
// completedAt DateTime?

// notes String? @db.Text

// @@index([transferNumber])
// @@index([fromStoreId, toStoreId])
// }

// // 16b. Stock Transfer Items
// model StockTransferItem {
// id String @id @default(cuid())
// transferId String
// transfer StockTransfer @relation(fields: [transferId], references: [id], onDelete: Cascade)
// productId String
// product Product @relation(fields: [productId], references: [id])

// quantity Int
// receivedQuantity Int?

// @@unique([transferId, productId])
// @@index([productId])
// }

// // 17. Audit Log
// model AuditLog {
// id String @id @default(cuid())
// userId String
// user User @relation(fields: [userId], references: [id])

// action String
// entity String
// entityId String

// oldData Json?
// newData Json?
// changes Json?

// ipAddress String?
// userAgent String?

// createdAt DateTime @default(now())

// @@index([entity, entityId])
// @@index([userId, createdAt])
// @@index([action, createdAt])
// }

// // model tokens {
// // id String @id @default(cuid())

// // // Store
// // storeId String
// // store Store @relation(fields: [storeId], references: [id])

// // // User
// // user User @relation(fields: [userId], references: [id])

// // tokenType String
// // tokenValue String
// // expiryTime DateTime

// // createdAt DateTime @default(now())
// // updatedAt DateTime @updatedAt

// // @@index([entity, entityId])
// // @@index([userId, createdAt])
// // @@index([action, createdAt])
// // }

// // 18. Store Settings
// model StoreSetting {
// id String @id @default(cuid())
// storeId String?
// store Store? @relation(fields: [storeId], references: [id])

// settingKey String
// settingValue Json
// description String?

// updatedBy String
// updatedAt DateTime @updatedAt

// @@unique([storeId, settingKey])
// @@index([settingKey])
// }

// // 19. Promotion
// model Promotion {
// id String @id @default(cuid())
// code String @unique
// name String
// description String?

// discountType String
// discountValue Decimal @db.Decimal(10, 2)
// minPurchase Decimal? @db.Decimal(10, 2)

// startDate DateTime
// endDate DateTime
// usageLimit Int?
// usedCount Int @default(0)
// perUserLimit Int?

// isActive Boolean @default(true)

// products PromotionProduct[]
// categories PromotionCategory[]

// createdAt DateTime @default(now())
// updatedAt DateTime @updatedAt

// @@index([code, isActive])
// @@index([startDate, endDate])
// }

// // 19b. Promotion-Product Junction
// model PromotionProduct {
// promotionId String
// promotion Promotion @relation(fields: [promotionId], references: [id], onDelete: Cascade)
// productId String
// product Product @relation(fields: [productId], references: [id], onDelete: Cascade)

// @@id([promotionId, productId])
// @@index([productId])
// }

// // 19c. Promotion-Category Junction
// model PromotionCategory {
// promotionId String
// promotion Promotion @relation(fields: [promotionId], references: [id], onDelete: Cascade)
// categoryId String
// category Category @relation(fields: [categoryId], references: [id], onDelete: Cascade)

// @@id([promotionId, categoryId])
// @@index([categoryId])
// }

// // 20. Notification
// model Notification {
// id String @id @default(cuid())
// userId String
// user User @relation(fields: [userId], references: [id])

// type String
// title String
// message String @db.Text
// isRead Boolean @default(false)

// metadata Json?

// createdAt DateTime @default(now())

// @@index([userId, isRead])
// @@index([createdAt])
// }

// // ============================================
// // ENUMS
// // ============================================

// enum Role {
// ADMIN
// MANAGER
// CASHIER
// ACCOUNTANT
// }

// enum Permission {
// VIEW_REPORTS
// EDIT_PRICES
// VOID_ORDERS
// MANAGE_STAFF
// MANAGE_INVENTORY
// REFUND_ORDERS
// VIEW_AUDIT_LOGS
// }

// enum PaymentMethod {
// CASH
// KBZ_PAY
// CB_PAY
// WAVE_PAY
// CARD
// MIXED_PAYMENT
// }

// enum OrderStatus {
// PENDING
// COMPLETED
// CANCELLED
// VOIDED
// REFUNDED
// PARTIALLY_REFUNDED
// HOLD
// }

// enum MovementType {
// PURCHASE
// SALE
// RETURN_IN
// RETURN_OUT
// ADJUSTMENT
// DAMAGE
// EXPIRED
// TRANSFER_IN
// TRANSFER_OUT
// OPENING_STOCK
// COUNTING
// }

// enum StockCountStatus {
// DRAFT
// IN_PROGRESS
// COMPLETED
// CANCELLED
// }

// enum SessionStatus {
// OPEN
// CLOSED
// SUSPENDED
// }

// // // ============================================
// // // PRODUCTION-GRADE POS SYSTEM SCHEMA
// // // ============================================

// // generator client {
// // provider = "prisma-client-js"
// // // previewFeatures = ["postgresqlExtensions", "relationJoins"]
// // }

// // datasource db {
// // provider = "postgresql"
// // // Enable extensions for better performance
// // // extensions = [pgcrypto]
// // }

// // // ============================================
// // // ENUMS
// // // ============================================

// // enum Role {
// // ADMIN
// // MANAGER
// // CASHIER
// // ACCOUNTANT
// // }

// // enum Permission {
// // VIEW_REPORTS
// // EDIT_PRICES
// // VOID_ORDERS
// // MANAGE_STAFF
// // MANAGE_INVENTORY
// // REFUND_ORDERS
// // VIEW_AUDIT_LOGS
// // }

// // enum PaymentMethod {
// // CASH
// // KBZ_PAY
// // CB_PAY
// // WAVE_PAY
// // CARD
// // MIXED_PAYMENT
// // }

// // enum OrderStatus {
// // PENDING // Waiting for payment
// // COMPLETED // Paid and fulfilled
// // CANCELLED // Cancelled (no payment)
// // VOIDED // Voided after payment
// // REFUNDED // Fully refunded
// // PARTIALLY_REFUNDED
// // HOLD // On hold for later
// // }

// // enum MovementType {
// // PURCHASE // Stock in from supplier
// // SALE // Stock out via sale
// // RETURN_IN // Customer return
// // RETURN_OUT // Return to supplier
// // ADJUSTMENT // Manual adjustment
// // DAMAGE // Damaged goods
// // EXPIRED // Expired products
// // TRANSFER_IN // From other store
// // TRANSFER_OUT // To other store
// // OPENING_STOCK // Initial stock
// // COUNTING // Physical count adjustment
// // }

// // enum StockCountStatus {
// // DRAFT
// // IN_PROGRESS
// // COMPLETED
// // CANCELLED
// // }

// // enum SessionStatus {
// // OPEN
// // CLOSED
// // SUSPENDED
// // }

// // // ============================================
// // // MODELS
// // // ============================================

// // // 1. Staff with granular permissions
// // model User {
// // id String @id @default(cuid())
// // username String @unique
// // email String? @unique
// // passwordHash String // Never store plain passwords
// // name String
// // role Role @default(CASHIER)
// // permissions Permission[] @default([])
// // isActive Boolean @default(true)
// // lastLoginAt DateTime?
// // lastLoginIP String?
// // twoFactorSecret String? // For 2FA

// // // Relationships
// // orders Order[]
// // stockMovements StockMovement[]
// // auditLogs AuditLog[]
// // sessions Session[]
// // createdCounts InventoryCount[] @relation("CreatedCounts")
// // approvedCounts InventoryCount[] @relation("ApprovedCounts")
// // notifications Notification[]
// // stores Store[] @relation("UserStore")

// // // Soft delete
// // deletedAt DateTime?

// // createdAt DateTime @default(now())
// // updatedAt DateTime @updatedAt

// // @@unique([email, deletedAt]) // Allow email reuse after deletion
// // @@index([role, isActive])
// // @@index([deletedAt])
// // }

// // // 2. Store/Branch (Multi-store support)
// // model Store {
// // id String @id @default(cuid())
// // code String @unique
// // name String
// // address String?
// // phone String?
// // email String?
// // taxNumber String?
// // isActive Boolean @default(true)

// // // Relationships
// // users User[] @relation("UserStore")
// // storeSettings StoreSetting[]
// // inventoryCounts InventoryCount[]
// // transfersFrom StockTransfer[] @relation("FromStore")
// // transfersTo StockTransfer[] @relation("ToStore")

// // createdAt DateTime @default(now())
// // updatedAt DateTime @updatedAt
// // }

// // // 3. Category with hierarchy support
// // model Category {
// // id String @id @default(cuid())
// // name String
// // slug String @unique
// // description String?
// // parentId String?
// // parent Category? @relation("CategoryHierarchy", fields: [parentId], references: [id])
// // children Category[] @relation("CategoryHierarchy")

// // products Product[]
// // promotions Promotion[] @relation("PromotionCategories")
// // isActive Boolean @default(true)
// // sortOrder Int @default(0)

// // createdAt DateTime @default(now())
// // updatedAt DateTime @updatedAt

// // @@unique([name, parentId])
// // @@index([parentId])
// // }

// // // 4. Supplier
// // model Supplier {
// // id String @id @default(cuid())
// // code String @unique
// // name String
// // contactName String?
// // phone String?
// // email String?
// // address String?
// // taxId String?
// // isActive Boolean @default(true)

// // products Product[]
// // purchaseOrders PurchaseOrder[]

// // // Payment terms
// // paymentTerms Int? // Days (e.g., 30 = net 30)
// // creditLimit Decimal? @db.Decimal(12, 2)
// // currentBalance Decimal @default(0) @db.Decimal(12, 2)

// // createdAt DateTime @default(now())
// // updatedAt DateTime @updatedAt

// // @@index([isActive])
// // }

// // // 5. Product with comprehensive inventory management
// // model Product {
// // id String @id @default(cuid())
// // sku String @unique
// // barcode String? @unique // For scanning
// // name String
// // description String? @db.Text
// // brand String?

// // // Pricing
// // costPrice Decimal @db.Decimal(12, 2)
// // sellingPrice Decimal @db.Decimal(12, 2)
// // wholesalePrice Decimal? @db.Decimal(12, 2)
// // promoPrice Decimal? @db.Decimal(12, 2)
// // promoStartAt DateTime?
// // promoEndAt DateTime?

// // // Inventory
// // stockQuantity Int @default(0)
// // reservedQuantity Int @default(0) // Items in carts/hold orders
// // availableQuantity Int @default(0) // Generated column for raw SQL

// // reorderPoint Int @default(10) // Min stock before reorder
// // reorderQuantity Int @default(50) // Quantity to reorder
// // maxStockLevel Int? // Maximum capacity

// // // Physical attributes
// // weight Float? // In grams
// // volume Float? // In cubic cm
// // isTaxable Boolean @default(true)

// // // Status
// // isActive Boolean @default(true)
// // isReturnable Boolean @default(true)
// // expiryDate DateTime? // For perishable goods

// // // Relationships
// // categoryId String
// // category Category @relation(fields: [categoryId], references: [id])
// // supplierId String?
// // supplier Supplier? @relation(fields: [supplierId], references: [id])

// // // stockSettings StoreSetting[]
// // // stockTransfers StockTransfer[]

// // orderItems OrderItem[]
// // stockMovements StockMovement[]
// // inventoryItems InventoryCountItem[]
// // stockTransferItems StockTransferItem[]
// // promotions Promotion[] @relation("PromotionProducts")
// // priceHistory PriceHistory[]

// // // Soft delete
// // deletedAt DateTime?

// // createdAt DateTime @default(now())
// // updatedAt DateTime @updatedAt

// // @@index([sku, barcode])
// // @@index([categoryId])
// // @@index([isActive, stockQuantity])
// // @@index([expiryDate])
// // @@index([deletedAt])
// // purchaseOrderItems PurchaseOrderItem[]
// // }

// // // 6. Price History (Track price changes)
// // model PriceHistory {
// // id String @id @default(cuid())
// // productId String
// // product Product @relation(fields: [productId], references: [id])
// // oldPrice Decimal @db.Decimal(12, 2)
// // newPrice Decimal @db.Decimal(12, 2)
// // changedBy String
// // reason String?
// // changedAt DateTime @default(now())

// // @@index([productId, changedAt])
// // }

// // // 7. Customer with loyalty program
// // model Customer {
// // id String @id @default(cuid())
// // code String @unique // Customer code
// // name String
// // phone String? @unique
// // email String? @unique
// // address String? @db.Text
// // dateOfBirth DateTime?
// // gender String?

// // // Loyalty
// // loyaltyPoints Int @default(0)
// // totalSpent Decimal @default(0) @db.Decimal(12, 2)
// // totalOrders Int @default(0)

// // // Customer tier
// // tier String @default("BRONZE") // BRONZE, SILVER, GOLD, PLATINUM
// // tierValidUntil DateTime?

// // // Relationships
// // orders Order[]
// // returns Return[]

// // isActive Boolean @default(true)
// // deletedAt DateTime?

// // createdAt DateTime @default(now())
// // updatedAt DateTime @updatedAt

// // @@index([phone, email])
// // @@index([loyaltyPoints])
// // }

// // // 8. Order with comprehensive tracking
// // model Order {
// // id String @id @default(cuid())
// // orderNumber String @unique
// // status OrderStatus @default(PENDING)

// // // Financials
// // subTotal Decimal @db.Decimal(12, 2)
// // taxAmount Decimal @db.Decimal(12, 2) @default(0)
// // discountAmount Decimal @db.Decimal(12, 2) @default(0)
// // discountPercent Decimal @default(0) @db.Decimal(5, 2)
// // grandTotal Decimal @db.Decimal(12, 2)

// // // Payment
// // paymentMethod PaymentMethod @default(CASH)
// // paidAmount Decimal @db.Decimal(12, 2) @default(0)
// // changeAmount Decimal @db.Decimal(12, 2) @default(0)
// // paymentStatus String @default("UNPAID") // UNPAID, PARTIAL, PAID

// // // Order details
// // notes String? @db.Text
// // voidReason String? // If voided

// // // Relationships
// // userId String
// // user User @relation(fields: [userId], references: [id])
// // customerId String?
// // customer Customer? @relation(fields: [customerId], references: [id])

// // items OrderItem[]
// // payments Payment[]
// // return Return?

// // // Time tracking
// // createdAt DateTime @default(now())
// // updatedAt DateTime @updatedAt
// // completedAt DateTime?
// // cancelledAt DateTime?

// // @@index([orderNumber])
// // @@index([status, createdAt])
// // @@index([userId, createdAt])
// // @@index([customerId])
// // sessions Session[]
// // }

// // // 9. Order Items with reservation
// // model OrderItem {
// // id String @id @default(cuid())
// // orderId String
// // order Order @relation(fields: [orderId], references: [id], onDelete: Cascade)
// // productId String
// // product Product @relation(fields: [productId], references: [id])

// // quantity Int
// // unitPrice Decimal @db.Decimal(12, 2)
// // discountPercent Decimal @default(0) @db.Decimal(5, 2)
// // discountAmount Decimal @default(0) @db.Decimal(12, 2)
// // subTotal Decimal @db.Decimal(12, 2)

// // // Tracking
// // isReturned Boolean @default(false)
// // returnedQuantity Int @default(0)

// // createdAt DateTime @default(now())

// // @@unique([orderId, productId])
// // @@index([productId])
// // }

// // // 10. Payment splitting (Mixed payments)
// // model Payment {
// // id String @id @default(cuid())
// // orderId String
// // order Order @relation(fields: [orderId], references: [id], onDelete: Cascade)
// // amount Decimal @db.Decimal(12, 2)
// // method PaymentMethod
// // referenceNumber String? // Transaction ID for card/digital payments
// // status String @default("COMPLETED") // PENDING, COMPLETED, FAILED, REFUNDED

// // processedBy String
// // processedAt DateTime @default(now())

// // @@index([orderId])
// // @@index([referenceNumber])
// // }

// // // 11. Returns/Refunds
// // model Return {
// // id String @id @default(cuid())
// // returnNumber String @unique
// // orderId String @unique
// // order Order @relation(fields: [orderId], references: [id])

// // totalAmount Decimal @db.Decimal(12, 2)
// // refundMethod PaymentMethod
// // refundStatus String @default("PENDING") // PENDING, COMPLETED

// // reason String @db.Text
// // approvedBy String
// // approvedAt DateTime

// // items ReturnItem[]
// // createdAt DateTime @default(now())

// // @@index([returnNumber])
// // @@index([orderId])
// // customers Customer[]
// // }

// // model ReturnItem {
// // id String @id @default(cuid())
// // returnId String
// // return Return @relation(fields: [returnId], references: [id], onDelete: Cascade)
// // orderItemId String
// // quantity Int
// // refundAmount Decimal @db.Decimal(12, 2)
// // reason String?

// // @@unique([returnId, orderItemId])
// // }

// // // 12. Stock Movement (Complete inventory tracking)
// // model StockMovement {
// // id String @id @default(cuid())
// // productId String
// // product Product @relation(fields: [productId], references: [id])

// // quantity Int // Positive = IN, Negative = OUT
// // previousStock Int // Stock before movement
// // newStock Int // Stock after movement

// // type MovementType
// // referenceId String // Order ID, Purchase Order ID, etc.
// // referenceType String // "ORDER", "PURCHASE_ORDER", "COUNTING"

// // reason String? @db.Text

// // userId String
// // user User @relation(fields: [userId], references: [id])

// // createdAt DateTime @default(now())

// // @@index([productId, createdAt])
// // @@index([referenceId, referenceType])
// // @@index([type, createdAt])
// // }

// // // 13. Inventory Counting (Physical stock take)
// // model InventoryCount {
// // id String @id @default(cuid())
// // countNumber String @unique
// // storeId String?
// // store Store? @relation(fields: [storeId], references: [id])

// // status StockCountStatus @default(DRAFT)
// // scheduledDate DateTime
// // completedDate DateTime?

// // items InventoryCountItem[]
// // createdBy String
// // created User @relation("CreatedCounts", fields: [createdBy], references: [id])
// // approvedBy String?
// // approved User? @relation("ApprovedCounts", fields: [approvedBy], references: [id])

// // notes String? @db.Text
// // createdAt DateTime @default(now())
// // updatedAt DateTime @updatedAt

// // @@index([status, scheduledDate])
// // }

// // model InventoryCountItem {
// // id String @id @default(cuid())
// // inventoryCountId String
// // inventoryCount InventoryCount @relation(fields: [inventoryCountId], references: [id], onDelete: Cascade)
// // productId String
// // product Product @relation(fields: [productId], references: [id])

// // systemQuantity Int // Expected quantity
// // countedQuantity Int // Actual quantity
// // variance Int // counted - system
// // reason String? @db.Text

// // @@unique([inventoryCountId, productId])
// // }

// // // 14. Cashier Session (Shift management)
// // model Session {
// // id String @id @default(cuid())
// // userId String
// // user User @relation(fields: [userId], references: [id])

// // status SessionStatus @default(OPEN)
// // openedAt DateTime @default(now())
// // closedAt DateTime?

// // openingBalance Decimal @db.Decimal(12, 2) @default(0)
// // closingBalance Decimal? @db.Decimal(12, 2)
// // expectedBalance Decimal? @db.Decimal(12, 2)
// // discrepancy Decimal? @db.Decimal(12, 2)

// // cashSales Decimal @default(0) @db.Decimal(12, 2)
// // cardSales Decimal @default(0) @db.Decimal(12, 2)
// // digitalSales Decimal @default(0) @db.Decimal(12, 2)

// // notes String? @db.Text

// // orders Order[] // Orders during this session

// // @@index([userId, status])
// // @@index([openedAt])
// // }

// // // 15. Purchase Order (Inventory replenishment)
// // model PurchaseOrder {
// // id String @id @default(cuid())
// // poNumber String @unique
// // supplierId String
// // supplier Supplier @relation(fields: [supplierId], references: [id])

// // status String @default("DRAFT") // DRAFT, SENT, RECEIVED, CANCELLED
// // orderDate DateTime @default(now())
// // expectedDate DateTime?
// // receivedDate DateTime?

// // items PurchaseOrderItem[]

// // subTotal Decimal @db.Decimal(12, 2)
// // taxAmount Decimal @db.Decimal(12, 2) @default(0)
// // grandTotal Decimal @db.Decimal(12, 2)

// // createdBy String
// // notes String? @db.Text

// // createdAt DateTime @default(now())
// // updatedAt DateTime @updatedAt

// // @@index([poNumber])
// // @@index([supplierId, status])
// // }

// // model PurchaseOrderItem {
// // id String @id @default(cuid())
// // poId String
// // purchaseOrder PurchaseOrder @relation(fields: [poId], references: [id], onDelete: Cascade)
// // productId String
// // product Product @relation(fields: [productId], references: [id])

// // quantity Int
// // unitCost Decimal @db.Decimal(12, 2)
// // totalCost Decimal @db.Decimal(12, 2)

// // receivedQuantity Int @default(0)

// // @@unique([poId, productId])
// // }

// // // 16. Stock Transfer (Multi-store)
// // model StockTransfer {
// // id String @id @default(cuid())
// // transferNumber String @unique

// // fromStoreId String
// // fromStore Store @relation("FromStore", fields: [fromStoreId], references: [id])
// // toStoreId String
// // toStore Store @relation("ToStore", fields: [toStoreId], references: [id])

// // status String @default("PENDING") // PENDING, IN_TRANSIT, RECEIVED, CANCELLED

// // items StockTransferItem[]

// // requestedBy String
// // approvedBy String?
// // requestedAt DateTime @default(now())
// // completedAt DateTime?

// // notes String? @db.Text

// // @@index([transferNumber])
// // @@index([fromStoreId, toStoreId])
// // }

// // model StockTransferItem {
// // id String @id @default(cuid())
// // transferId String
// // transfer StockTransfer @relation(fields: [transferId], references: [id], onDelete: Cascade)
// // productId String
// // product Product @relation(fields: [productId], references: [id])

// // quantity Int
// // receivedQuantity Int? // Actual received

// // @@unique([transferId, productId])
// // }

// // // 17. Audit Log (Complete traceability)
// // model AuditLog {
// // id String @id @default(cuid())
// // userId String
// // user User @relation(fields: [userId], references: [id])

// // action String // e.g., "ORDER_VOID", "PRICE_CHANGE", "USER_LOGIN"
// // entity String // e.g., "Order", "Product", "User"
// // entityId String // The ID of the affected record

// // oldData Json? // Before change
// // newData Json? // After change
// // changes Json? // Structured diff

// // ipAddress String?
// // userAgent String?

// // createdAt DateTime @default(now())

// // @@index([entity, entityId])
// // @@index([userId, createdAt])
// // @@index([action, createdAt])
// // }

// // // 18. Store Settings (Not a singleton, supports multiple stores)
// // model StoreSetting {
// // id String @id @default(cuid())
// // storeId String?
// // store Store? @relation(fields: [storeId], references: [id])

// // settingKey String
// // settingValue Json
// // description String?

// // updatedBy String
// // updatedAt DateTime @updatedAt

// // @@unique([storeId, settingKey])
// // }

// // // 19. Discount/Promotion
// // model Promotion {
// // id String @id @default(cuid())
// // code String @unique
// // name String
// // description String?

// // discountType String // PERCENTAGE, FIXED_AMOUNT, BUY_ONE_GET_ONE
// // discountValue Decimal @db.Decimal(10, 2)
// // minPurchase Decimal? @db.Decimal(10, 2)

// // applicableProducts Product[] @relation("PromotionProducts")
// // applicableCategories Category[] @relation("PromotionCategories")

// // startDate DateTime
// // endDate DateTime
// // usageLimit Int? // Max number of uses
// // usedCount Int @default(0)
// // perUserLimit Int? // Max per customer

// // isActive Boolean @default(true)

// // createdAt DateTime @default(now())
// // updatedAt DateTime @updatedAt

// // @@index([code, isActive])
// // @@index([startDate, endDate])
// // }

// // // 20. Notification/Alert
// // model Notification {
// // id String @id @default(cuid())
// // userId String
// // user User @relation(fields: [userId], references: [id])

// // type String // LOW_STOCK, PROMOTION, SYSTEM
// // title String
// // message String @db.Text
// // isRead Boolean @default(false)

// // metadata Json?

// // createdAt DateTime @default(now())

// // @@index([userId, isRead])
// // @@index([createdAt])
// // }

// // // ============================================
// // // VIEWS (For reporting - raw SQL in migration)
// // // ============================================

// // // Example: Daily sales summary view would be created via SQL migration

// // // // // This is your Prisma schema file,
// // // // // learn more about it in the docs: https://pris.ly/d/prisma-schema

// // // // // Get a free hosted Postgres database in seconds: `npx create-db`

// // // // generator client {
// // // // provider = "prisma-client-js"
// // // // }

// // // // datasource db {
// // // // provider = "postgresql"
// // // // }

// // // generator client {
// // // provider = "prisma-client-js"
// // // }

// // // datasource db {
// // // provider = "postgresql"
// // // }

// // // // =========================================================
// // // // 1. User & Authentication
// // // // =========================================================

// // // model User {
// // // id String @id @default(cuid())
// // // username String @unique
// // // email String @unique
// // // googleId String? @unique // for google oauth
// // // password String?

// // // role Role @default(USER)

// // // firstName String?
// // // lastName String?
// // // phoneNumber String?
// // // birthdate DateTime?
// // // bio String?

// // // avatarUrl String?
// // // verified Boolean @default(false)

// // // createdAt DateTime @default(now())
// // // updatedAt DateTime @updatedAt

// // // // Relationships
// // // cart Cart? // One-to-one relationship with the user's current shopping cart
// // // orders Order[] // One-to-many relationship with all placed orders

// // // emailVerificationTokens EmailVerificationToken[]
// // // passwordResetTokens PasswordResetToken[]

// // // addresses Address[]
// // // reviews Review[]

// // // @@map("users")
// // // }

// // // model Address {
// // // id String @id @default(cuid())
// // // street String
// // // city String
// // // state String?
// // // country String
// // // postalCode String
// // // isDefault Boolean @default(false)

// // // createdAt DateTime @default(now())
// // // updatedAt DateTime @updatedAt

// // // userId String
// // // user User @relation(fields: [userId], references: [id], onDelete: Cascade)

// // // ordersShipping Order[]

// // // @@map("addresses")
// // // }

// // // model Review {
// // // id String @id @default(cuid())
// // // rating Int
// // // comment String? @db.Text
// // // createdAt DateTime @default(now())
// // // updatedAt DateTime @updatedAt

// // // // relationships
// // // userId String
// // // user User @relation(fields: [userId], references: [id], onDelete: Cascade)
// // // productId String
// // // product Product @relation(fields: [productId], references: [id], onDelete: Cascade)

// // // @@map("reviews")
// // // }

// // // enum Role {
// // // USER
// // // EDITOR
// // // ADMIN
// // // }

// // // model PasswordResetToken {
// // // id String @id @default(cuid())
// // // token String @unique
// // // userId String
// // // user User @relation(fields: [userId], references: [id], onDelete: Cascade)
// // // expiresAt DateTime
// // // createdAt DateTime @default(now())

// // // @@map("password_reset_tokens")
// // // }

// // // model EmailVerificationToken {
// // // id String @id @default(cuid())
// // // token String @unique
// // // userId String
// // // user User @relation(fields: [userId], references: [id], onDelete: Cascade)
// // // expiresAt DateTime
// // // createdAt DateTime @default(now())

// // // @@map("email_verification_tokens")
// // // }

// // // // =========================================================
// // // // 2. Product Catalog
// // // // =========================================================

// // // model Product {
// // // id String @id @default(cuid())
// // // name String
// // // description String?
// // // price Decimal @db.Decimal(10, 2)
// // // stock Int
// // // imageUrl String?

// // // createdAt DateTime @default(now())
// // // updatedAt DateTime @updatedAt

// // // // Relationships
// // // cartItems CartItem[]
// // // orderItems OrderItem[]
// // // reviews Review[]

// // // @@map("products")
// // // }

// // // // =========================================================
// // // // 3. Shopping Cart (Pre-Checkout)
// // // // =========================================================

// // // model Cart {
// // // id String @id @default(cuid())

// // // createdAt DateTime @default(now())
// // // updatedAt DateTime @updatedAt

// // // // Relationships
// // // userId String @unique
// // // user User @relation(fields: [userId], references: [id], onDelete: Cascade)

// // // items CartItem[] // Items currently in the cart

// // // @@map("carts")
// // // }

// // // model CartItem {
// // // id String @id @default(cuid())
// // // quantity Int

// // // createdAt DateTime @default(now())
// // // updatedAt DateTime @updatedAt

// // // // Relationships
// // // cartId String
// // // cart Cart @relation(fields: [cartId], references: [id], onDelete: Cascade)
// // // productId String
// // // product Product @relation(fields: [productId], references: [id], onDelete: Cascade)

// // // @@unique([cartId, productId])
// // // @@map("cart_items")
// // // }

// // // // =========================================================
// // // // 4. Order & Checkout (Post-Checkout)
// // // // =========================================================

// // // model Order {
// // // id String @id @default(cuid())
// // // status OrderStatus @default(PENDING)
// // // totalAmount Decimal @db.Decimal(10, 2)
// // // shippingAddress Json?

// // // createdAt DateTime @default(now())
// // // updatedAt DateTime @updatedAt

// // // // Relationships
// // // userId String
// // // user User @relation(fields: [userId], references: [id], onDelete: SetNull)

// // // addressId String?
// // // address Address? @relation(fields: [addressId], references: [id], onDelete: SetNull)
// // // items OrderItem[]

// // // @@map("orders")
// // // }

// // // model OrderItem {
// // // id String @id @default(cuid())
// // // productName String
// // // price Decimal @db.Decimal(10, 2)
// // // quantity Int

// // // createdAt DateTime @default(now())
// // // updatedAt DateTime @updatedAt

// // // // Relationships
// // // orderId String
// // // order Order @relation(fields: [orderId], references: [id], onDelete: Cascade)
// // // productId String?
// // // product Product? @relation(fields: [productId], references: [id], onDelete: SetNull)

// // // @@map("order_items")
// // // }

// // // enum OrderStatus {
// // // PENDING
// // // PAID
// // // SHIPPED
// // // DELIVERED
// // // CANCELLED
// // // }

// // // model ProcessedWebhookEvent {
// // // id String @id // Stripe event ID
// // // createdAt DateTime @default(now())

// // // @@map("processed_webhook_events")
// // // }


// ============================================
// PRODUCTION-GRADE MULTI-TENANT ERP & POS ENGINE
// ============================================

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
}

// ============================================
// SYSTEM CORE & TENANCY
// ============================================

model Tenant {
  id                 String            @id @default(cuid())
  companyName        String
  businessType       String?
  isActive           Boolean           @default(true)

  subscriptionPlanId String?
  subscriptionPlan   SubscriptionPlan? @relation(fields: [subscriptionPlanId], references: [id])

  // Storage Metrics for Plan Enforcement
  currentStoreCount    Int             @default(0)
  currentProductCount  Int             @default(0)

  // Global Structural Downlinks
  stores             Store[]
  users              User[]
  customers          Customer[]
  suppliers          Supplier[]
  products           Product[]
  categories         Category[]
  promotions         Promotion[]
  taxRates           TaxRate[]
  loyaltyTiers       LoyaltyTier[]
  chatRooms          ChatRoom[]
  financialLedgers   FinancialLedger[]

  createdAt          DateTime          @default(now())
  updatedAt          DateTime          @updatedAt
}

model SubscriptionPlan {
  id              String          @id @default(cuid())
  name            String
  description     String?
  price           Decimal         @db.Decimal(12, 2)
  currency        String          @default("MMK")
  isActive        Boolean         @default(true)

  // Resource Caps (null = unlimited)
  maxStores       Int?            @default(1)
  maxPOSPerStore  Int?            @default(1)
  maxProducts     Int?            @default(50)
  maxInvoicesMonth Int?           @default(500)

  tenants         Tenant[]
  createdAt       DateTime        @default(now())
  updatedAt       DateTime        @updatedAt
}

model Store {
  id              String          @id @default(cuid())
  tenantId        String
  tenant          Tenant          @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  code            String          // Unique code inside the specific tenant workspace (e.g., "BR-01")
  name            String
  address         String?
  phone           String?
  email           String?
  taxNumber       String?
  isActive        Boolean         @default(true)

  // Relations
  storeUsers         StoreUser[]
  storeSettings      StoreSetting[]
  deviceRegisters    DeviceRegister[]
  storeInventories   StoreInventory[]
  productBatches     ProductBatch[]
  stockMovements     StockMovement[]
  inventoryCounts    InventoryCount[]
  transfersFrom      StockTransfer[]      @relation("FromStore")
  transfersTo        StockTransfer[]      @relation("ToStore")
  orders             Order[]
  sessions           Session[]
  purchaseOrders     PurchaseOrder[]
  permissionOverrides PermissionOverride[]
  financialLedgers   FinancialLedger[]

  createdAt       DateTime        @default(now())
  updatedAt       DateTime        @updatedAt

  @@unique([tenantId, code])
  @@index([tenantId])
}

model StoreUser {
  storeId    String
  store      Store    @relation(fields: [storeId], references: [id], onDelete: Cascade)
  userId     String
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  assignedAt DateTime @default(now())
  isPrimary  Boolean  @default(false)

  @@id([storeId, userId])
  @@index([userId])
}

// ============================================
// IAM & ACCOUNT SECURITY
// ============================================

model User {
  id              String          @id @default(cuid())
  tenantId        String
  tenant          Tenant          @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  username        String          @unique
  email           String?
  passwordHash    String
  name            String
  role            Role            @default(CASHIER)
  permissions     Permission[]    @default([])
  isActive        Boolean         @default(true)

  // Session Security Logging
  lastLoginAt     DateTime?
  lastLoginIP     String?

  // Relations
  security            UserSecurity?
  stores              StoreUser[]
  orders              Order[]
  stockMovements      StockMovement[]
  auditLogs           AuditLog[]
  sessions            Session[]
  notifications       Notification[]
  createdCounts       InventoryCount[]     @relation("CreatedByUser")
  approvedCounts      InventoryCount[]     @relation("ApprovedByUser")
  requestedTransfers  StockTransfer[]      @relation("RequestedByUser")
  approvedTransfers   StockTransfer[]      @relation("ApprovedByUser")
  requestedOverrides  PermissionOverride[] @relation("CashierRequest")
  approvedOverrides   PermissionOverride[] @relation("ManagerApproval")
  chatParticipants    ChatParticipant[]
  chatMessages        ChatMessage[]

  deletedAt       DateTime?
  createdAt       DateTime        @default(now())
  updatedAt       DateTime        @updatedAt

  @@unique([tenantId, email])
  @@index([tenantId])
  @@index([role, isActive])
}

model UserSecurity {
  id                  String    @id @default(cuid())
  userId              String    @unique
  user                User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  twoFactorEnabled    Boolean   @default(false)
  twoFactorSecret     String?
  backupCodes         Json?

  resetTokenHash      String?   @unique
  resetTokenExp       DateTime?

  failedLoginAttempts Int       @default(0)
  lockoutUntil        DateTime?
}

model VerificationToken {
  id        String    @id @default(cuid())
  target    String    // Phone or Email target route
  tokenHash String    // Cryptographic hash check payload
  type      TokenType
  expiresAt DateTime
  createdAt DateTime  @default(now())

  @@unique([target, type])
  @@index([tokenHash])
}

model DeviceRegister {
  id            String    @id @default(cuid())
  storeId       String
  store         Store     @relation(fields: [storeId], references: [id], onDelete: Cascade)

  deviceUuid    String    @unique
  name          String
  isActive      Boolean   @default(true)
  trustedToken  String    @unique
  pushToken     String?

  sessions      Session[]
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  @@index([storeId])
}

model PermissionOverride {
  id            String     @id @default(cuid())
  storeId       String
  store         Store      @relation(fields: [storeId], references: [id], onDelete: Cascade)

  cashierId     String
  cashier       User       @relation("CashierRequest", fields: [cashierId], references: [id])
  managerId     String
  manager       User       @relation("ManagerApproval", fields: [managerId], references: [id])

  permission    Permission
  reason        String
  expiresAt     DateTime
  isUsed        Boolean    @default(false)
  createdAt     DateTime   @default(now())

  @@index([cashierId])
  @@index([expiresAt])
}

// ============================================
// CORE CATALOG & TAXATION
// ============================================

model Category {
  id          String     @id @default(cuid())
  tenantId    String
  tenant      Tenant     @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  name        String
  slug        String
  description String?
  parentId    String?
  parent      Category?  @relation("CategoryHierarchy", fields: [parentId], references: [id], onDelete: Restrict)
  children    Category[] @relation("CategoryHierarchy")

  products    Product[]
  promotions  PromotionCategory[]
  isActive    Boolean    @default(true)
  sortOrder   Int        @default(0)

  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt

  @@unique([tenantId, slug])
  @@index([parentId])
  @@index([tenantId])
}

model TaxRate {
  id          String    @id @default(cuid())
  tenantId    String
  tenant      Tenant    @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  name        String    // e.g., "Commercial Tax" or "VAT"
  percentage  Decimal   @db.Decimal(5, 2) // e.g., 5.00
  isActive    Boolean   @default(true)

  products    Product[]
  orderItems  OrderItem[]
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  @@index([tenantId])
}

model Product {
  id          String    @id @default(cuid())
  tenantId    String
  tenant      Tenant    @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  name        String
  description String?   @db.Text
  brand       String?

  categoryId  String
  category    Category  @relation(fields: [categoryId], references: [id])
  taxRateId   String
  taxRate     TaxRate   @relation(fields: [taxRateId], references: [id])

  variants    ProductVariant[]
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  @@index([tenantId, categoryId])
}

model ProductVariant {
  id             String    @id @default(cuid())
  productId      String
  product        Product   @relation(fields: [productId], references: [id], onDelete: Cascade)

  sku            String    @unique
  barcode        String?   @unique
  name           String    // e.g., "S - Red" or "Standard Pack"

  // Pricing Metrics
  costPrice      Decimal   @db.Decimal(12, 2)
  sellingPrice   Decimal   @db.Decimal(12, 2)
  wholesalePrice Decimal?  @db.Decimal(12, 2)

  weight         Float?
  volume         Float?
  isActive       Boolean   @default(true)

  // Downstream Operational Pipelines
  inventories        StoreInventory[]
  batches            ProductBatch[]
  orderItems         OrderItem[]
  stockMovements     StockMovement[]
  inventoryItems     InventoryCountItem[]
  stockTransferItems StockTransferItem[]
  purchaseOrderItems PurchaseOrderItem[]
  promotionProducts  PromotionProduct[]
  priceHistories     PriceHistory[]

  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  @@index([productId])
}

model PriceHistory {
  id               String         @id @default(cuid())
  productVariantId String
  variant          ProductVariant @relation(fields: [productVariantId], references: [id], onDelete: Cascade)
  oldPrice         Decimal        @db.Decimal(12, 2)
  newPrice         Decimal        @db.Decimal(12, 2)
  changedBy        String
  reason           String?
  changedAt        DateTime       @default(now())

  @@index([productVariantId, changedAt])
}

// ============================================
// MATERIAL LOGISTICS & INVENTORY MATRIX
// ============================================

model StoreInventory {
  id               String         @id @default(cuid())
  storeId          String
  store            Store          @relation(fields: [storeId], references: [id], onDelete: Cascade)
  productVariantId String
  variant          ProductVariant @relation(fields: [productVariantId], references: [id], onDelete: Cascade)

  stockQuantity    Int            @default(0)
  reservedQuantity Int            @default(0)
  reorderPoint     Int            @default(10)
  reorderQuantity  Int            @default(50)
  maxStockLevel    Int?

  @@unique([storeId, productVariantId])
  @@index([storeId])
}

model ProductBatch {
  id               String         @id @default(cuid())
  storeId          String
  store            Store          @relation(fields: [storeId], references: [id], onDelete: Cascade)
  productVariantId String
  variant          ProductVariant @relation(fields: [productVariantId], references: [id], onDelete: Cascade)

  batchNumber      String         // Vendor lot tracking strings
  quantity         Int            @default(0)
  costPrice        Decimal        @db.Decimal(12, 2)

  manufactureDate  DateTime?
  expiryDate       DateTime       // Key field for real-time alerting layouts
  createdAt        DateTime       @default(now())

  @@unique([storeId, productVariantId, batchNumber])
  @@index([expiryDate])
}

model StockMovement {
  id               String         @id @default(cuid())
  storeId          String
  store            Store          @relation(fields: [storeId], references: [id], onDelete: Cascade)
  productVariantId String
  variant          ProductVariant @relation(fields: [productVariantId], references: [id], onDelete: Cascade)

  userId           String
  user             User           @relation(fields: [userId], references: [id])

  quantity         Int            // Positive on stock-in, negative on stock-out actions
  previousStock    Int
  newStock         Int

  type             MovementType
  referenceId      String         // ID linking back to Invoice, PO, or Transfer sheets
  referenceType    String         // Type reference token (e.g., "ORDER", "PURCHASE_ORDER")
  reason           String?        @db.Text
  createdAt        DateTime       @default(now())

  @@index([storeId, productVariantId])
  @@index([type, createdAt])
}

// ============================================
// RELATION MANAGEMENT (CRM & SRM BOLD SYSTEMS)
// ============================================

model LoyaltyTier {
  id             String     @id @default(cuid())
  tenantId       String
  tenant         Tenant     @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  name           String     // e.g., "BRONZE", "GOLD"
  minPoints      Int        @default(0)
  multiplier     Decimal    @db.Decimal(3, 2) @default(1.00)

  customers      Customer[]
  createdAt      DateTime   @default(now())
  updatedAt      DateTime   @updatedAt

  @@unique([tenantId, name])
}

model Customer {
  id             String       @id @default(cuid())
  tenantId       String
  tenant         Tenant       @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  code           String
  name           String
  phone          String?
  email          String?
  address        String?      @db.Text
  dateOfBirth    DateTime?

  loyaltyPoints  Int          @default(0)
  totalSpent     Decimal      @default(0) @db.Decimal(12, 2)

  loyaltyTierId  String
  loyaltyTier    LoyaltyTier  @relation(fields: [loyaltyTierId], references: [id])

  // Relations
  orders           Order[]
  returns          Return[]
  financialLedgers FinancialLedger[]

  isActive       Boolean      @default(true)
  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt

  @@unique([tenantId, code])
  @@unique([tenantId, phone])
  @@index([tenantId])
}

model Supplier {
  id             String          @id @default(cuid())
  tenantId       String
  tenant         Tenant          @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  code           String
  name           String
  contactName    String?
  phone          String?
  email          String?
  address        String?

  paymentTermsDays Int           @default(0) // e.g., Net 30 terms
  creditLimit      Decimal       @db.Decimal(12, 2) @default(0)

  // Relations
  purchaseOrders   PurchaseOrder[]
  financialLedgers FinancialLedger[]

  isActive       Boolean         @default(true)
  createdAt      DateTime        @default(now())
  updatedAt      DateTime        @updatedAt

  @@unique([tenantId, code])
  @@index([tenantId])
}

// ============================================
// POS CASHIER OPERATIONS & RETAIL PIPELINES
// ============================================

model Session {
  id              String        @id @default(cuid())
  storeId         String
  store           Store         @relation(fields: [storeId], references: [id], onDelete: Cascade)
  userId          String
  user            User          @relation(fields: [userId], references: [id])
  deviceRegisterId String
  deviceRegister  DeviceRegister @relation(fields: [deviceRegisterId], references: [id])

  status          SessionStatus @default(OPEN)
  openedAt        DateTime      @default(now())
  closedAt        DateTime?

  openingBalance  Decimal       @db.Decimal(12, 2) @default(0)
  closingBalance  Decimal?      @db.Decimal(12, 2)
  expectedBalance Decimal?      @db.Decimal(12, 2)
  discrepancy     Decimal?      @db.Decimal(12, 2)

  orders          Order[]
  createdAt       DateTime      @default(now())

  @@index([userId, status])
}

model Order {
  id              String         @id @default(cuid())
  storeId         String
  store           Store          @relation(fields: [storeId], references: [id], onDelete: Cascade)
  userId          String
  user            User           @relation(fields: [userId], references: [id])
  sessionId       String?
  session         Session?       @relation(fields: [sessionId], references: [id])
  customerId      String?
  customer        Customer?      @relation(fields: [customerId], references: [id])

  orderNumber     String         @unique
  status          OrderStatus    @default(PENDING)
  paymentStatus   PaymentStatus  @default(UNPAID)

  subTotal        Decimal        @db.Decimal(12, 2)
  taxAmount       Decimal        @db.Decimal(12, 2) @default(0)
  discountAmount  Decimal        @db.Decimal(12, 2) @default(0)
  grandTotal      Decimal        @db.Decimal(12, 2)
  paidAmount      Decimal        @db.Decimal(12, 2) @default(0)
  dueDate         DateTime?      // Set if terms are active for pay-later accounts

  notes           String?        @db.Text
  voidReason      String?

  items           OrderItem[]
  payments        Payment[]
  orderReturn     Return?
  financialLedgers FinancialLedger[]

  createdAt       DateTime       @default(now())
  updatedAt       DateTime       @updatedAt

  @@index([storeId, status])
  @@index([customerId])
}

model OrderItem {
  id               String         @id @default(cuid())
  orderId          String
  order            Order          @relation(fields: [orderId], references: [id], onDelete: Cascade)
  productVariantId String
  variant          ProductVariant @relation(fields: [productVariantId], references: [id])
  taxRateId        String
  taxRate          TaxRate        @relation(fields: [taxRateId], references: [id])

  quantity         Int
  unitPrice        Decimal        @db.Decimal(12, 2)
  discountAmount   Decimal        @db.Decimal(12, 2) @default(0)
  taxAmount        Decimal        @db.Decimal(12, 2)
  subTotal         Decimal        @db.Decimal(12, 2) // Matrix totals inclusive of tax adjustments

  returnItems      ReturnItem[]

  @@unique([orderId, productVariantId])
}

model Payment {
  id              String        @id @default(cuid())
  orderId         String
  order           Order         @relation(fields: [orderId], references: [id], onDelete: Cascade)

  amount          Decimal       @db.Decimal(12, 2)
  method          PaymentMethod
  referenceNumber String?       // Slip verification ID or credit transaction lookup string
  status          String        @default("COMPLETED")

  processedBy     String
  processedAt     DateTime      @default(now())

  @@index([orderId])
}

model Return {
  id              String       @id @default(cuid())
  orderId         String       @unique
  order           Order        @relation(fields: [orderId], references: [id])
  customerId      String?
  customer        Customer?    @relation(fields: [customerId], references: [id])

  returnNumber    String       @unique
  totalRefunded   Decimal      @db.Decimal(12, 2)
  reason          String       @db.Text
  approvedBy      String

  items           ReturnItem[]
  createdAt       DateTime     @default(now())
}

model ReturnItem {
  id              String    @id @default(cuid())
  returnId        String
  return          Return    @relation(fields: [returnId], references: [id], onDelete: Cascade)
  orderItemId     String
  orderItem       OrderItem @relation(fields: [orderItemId], references: [id])

  quantity        Int
  refundAmount    Decimal   @db.Decimal(12, 2)

  @@unique([returnId, orderItemId])
}

// ============================================
// PROCUREMENT & SUPPLY TRANSFER LOGISTICS
// ============================================

model PurchaseOrder {
  id              String              @id @default(cuid())
  storeId         String
  store           Store               @relation(fields: [storeId], references: [id], onDelete: Cascade)
  supplierId      String
  supplier        Supplier            @relation(fields: [supplierId], references: [id])

  poNumber        String              @unique
  status          PurchaseOrderStatus @default(DRAFT)
  paymentStatus   PaymentStatus       @default(UNPAID)

  subTotal        Decimal             @db.Decimal(12, 2)
  taxAmount       Decimal             @db.Decimal(12, 2) @default(0)
  grandTotal      Decimal             @db.Decimal(12, 2)
  paidAmount      Decimal             @db.Decimal(12, 2) @default(0)

  items           PurchaseOrderItem[]
  financialLedgers FinancialLedger[]

  createdBy       String
  expectedDate    DateTime?
  receivedDate    DateTime?
  createdAt       DateTime            @default(now())
  updatedAt       DateTime            @updatedAt

  @@index([storeId])
}

model PurchaseOrderItem {
  id               String         @id @default(cuid())
  poId             String
  purchaseOrder    PurchaseOrder  @relation(fields: [poId], references: [id], onDelete: Cascade)
  productVariantId String
  variant          ProductVariant @relation(fields: [productVariantId], references: [id])

  quantity         Int
  receivedQuantity Int            @default(0)
  unitCost         Decimal        @db.Decimal(12, 2)
  totalCost        Decimal        @db.Decimal(12, 2)

  @@unique([poId, productVariantId])
}

model StockTransfer {
  id              String          @id @default(cuid())
  transferNumber  String          @unique

  fromStoreId     String
  fromStore       Store           @relation("FromStore", fields: [fromStoreId], references: [id])
  toStoreId       String
  toStore         Store           @relation("ToStore", fields: [toStoreId], references: [id])

  status          TransferStatus  @default(PENDING)
  items           StockTransferItem[]

  requestedById   String
  requestedBy     User            @relation("RequestedByUser", fields: [requestedById], references: [id])
  approvedById    String?
  approvedBy      User?           @relation("ApprovedByUser", fields: [approvedById], references: [id])

  requestedAt     DateTime        @default(now())
  completedAt     DateTime?

  @@index([fromStoreId, toStoreId])
}

model StockTransferItem {
  id               String         @id @default(cuid())
  transferId       String
  transfer         StockTransfer  @relation(fields: [transferId], references: [id], onDelete: Cascade)
  productVariantId String
  variant          ProductVariant @relation(fields: [productVariantId], references: [id])

  quantity         Int
  receivedQuantity Int?

  @@unique([transferId, productVariantId])
}

model InventoryCount {
  id              String            @id @default(cuid())
  countNumber     String            @unique
  storeId         String
  store           Store             @relation(fields: [storeId], references: [id], onDelete: Cascade)
  status          StockCountStatus  @default(DRAFT)

  scheduledDate   DateTime
  completedDate   DateTime?
  items           InventoryCountItem[]

  createdBy       String
  createdUser     User              @relation("CreatedByUser", fields: [createdBy], references: [id])
  approvedBy      String?
  approvedUser    User?             @relation("ApprovedByUser", fields: [approvedBy], references: [id])

  createdAt       DateTime          @default(now())
  updatedAt       DateTime          @updatedAt
}

model InventoryCountItem {
  id               String         @id @default(cuid())
  inventoryCountId String
  inventoryCount   InventoryCount @relation(fields: [inventoryCountId], references: [id], onDelete: Cascade)
  productVariantId String
  variant          ProductVariant @relation(fields: [productVariantId], references: [id])

  systemQuantity   Int
  countedQuantity  Int
  variance         Int

  @@unique([inventoryCountId, productVariantId])
}

// ============================================
// FINANCIAL LEDGERS (DOUBLE-ENTRY SYSTEMS)
// ============================================

model FinancialLedger {
  id              String      @id @default(cuid())
  tenantId        String
  tenant          Tenant      @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  storeId         String
  store           Store       @relation(fields: [storeId], references: [id], onDelete: Cascade)

  accountType     AccountType
  entryType       LedgerType  // DEBIT or CREDIT
  amount          Decimal     @db.Decimal(12, 2)

  // Dynamic Target Offsets
  customerId      String?
  customer        Customer?   @relation(fields: [customerId], references: [id])
  supplierId      String?
  supplier        Supplier?   @relation(fields: [supplierId], references: [id])

  // Document Mappings
  orderId         String?
  order           Order?      @relation(fields: [orderId], references: [id])
  purchaseOrderId String?
  purchaseOrder   PurchaseOrder? @relation(fields: [purchaseOrderId], references: [id])

  description     String?
  createdAt       DateTime    @default(now())

  @@index([tenantId, accountType])
  @@index([customerId])
  @@index([supplierId])
}

// ============================================
// COMMUNICATION CHANNELS & AUDITS
// ============================================

model ChatRoom {
  id              String            @id @default(cuid())
  tenantId        String
  tenant          Tenant            @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  name            String?
  isGroup         Boolean           @default(false)

  participants    ChatParticipant[]
  messages        ChatMessage[]
  createdAt       DateTime          @default(now())
}

model ChatParticipant {
  id          String   @id @default(cuid())
  roomId      String
  room        ChatRoom @relation(fields: [roomId], references: [id], onDelete: Cascade)
  userId      String
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  joinedAt    DateTime @default(now())

  @@unique([roomId, userId])
}

model ChatMessage {
  id          String   @id @default(cuid())
  roomId      String
  room        ChatRoom @relation(fields: [roomId], references: [id], onDelete: Cascade)
  senderId    String
  sender      User     @relation(fields: [senderId], references: [id], onDelete: Cascade)

  content     String   @db.Text
  attachments Json?
  createdAt   DateTime @default(now())

  @@index([roomId, createdAt])
}

model StoreSetting {
  id              String    @id @default(cuid())
  storeId         String
  store           Store     @relation(fields: [storeId], references: [id], onDelete: Cascade)
  settingKey      String
  settingValue    Json
  updatedAt       DateTime  @updatedAt

  @@unique([storeId, settingKey])
}

model Promotion {
  id              String    @id @default(cuid())
  tenantId        String
  tenant          Tenant    @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  code            String
  name            String
  discountType    String
  discountValue   Decimal   @db.Decimal(10, 2)
  startDate       DateTime
  endDate         DateTime
  isActive        Boolean   @default(true)

  products        PromotionProduct[]
  categories      PromotionCategory[]

  @@unique([tenantId, code])
}

model PromotionProduct {
  promotionId      String
  promotion        Promotion      @relation(fields: [promotionId], references: [id], onDelete: Cascade)
  productVariantId String
  variant          ProductVariant @relation(fields: [productVariantId], references: [id], onDelete: Cascade)

  @@id([promotionId, productVariantId])
}

model PromotionCategory {
  promotionId   String
  promotion     Promotion @relation(fields: [promotionId], references: [id], onDelete: Cascade)
  categoryId    String
  category      Category  @relation(fields: [categoryId], references: [id], onDelete: Cascade)

  @@id([promotionId, categoryId])
}

model AuditLog {
  id              String   @id @default(cuid())
  userId          String
  user            User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  action          String
  entity          String
  entityId        String
  oldData         Json?
  newData         Json?
  ipAddress       String?
  createdAt       DateTime @default(now())
}

model Notification {
  id              String    @id @default(cuid())
  userId          String
  user            User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  title           String
  message         String    @db.Text
  isRead          Boolean   @default(false)
  createdAt       DateTime  @default(now())

  @@index([userId, isRead])
}

// ============================================
// SYSTEM ENUMS ARCHITECTURE
// ============================================

enum Role {
  SYSTEM_OWNER
  ADMIN
  MANAGER
  CASHIER
  ACCOUNTANT
  LOGISTICS
}

enum Permission {
  VIEW_REPORTS
  EDIT_PRICES
  VOID_ORDERS
  MANAGE_STAFF
  MANAGE_INVENTORY
  REFUND_ORDERS
  VIEW_AUDIT_LOGS
  APPROVE_TRANSFERS
}

enum PaymentMethod {
  CASH
  KBZ_PAY
  CB_PAY
  WAVE_PAY
  CARD
  CREDIT_ACCOUNT
}

enum OrderStatus {
  PENDING
  COMPLETED
  CANCELLED
  VOIDED
  REFUNDED
}

enum PaymentStatus {
  PAID
  PARTIALLY_PAID
  UNPAID
}

enum PurchaseOrderStatus {
  DRAFT
  SENT
  PARTIALLY_RECEIVED
  RECEIVED
  CANCELLED
}

enum TransferStatus {
  PENDING
  IN_TRANSIT
  COMPLETED
  CANCELLED
}

enum MovementType {
  PURCHASE
  SALE
  RETURN_IN
  RETURN_OUT
  ADJUSTMENT
  DAMAGE
  EXPIRED
  TRANSFER_IN
  TRANSFER_OUT
}

enum StockCountStatus {
  DRAFT
  IN_PROGRESS
  COMPLETED
  CANCELLED
}

enum SessionStatus {
  OPEN
  CLOSED
}

enum TokenType {
  RESET_PASSWORD
  LOGIN_OTP
  EMAIL_VERIFICATION
}

enum LedgerType {
  DEBIT
  CREDIT
}

enum AccountType {
  ACCOUNTS_RECEIVABLE // Customer debt mapping tracks
  ACCOUNTS_PAYABLE    // Supplier procurement billing tracking
  CASH_DRAWER
  BANK_ACCOUNT
  REVENUE
  COGS
  EXPENSE
} -->
