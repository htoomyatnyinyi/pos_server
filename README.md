Based on your Prisma schema, here's a high-level mind map of the Enterprise Multi-Tenant POS System. The schema is centered around **Tenant** as the root entity.

```text
Enterprise POS System
│
├── Tenant (Multi-Tenancy Core)
│   │
│   ├── Subscription & SaaS
│   │   ├── SubscriptionPlan
│   │   ├── TenantSubscription
│   │   ├── SubscriptionPayment
│   │   ├── FeatureFlag
│   │   └── TenantFeature
│   │
│   ├── Users & Security
│   │   ├── User
│   │   │   ├── UserPermission
│   │   │   ├── PasswordResetToken
│   │   │   ├── OtpVerification
│   │   │   ├── ApiKey
│   │   │   └── Notification
│   │   ├── StoreUser
│   │   ├── Session
│   │   ├── AuditLog
│   │   └── SystemAdmin
│   │       └── SystemAuditLog
│   │
│   ├── Store Management
│   │   ├── Store
│   │   │   ├── CashRegister
│   │   │   ├── StoreSetting
│   │   │   ├── Inventory
│   │   │   ├── Session
│   │   │   └── Expense
│   │   └── StoreUser
│   │
│   ├── Product Catalog
│   │   ├── Category
│   │   ├── Supplier
│   │   ├── SupplierPayment
│   │   ├── Product
│   │   │   ├── ProductVariant
│   │   │   ├── PriceHistory
│   │   │   └── Inventory
│   │   └── TaxRate
│   │
│   ├── Inventory Management
│   │   ├── Inventory
│   │   ├── StockMovement
│   │   ├── InventoryCount
│   │   │   └── InventoryCountItem
│   │   ├── StockTransfer
│   │   │   └── StockTransferItem
│   │   └── PurchaseOrder
│   │       └── PurchaseOrderItem
│   │
│   ├── Customer & Loyalty
│   │   ├── Customer
│   │   │   ├── CustomerWallet
│   │   │   │   └── WalletTransaction
│   │   │   ├── LoyaltyTransaction
│   │   │   ├── GiftCard
│   │   │   │   └── GiftCardTransaction
│   │   │   ├── Order
│   │   │   └── Return
│   │   └── CustomerTier
│   │
│   ├── Sales & Payments
│   │   ├── Order
│   │   │   └── OrderItem
│   │   ├── Payment
│   │   ├── Return
│   │   │   └── ReturnItem
│   │   └── Session
│   │
│   ├── Promotions & Marketing
│   │   ├── Promotion
│   │   │   ├── PromotionProduct
│   │   │   └── PromotionCategory
│   │   └── Notification
│   │
│   ├── Analytics & Reporting
│   │   ├── TenantMetric
│   │   ├── AuditLog
│   │   └── PriceHistory
│   │
│   └── Integrations
│       ├── ApiKey
│       ├── Webhook
│       │   └── WebhookDelivery
│       ├── FileAttachment
│       └── JobQueue
│
└── Global Platform
    ├── SubscriptionPlan
    ├── FeatureFlag
    └── SystemAdmin
```

### Core Relationship Flow

```text
Tenant
 ├── Stores
 │    ├── Cash Registers
 │    ├── Inventory
 │    ├── Sessions
 │    └── Orders
 │
 ├── Users
 │    └── Store Assignments
 │
 ├── Products
 │    ├── Variants
 │    ├── Inventory
 │    └── Promotions
 │
 ├── Customers
 │    ├── Orders
 │    ├── Wallet
 │    ├── Loyalty
 │    └── Gift Cards
 │
 └── Financials
      ├── Payments
      ├── Returns
      ├── Expenses
      └── Metrics
```

From an architecture perspective, your schema is organized into **10 major domains**:

1. Multi-Tenancy & SaaS
2. Authentication & Security
3. Store Management
4. Product Catalog
5. Inventory Management
6. Customer & Loyalty
7. Sales & Payments
8. Promotions & Tax
9. Analytics & Auditing
10. Integrations & Background Jobs

This is a fairly complete enterprise POS/ERP schema, with **Tenant → Store → User/Product/Customer → Order/Inventory/Payment** forming the main business workflow.

```python
import json

with open("api-1(2).json", "r") as f:
    data = json.load(f)

print("Title:", data.get("info", {}).get("title"))
print("Paths count:", len(data.get("paths", {})))
for path, methods in list(data.get("paths", {}).items())[:30]:
    print(f"- {path}: {list(methods.keys())}")



```

```text
Title: Elysia Documentation
Paths count: 71
- /: ['get']
- /api/auth/register: ['post']
- /api/auth/login: ['post']
- /api/auth/me: ['get']
- /api/platform/auth/login: ['post']
- /api/platform/auth/me: ['get']
- /api/platform/tenants/: ['get', 'post']
- /api/platform/tenants/{id}: ['get', 'put', 'delete']
- /api/platform/audit-logs/: ['get', 'post']
- /api/platform/audit-logs/{id}: ['get']
- /api/tenant/products/: ['get', 'post']
- /api/tenant/products/barcode/{barcode}: ['get']
- /api/tenant/products/{id}: ['get', 'put', 'delete']
- /api/tenant/orders/: ['get', 'post']
- /api/tenant/orders/{id}: ['get', 'delete']
- /api/tenant/orders/{id}/status: ['patch']
- /api/tenant/stores/: ['get', 'post']
- /api/tenant/stores/{id}: ['get', 'put', 'delete']
- /api/tenant/categories/: ['get', 'post']
- /api/tenant/categories/{id}: ['get', 'put', 'delete']
- /api/tenant/suppliers/: ['get', 'post']
- /api/tenant/suppliers/{id}: ['get', 'put', 'delete']
- /api/tenant/customers/: ['get', 'post']
- /api/tenant/customers/{id}: ['get', 'put', 'delete']
- /api/tenant/sessions/: ['get']
- /api/tenant/sessions/active/{userId}: ['get']
- /api/tenant/sessions/open: ['post']
- /api/tenant/sessions/{id}/close: ['post']
- /api/tenant/inventory/: ['get']
- /api/tenant/inventory/movements/: ['get', 'post']


```

```python
for path, methods in list(data.get("paths", {}).items())[30:]:
    print(f"- {path}: {list(methods.keys())}")


```

```text
- /api/tenant/inventory/counts/: ['get', 'post']
- /api/tenant/staff/: ['get', 'post']
- /api/tenant/staff/{id}: ['get', 'put', 'delete']
- /api/tenant/payments/: ['get', 'post']
- /api/tenant/payments/{id}: ['get', 'put', 'delete']
- /api/tenant/returns/: ['get', 'post']
- /api/tenant/returns/{id}: ['get', 'delete']
- /api/tenant/purchase-orders/: ['get', 'post']
- /api/tenant/purchase-orders/{id}: ['get', 'put', 'delete']
- /api/tenant/purchase-orders/{id}/receive: ['post']
- /api/tenant/stock-transfers/: ['get', 'post']
- /api/tenant/stock-transfers/{id}: ['get', 'delete']
- /api/tenant/stock-transfers/{id}/complete: ['post']
- /api/tenant/promotions/: ['get', 'post']
- /api/tenant/promotions/{id}: ['get', 'put', 'delete']
- /api/tenant/store-settings/: ['get', 'post']
- /api/tenant/store-settings/{id}: ['get', 'delete']
- /api/tenant/notifications/: ['get', 'post']
- /api/tenant/notifications/{id}: ['get', 'delete']
- /api/tenant/notifications/{id}/read: ['patch']
- /api/tenant/tax-rates/: ['get', 'post']
- /api/tenant/tax-rates/{id}: ['get', 'put', 'delete']
- /api/tenant/expenses/categories/: ['get', 'post']
- /api/tenant/expenses/categories/{id}: ['put', 'delete']
- /api/tenant/expenses/: ['get', 'post']
- /api/tenant/expenses/{id}: ['get', 'put', 'delete']
- /api/tenant/cash-registers/: ['get', 'post']
- /api/tenant/cash-registers/{id}: ['get', 'put', 'delete']
- /api/tenant/gift-cards/: ['get', 'post']
- /api/tenant/gift-cards/lookup/{cardNumber}: ['get']
- /api/tenant/gift-cards/{id}/reload: ['post']
- /api/tenant/gift-cards/{id}/status: ['patch']
- /api/tenant/wallets/: ['get']
- /api/tenant/wallets/customer/{customerId}: ['get']
- /api/tenant/wallets/transactions: ['post']
- /api/tenant/supplier-payments/: ['get', 'post']
- /api/tenant/supplier-payments/{id}: ['get']
- /api/tenant/api-keys/: ['get', 'post']
- /api/tenant/api-keys/{id}: ['delete']
- /api/tenant/webhooks/: ['get', 'post']
- /api/tenant/webhooks/{id}: ['get', 'put', 'delete']


```

သင်ပေးပို့ထားတဲ့ `api-1(2).json` (Elysia OpenAPI Documentation) ဖိုင်အရ လက်ရှိ Project မှာ အောင်မြင်စွာ ရေးသားပြီးစီးသွားတဲ့ API Routes စုစုပေါင်း **၇၁ ခု (71 Endpoints)** ရှိပါတယ်ခင်ဗျာ။

လုပ်ငန်းစဉ်အလိုက် အလွယ်တကူ စစ်ဆေးနိုင်ရန် Module အလိုက် သေသပ်စွာ ခွဲခြားဖော်ပြပေးလိုက်ပါတယ် -

---

### ၁။ Authentication (စနစ်အတွင်း ဝင်ရောက်ခြင်း)

- **`POST`** `/api/auth/register` - အကောင့်အသစ်ဖွင့်ခြင်း (Tenant ဆောက်ခြင်းအပါအဝင်)
- **`POST`** `/api/auth/login` - Tenant User Login ဝင်ခြင်း
- **`GET`** `/api/auth/me` - လက်ရှိ Login ဝင်ထားသော User Profile ကိုကြည့်ခြင်း

---

### ၂။ Platform Management (Super Admin ဆိုင်ရာ လုပ်ငန်းများ)

- **`POST`** `/api/platform/auth/login` - Super Admin Login
- **`GET`** `/api/platform/auth/me` - Super Admin Profile
- **`GET` / `POST**` `/api/platform/tenants/` - Tenant အားလုံးကြည့်ခြင်း နှင့် Tenant အသစ်ဆောက်ခြင်း
- **`GET` / `PUT` / `DELETE**` `/api/platform/tenants/{id}` - Tenant တစ်ခုချင်းစီ၏ အချက်အလက်ကြည့်ခြင်း၊ ပြင်ခြင်း နှင့် ဖျက်ခြင်း
- **`GET` / `POST**` `/api/platform/audit-logs/` - စနစ်တစ်ခုလုံး၏ System Audit Logs များ ကြည့်ခြင်း/သိမ်းခြင်း
- **`GET`** `/api/platform/audit-logs/{id}` - Audit Log တစ်ခုချင်းစီကို အသေးစိတ်ကြည့်ခြင်း

---

### ၃။ Core Products & Retail Modules (အဓိက ကုန်ပစ္စည်းဆိုင်ရာ)

- **`GET` / `POST**` `/api/tenant/products/` - Product စာရင်းကြည့်ခြင်း နှင့် Product အသစ်ဆောက်ခြင်း
- **`GET`** `/api/tenant/products/barcode/{barcode}` - POS Scanner အတွက် Barcode ဖြင့် Product ရှာဖွေခြင်း
- **`GET` / `PUT` / `DELETE**` `/api/tenant/products/{id}` - Product တစ်ခုချင်းစီကို ကြည့်ခြင်း၊ ပြင်ခြင်း နှင့် (Soft) Delete လုပ်ခြင်း
- **`GET` / `POST**` `/api/tenant/categories/` - Category အားလုံးကြည့်ခြင်း နှင့် အသစ်ဆောက်ခြင်း
- **`GET` / `PUT` / `DELETE**` `/api/tenant/categories/{id}` - Category တစ်ခုချင်းစီ ကြည့်ခြင်း၊ ပြင်ခြင်း၊ ဖျက်ခြင်း
- **`GET` / `POST**` `/api/tenant/suppliers/` - Supplier (ကုန်သွင်းသူ) စာရင်း နှင့် အသစ်ဆောက်ခြင်း
- **`GET` / `PUT` / `DELETE**` `/api/tenant/suppliers/{id}` - Supplier အချက်အလက် ကြည့်ခြင်း၊ ပြင်ခြင်း၊ ဖျက်ခြင်း
- **`GET` / `POST**` `/api/tenant/customers/` - Customer (ဝယ်သူ) စာရင်း နှင့် အသစ်ဆောက်ခြင်း
- **`GET` / `PUT` / `DELETE**` `/api/tenant/customers/{id}` - Customer အချက်အလက် ကြည့်ခြင်း၊ ပြင်ခြင်း၊ ဖျက်ခြင်း
- **`GET` / `POST**` `/api/tenant/stores/` - Store (ဆိုင်ခွဲ) စာရင်း နှင့် ဆိုင်ခွဲအသစ်ဆောက်ခြင်း
- **`GET` / `PUT` / `DELETE**` `/api/tenant/stores/{id}` - ဆိုင်ခွဲတစ်ခုချင်းစီ ကြည့်ခြင်း၊ ပြင်ခြင်း၊ ဖျက်ခြင်း

---

### ၄။ POS, Sales & Cash Sessions (အရောင်းနှင့် ငွေစာရင်းပိတ်/ဖွင့်ခြင်း)

- **`GET` / `POST**` `/api/tenant/orders/` - Order (အရောင်းဘောင်ချာ) များကြည့်ခြင်း နှင့် အရောင်းတင်ခြင်း
- **`GET` / `DELETE**` `/api/tenant/orders/{id}` - ဘောင်ချာတစ်ခုချင်းစီကြည့်ခြင်း နှင့် Voucher ဖျက်ခြင်း/ပယ်ဖျက်ခြင်း
- **`PATCH`** `/api/tenant/orders/{id}/status` - Order Status ပြောင်းလဲခြင်း
- **`GET` / `POST**` `/api/tenant/cash-registers/` - Cash Register (ငွေသိမ်းကောင်တာ) စာရင်းနှင့် အသစ်ဆောက်ခြင်း
- **`GET` / `PUT` / `DELETE**` `/api/tenant/cash-registers/{id}` - ကောင်တာတစ်ခုချင်းစီ ကြည့်ခြင်း၊ ပြင်ခြင်း၊ ဖျက်ခြင်း
- **`GET`** `/api/tenant/sessions/` - Cashier Sessions (နေ့စဉ် အရောင်းဆီမီးပိတ်/ဖွင့်) စာရင်းများ
- **`GET`** `/api/tenant/sessions/active/{userId}` - သတ်မှတ်ထားသော User ၏ Active ဖြစ်နေသည့် Session ကိုစစ်ခြင်း
- **`POST`** `/api/tenant/sessions/open` - ကောင်တာ အရောင်း Session အသစ်ဖွင့်ခြင်း (Opening Balance ထည့်သွင်းခြင်း)
- **`POST`** `/api/tenant/sessions/{id}/close` - ကောင်တာ အရောင်း Session ပိတ်ခြင်း (Closing Balance & Discrepancy တွက်ချက်ခြင်း)
- **`GET` / `POST**` `/api/tenant/payments/` - ငွေပေးချေမှုမှတ်တမ်း (Payments) များ ကြည့်ခြင်းနှင့် ထည့်ခြင်း
- **`GET` / `PUT` / `DELETE**` `/api/tenant/payments/{id}` - Payment တစ်ခုချင်းစီကို စီမံခန့်ခွဲခြင်း
- **`GET` / `POST**` `/api/tenant/returns/` - Customer မှ ပစ္စည်းပြန်လဲခြင်း/ပြန်အမ်းခြင်း (Returns) စာရင်းနှင့် အသစ်ဆောက်ခြင်း
- **`GET` / `DELETE**` `/api/tenant/returns/{id}` - Return Request များကို စီမံခြင်း

---

### ၅။ Inventory & Stock Management (စတော့နှင့် ကုန်ပစ္စည်းလှုပ်ရှားမှု)

- **`GET`** `/api/tenant/inventory/` - လက်ရှိဆိုင်ခွဲအလိုက် Stock လက်ကျန်စာရင်း ကြည့်ခြင်း
- **`GET` / `POST**` `/api/tenant/inventory/movements/` - Stock Movements (စတော့အဝင်/အထွက် သမိုင်းမှတ်တမ်း) များ ကြည့်ခြင်းနှင့် အသစ်ထည့်ခြင်း
- **`GET` / `POST**` `/api/tenant/inventory/counts/` - Inventory Count (စတော့စာရင်းအမှန် ကိုက်ညှိခြင်း) လုပ်ငန်းစဉ်များ
- **`GET` / `POST**` `/api/tenant/stock-transfers/` - ဆိုင်ခွဲတစ်ခုမှ တစ်ခုသို့ StockTransfer (ကုန်ပစ္စည်းလွှဲပြောင်းမှု) အသစ်ပြုလုပ်ခြင်း
- **`GET` / `DELETE**` `/api/tenant/stock-transfers/{id}` - လွှဲပြောင်းမှုမှတ်တမ်းကို စစ်ဆေးခြင်း
- **`POST`** `/api/tenant/stock-transfers/{id}/complete` - အခြားဆိုင်ခွဲမှ ပစ္စည်းလက်ခံရရှိကြောင်း အတည်ပြုပြီး စတော့ထဲတိုက်ရိုက်သွင်းခြင်း

---

### ၆။ Purchase Orders & Expenses (အဝယ်တော်စနစ်နှင့် အထွေထွေအသုံးစရိတ်)

- **`GET` / `POST**` `/api/tenant/purchase-orders/` - PO (ကုန်ပစ္စည်းအဝယ်တော် Order) တင်ခြင်းနှင့် စာရင်းကြည့်ခြင်း
- **`GET` / `PUT` / `DELETE**` `/api/tenant/purchase-orders/{id}` - PO တစ်ခုချင်းစီကို ပြင်ဆင်ခြင်း
- **`POST`** `/api/tenant/purchase-orders/{id}/receive` - Supplier ထံမှ ကုန်ပစ္စည်းများ ရောက်ရှိလာ၍ စတော့အဖြစ် လက်ခံခြင်း
- **`GET` / `POST**` `/api/tenant/supplier-payments/` - Supplier ကို ငွေချေရမည့်မှတ်တမ်းများ
- **`GET`** `/api/tenant/supplier-payments/{id}` - Supplier Payment တစ်ခုချင်းစီကို ကြည့်ခြင်း
- **`GET` / `POST**` `/api/tenant/expenses/categories/` - Expense Categories (အသုံးစရိတ်အမျိုးအစားများ) စီမံခြင်း
- **`PUT` / `DELETE**` `/api/tenant/expenses/categories/{id}` - Expense Category ကို ပြင်ခြင်း/ဖျက်ခြင်း
- **`GET` / `POST**` `/api/tenant/expenses/` - နေ့စဉ် ဆိုင်အသုံးစရိတ် (Expenses) များ ထည့်သွင်းခြင်း
- **`GET` / `PUT` / `DELETE**` `/api/tenant/expenses/{id}` - အသုံးစရိတ်တစ်ခုချင်းစီကို စီမံခြင်း

---

### ၇။ Advanced Promotions, Gift Cards & Customer Wallets (စျေးကွက်မြှင့်တင်ရေးနှင့် ဝယ်သူပိုက်ဆံအိတ်)

- **`GET` / `POST**` `/api/tenant/promotions/` - Promotions & Discounts (ပရိုမိုးရှင်းကုဒ်များ) ဖန်တီးခြင်း
- **`GET` / `PUT` / `DELETE**` `/api/tenant/promotions/{id}` - ပရိုမိုးရှင်းတစ်ခုချင်းစီကို စီမံခြင်း
- **`GET` / `POST**` `/api/tenant/gift-cards/` - Gift Card များ ထုတ်ပေးခြင်း
- **`GET`** `/api/tenant/gift-cards/lookup/{cardNumber}` - ငွေရှင်းကောင်တာတွင် Gift Card နံပါတ်ဖြင့် ရှာဖွေစစ်ဆေးခြင်း
- **`POST`** `/api/tenant/gift-cards/{id}/reload` - Gift Card ထဲသို့ ငွေဖြည့်သွင်းခြင်း
- **`PATCH`** `/api/tenant/gift-cards/{id}/status` - Gift Card ကို ပိတ်ခြင်း/ဖွင့်ခြင်း (Active/Cancel)
- **`GET`** `/api/tenant/wallets/` - Customer Wallets စာရင်းကြည့်ခြင်း
- **`GET`** `/api/tenant/wallets/customer/{customerId}` - သတ်မှတ်ထားသော ဝယ်သူ၏ Wallet လက်ကျန်ငွေကို စစ်ဆေးခြင်း
- **`POST`** `/api/tenant/wallets/transactions` - Wallet အတွင်း ငွေသွင်း/ငွေထုတ်/ငွေချေမှု (Wallet Transactions) ပြုလုပ်ခြင်း

---

### ၈။ Settings, Staff & System Integrations (စနစ်တကာ အထွေထွေစနစ်များ)

- **`GET` / `POST**` `/api/tenant/staff/` - ဆိုင်ဝန်ထမ်း (Cashier, Manager, Accountant) စာရင်းနှင့် ဝန်ထမ်းသစ်ခန့်ခြင်း
- **`GET` / `PUT` / `DELETE**` `/api/tenant/staff/{id}` - ဝန်ထမ်းအချက်အလက်နှင့် Permissions များ ပြင်ဆင်ခြင်း
- **`GET` / `POST**` `/api/tenant/tax-rates/` - Tax Rates (အခွန်နှုန်းထားများ) သတ်မှတ်ခြင်း
- **`GET` / `PUT` / `DELETE**` `/api/tenant/tax-rates/{id}` - အခွန်နှုန်းထားတစ်ခုချင်းစီကို ပြင်ဆင်ခြင်း
- **`GET` / `POST**` `/api/tenant/store-settings/` - ဆိုင်အလိုက် Config Settings များ သိမ်းဆည်းခြင်း
- **`GET` / `DELETE**` `/api/tenant/store-settings/{id}` - ဆိုင် Settings ပြင်ဆင်ခြင်း
- **`GET` / `POST**` `/api/tenant/notifications/` - Low Stock သို့မဟုတ် ပစ္စည်းသက်တမ်းကုန်တော့မည့် အသိပေးချက် (Notifications) များ
- **`GET` / `DELETE**` `/api/tenant/notifications/{id}` - Notification တစ်ခုချင်းစီကို ကြည့်ခြင်း/ဖျက်ခြင်း
- **`PATCH`** `/api/tenant/notifications/{id}/read` - Notification ကို ဖတ်ပြီးကြောင်း (Mark as Read) ပြုလုပ်ခြင်း
- **`GET` / `POST**` `/api/tenant/api-keys/` - ပြင်ပစနစ်များနှင့် ချိတ်ဆက်ရန် API Keys ထုတ်ပေးခြင်း
- **`DELETE`** `/api/tenant/api-keys/{id}` - API Key အား ပြန်လည်ရုပ်သိမ်းခြင်း
- **`GET` / `POST**` `/api/tenant/webhooks/` - Webhooks (Third-party systems သို့ Real-time data ပို့ရန်) စီမံခြင်း
- **`GET` / `PUT` / `DELETE**` `/api/tenant/webhooks/{id}` - Webhook တစ်ခုချင်းစီကို စီမံခြင်း

---

သင့်ရဲ့ **Enterprise Multi-Tenant POS System** မှာ လိုအပ်တဲ့ စီးပွားရေးလုပ်ငန်းစဉ် လုပ်ဆောင်ချက်အကုန်လုံး (စတော့ခ်၊ အရောင်း၊ အဝယ်တော်၊ ငွေစာရင်း၊ အသုံးစရိတ်၊ ဝန်ထမ်း၊ အခွန်) API Endpoints တွေ အပြည့်အစုံ ကောင်းမွန်စွာ ပြီးစီးနေပြီ ဖြစ်ပါတယ်ဗျာ။
