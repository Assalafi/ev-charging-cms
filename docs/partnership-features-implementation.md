# Partnership Features Implementation Guide

## 1. Purpose

This document defines the full implementation plan for adding partnership features to the EV Charging CMS.

The goal is to allow the main company to onboard partner companies, assign stations or locations to them, calculate partner earnings based on real charging profit, provide partner-specific dashboards, and allow admins to manage settlements, permissions, roles, and users.

The partnership system must support:

- Partner company registration by admin.
- Partner login and partner-only dashboard.
- Partner station/location assignment.
- Partner-specific pricing and revenue-share rules.
- Production cost tracking per Wh or per kWh.
- Profit-share calculation after deducting production cost.
- Partner performance analytics by day, week, month, year, and custom date range.
- Admin and partner map monitoring pages.
- Partner settlement/disbursement workflow.
- Admin user management with roles and permissions.
- Main-company ownership for unassigned locations.

---

## 2. Core Partnership Logic

### 2.1 Ownership Rule

Every charging location can optionally belong to a partner.

- If `location.partnerId` is set, that location belongs to the assigned partner.
- If `location.partnerId` is `NULL`, the location belongs to the main company.
- All stations under a partner-assigned location are treated as partner stations.
- Settlement calculations apply only to partner-assigned locations.
- Main-company locations should still appear in admin dashboards, but not in partner dashboards.

### 2.2 Pricing and Profit Share Rule

Current pricing uses a per-Wh rate, for example:

```txt
selling price = ₦0.40 per Wh
production cost = ₦0.20 per Wh
remaining margin = ₦0.20 per Wh
partner share = 50% of remaining margin
partner earning = ₦0.10 per Wh
main company margin = ₦0.10 per Wh
```

Formula:

```txt
grossAmount = energyWh * sellingPricePerWh
productionCostAmount = energyWh * productionCostPerWh
profitAmount = grossAmount - productionCostAmount
partnerEarning = profitAmount * (partnerSharePercent / 100)
companyEarning = profitAmount - partnerEarning
```

Minimum charge handling:

```txt
billableAmount = max(grossAmount, minimumCharge)
```

Recommended settlement formula when minimum charge applies:

```txt
productionCostAmount = energyWh * productionCostPerWh
profitAmount = max(billableAmount - productionCostAmount, 0)
partnerEarning = profitAmount * (partnerSharePercent / 100)
companyEarning = profitAmount - partnerEarning
```

This ensures partner share is calculated from actual profit after production cost, not from gross bill.

### 2.3 Example Calculation

Assume:

```txt
energy = 10,000 Wh
selling price = ₦0.40/Wh
production cost = ₦0.20/Wh
partner share = 50%
minimum charge = ₦150
```

Calculation:

```txt
grossAmount = 10,000 * 0.40 = ₦4,000
productionCostAmount = 10,000 * 0.20 = ₦2,000
profitAmount = ₦4,000 - ₦2,000 = ₦2,000
partnerEarning = ₦2,000 * 50% = ₦1,000
companyEarning = ₦2,000 - ₦1,000 = ₦1,000
```

---

## 3. Data Model

### 3.1 Partner Company Model

Create `PartnerCompany` model.

Recommended table: `partner_companies`

Fields:

```js
{
  id: INTEGER PRIMARY KEY,
  name: STRING NOT NULL,
  businessName: STRING,
  registrationNumber: STRING,
  contactPersonName: STRING,
  contactEmail: STRING,
  contactPhone: STRING,
  address: TEXT,
  country: STRING DEFAULT 'Nigeria',
  state: STRING,
  city: STRING,
  logoUrl: STRING,
  status: ENUM('active', 'inactive', 'suspended') DEFAULT 'active',
  defaultPartnerSharePercent: FLOAT DEFAULT 50,
  defaultProductionCostPerWh: FLOAT DEFAULT 0,
  bankName: STRING,
  bankAccountName: STRING,
  bankAccountNumber: STRING,
  settlementFrequency: ENUM('weekly', 'monthly', 'yearly', 'manual') DEFAULT 'monthly',
  notes: TEXT,
  createdBy: INTEGER,
  createdAt: DATE,
  updatedAt: DATE
}
```

### 3.2 Partner User Model

Partner users should log in separately or through the same auth system with a partner role.

Recommended: use the existing `User` model if possible and add partner fields.

Add to `users` table:

```js
partnerId: INTEGER NULL,
role: ENUM(
  'super_admin',
  'admin',
  'finance',
  'operations',
  'support',
  'viewer',
  'partner_owner',
  'partner_manager',
  'partner_finance',
  'partner_viewer'
)
```

Rules:

- Admin users have `partnerId = NULL`.
- Partner users have `partnerId = PartnerCompany.id`.
- Partner users can only access data belonging to their partner.
- Admin users can access all partners depending on permissions.

### 3.3 Location Ownership Fields

Update `Location` model.

Add:

```js
partnerId: INTEGER NULL,
productionCostPerWh: FLOAT DEFAULT 0,
partnerSharePercent: FLOAT DEFAULT 0,
settlementEnabled: BOOLEAN DEFAULT true
```

Meaning:

- `partnerId = NULL`: location belongs to main company.
- `partnerId = partner.id`: location belongs to partner.
- `productionCostPerWh`: operational cost for that location.
- `partnerSharePercent`: partner percentage from profit after production cost.
- `settlementEnabled`: allows admin to disable settlement for special cases.

### 3.4 Transaction Snapshot Fields

Add these fields to `Transaction` model so historical bills do not change when pricing changes later.

```js
sellingPricePerWh: FLOAT,
productionCostPerWh: FLOAT,
partnerSharePercent: FLOAT,
minimumChargeApplied: BOOLEAN DEFAULT false,
productionCostAmount: FLOAT DEFAULT 0,
profitAmount: FLOAT DEFAULT 0,
partnerEarning: FLOAT DEFAULT 0,
companyEarning: FLOAT DEFAULT 0,
partnerId: INTEGER NULL,
locationId: INTEGER NULL,
settlementId: INTEGER NULL,
settlementStatus: ENUM('pending', 'included', 'paid', 'cancelled') DEFAULT 'pending'
```

Important:

- Store pricing values at transaction completion time.
- Do not calculate settlement using current location pricing only.
- Settlement must use transaction snapshot values.

### 3.5 Partner Settlement Model

Create `PartnerSettlement` model.

Recommended table: `partner_settlements`

```js
{
  id: INTEGER PRIMARY KEY,
  partnerId: INTEGER NOT NULL,
  periodType: ENUM('weekly', 'monthly', 'yearly', 'custom') NOT NULL,
  periodStart: DATE NOT NULL,
  periodEnd: DATE NOT NULL,
  totalTransactions: INTEGER DEFAULT 0,
  totalEnergyWh: FLOAT DEFAULT 0,
  grossAmount: FLOAT DEFAULT 0,
  productionCostAmount: FLOAT DEFAULT 0,
  profitAmount: FLOAT DEFAULT 0,
  partnerEarning: FLOAT DEFAULT 0,
  companyEarning: FLOAT DEFAULT 0,
  adjustmentAmount: FLOAT DEFAULT 0,
  finalPayableAmount: FLOAT DEFAULT 0,
  status: ENUM('draft', 'approved', 'paid', 'cancelled') DEFAULT 'draft',
  approvedBy: INTEGER NULL,
  approvedAt: DATE NULL,
  paidBy: INTEGER NULL,
  paidAt: DATE NULL,
  paymentReference: STRING,
  paymentMethod: STRING,
  notes: TEXT,
  createdAt: DATE,
  updatedAt: DATE
}
```

### 3.6 Partner Settlement Item Model

Create `PartnerSettlementItem` model.

Recommended table: `partner_settlement_items`

```js
{
  id: INTEGER PRIMARY KEY,
  settlementId: INTEGER NOT NULL,
  transactionId: INTEGER NOT NULL,
  chargePointId: STRING,
  locationId: INTEGER,
  energyWh: FLOAT,
  grossAmount: FLOAT,
  productionCostAmount: FLOAT,
  profitAmount: FLOAT,
  partnerEarning: FLOAT,
  companyEarning: FLOAT,
  createdAt: DATE,
  updatedAt: DATE
}
```

---

## 4. Backend Implementation

### 4.1 Model Files to Add or Update

Add:

```txt
backend/src/models/PartnerCompany.js
backend/src/models/PartnerSettlement.js
backend/src/models/PartnerSettlementItem.js
```

Update:

```txt
backend/src/models/User.js
backend/src/models/Location.js
backend/src/models/Transaction.js
backend/src/models/index.js
```

Required model associations:

```js
PartnerCompany.hasMany(User, { foreignKey: 'partnerId', as: 'users' });
User.belongsTo(PartnerCompany, { foreignKey: 'partnerId', as: 'partner' });

PartnerCompany.hasMany(Location, { foreignKey: 'partnerId', as: 'locations' });
Location.belongsTo(PartnerCompany, { foreignKey: 'partnerId', as: 'partner' });

PartnerCompany.hasMany(Transaction, { foreignKey: 'partnerId', as: 'transactions' });
Transaction.belongsTo(PartnerCompany, { foreignKey: 'partnerId', as: 'partner' });

PartnerCompany.hasMany(PartnerSettlement, { foreignKey: 'partnerId', as: 'settlements' });
PartnerSettlement.belongsTo(PartnerCompany, { foreignKey: 'partnerId', as: 'partner' });

PartnerSettlement.hasMany(PartnerSettlementItem, { foreignKey: 'settlementId', as: 'items' });
PartnerSettlementItem.belongsTo(PartnerSettlement, { foreignKey: 'settlementId', as: 'settlement' });
```

### 4.2 Partnership Revenue Service

Create:

```txt
backend/src/services/partnerRevenueService.js
```

Responsibilities:

- Get station location.
- Detect partner ownership.
- Apply location pricing and production cost.
- Calculate partner earning and company earning.
- Return a transaction pricing snapshot.

Example service:

```js
async function calculatePartnerRevenue({ chargePointId, energyWh, billableAmount }) {
  const station = await ChargingStation.findOne({
    where: { chargePointId },
    attributes: ['id', 'chargePointId', 'locationId']
  });

  if (!station || !station.locationId) {
    return {
      locationId: null,
      partnerId: null,
      productionCostPerWh: 0,
      partnerSharePercent: 0,
      productionCostAmount: 0,
      profitAmount: billableAmount,
      partnerEarning: 0,
      companyEarning: billableAmount,
      settlementStatus: null
    };
  }

  const location = await Location.findByPk(station.locationId);

  const productionCostPerWh = parseFloat(location.productionCostPerWh || 0);
  const partnerSharePercent = parseFloat(location.partnerSharePercent || 0);
  const productionCostAmount = energyWh * productionCostPerWh;
  const profitAmount = Math.max(billableAmount - productionCostAmount, 0);

  const hasPartner = !!location.partnerId && location.settlementEnabled !== false;
  const partnerEarning = hasPartner
    ? profitAmount * (partnerSharePercent / 100)
    : 0;

  const companyEarning = profitAmount - partnerEarning;

  return {
    locationId: location.id,
    partnerId: hasPartner ? location.partnerId : null,
    productionCostPerWh,
    partnerSharePercent: hasPartner ? partnerSharePercent : 0,
    productionCostAmount,
    profitAmount,
    partnerEarning,
    companyEarning,
    settlementStatus: hasPartner ? 'pending' : null
  };
}
```

### 4.3 StopTransaction Integration

When a charging session ends:

1. Calculate energy.
2. Calculate gross amount from location selling price.
3. Apply minimum charge.
4. Call `calculatePartnerRevenue`.
5. Save all pricing and partner fields to the transaction.
6. Bill the customer wallet.
7. Leave partner settlement status as `pending` until settlement generation.

Example:

```js
const energyWh = Math.max(0, meterStop - startMeterValue);
const grossAmount = energyWh * sellingPricePerWh;
const billableAmount = Math.max(grossAmount, minimumCharge);

const partnerRevenue = await calculatePartnerRevenue({
  chargePointId,
  energyWh,
  billableAmount
});

await transaction.update({
  energyDelivered: energyWh,
  amount: billableAmount,
  sellingPricePerWh,
  minimumChargeApplied: grossAmount < minimumCharge,
  ...partnerRevenue,
  status: 'Completed'
});
```

### 4.4 Admin Partner Routes

Create:

```txt
backend/src/routes/admin/partners.js
```

Endpoints:

```txt
GET    /api/admin/partners
POST   /api/admin/partners
GET    /api/admin/partners/:id
PUT    /api/admin/partners/:id
DELETE /api/admin/partners/:id
```

Partner creation payload:

```json
{
  "name": "Partner Company Ltd",
  "businessName": "Partner Company Ltd",
  "registrationNumber": "RC123456",
  "contactPersonName": "John Doe",
  "contactEmail": "john@example.com",
  "contactPhone": "+2348012345678",
  "state": "Borno",
  "city": "Maiduguri",
  "defaultProductionCostPerWh": 0.2,
  "defaultPartnerSharePercent": 50,
  "settlementFrequency": "monthly",
  "bankName": "Zenith Bank",
  "bankAccountName": "Partner Company Ltd",
  "bankAccountNumber": "0123456789"
}
```

### 4.5 Partner User Routes

Admin should create partner login users.

Endpoints:

```txt
GET    /api/admin/partners/:partnerId/users
POST   /api/admin/partners/:partnerId/users
PUT    /api/admin/partners/:partnerId/users/:userId
DELETE /api/admin/partners/:partnerId/users/:userId
```

Payload:

```json
{
  "name": "Partner Manager",
  "email": "manager@partner.com",
  "username": "partner_manager",
  "password": "StrongPassword123",
  "role": "partner_manager",
  "active": true
}
```

Rules:

- Created users must have `partnerId` set automatically.
- Partner users cannot be assigned admin roles.
- Admin users cannot be assigned `partnerId` unless role is partner role.
- Password must be hashed using existing user password hooks.

### 4.6 Location Assignment Routes

Update or create admin endpoints:

```txt
POST /api/admin/partners/:partnerId/locations/:locationId/assign
POST /api/admin/locations/:locationId/unassign-partner
PUT  /api/admin/locations/:locationId/partner-pricing
```

Assign payload:

```json
{
  "productionCostPerWh": 0.2,
  "partnerSharePercent": 50,
  "settlementEnabled": true
}
```

Unassign behavior:

```txt
partnerId = null
partnerSharePercent = 0
settlementEnabled = false or true depending on company rule
```

### 4.7 Partner Portal Routes

Create:

```txt
backend/src/routes/partner/dashboard.js
backend/src/routes/partner/monitor.js
backend/src/routes/partner/performance.js
backend/src/routes/partner/settlements.js
```

Mount under:

```txt
/api/partner/dashboard
/api/partner/monitor
/api/partner/performance
/api/partner/settlements
```

All partner routes must enforce:

```txt
req.user.partnerId must exist
req.user.role must be partner_owner, partner_manager, partner_finance, or partner_viewer
```

### 4.8 Partner Dashboard Endpoint

```txt
GET /api/partner/dashboard/summary?range=daily|weekly|monthly|yearly
```

Return:

```json
{
  "success": true,
  "summary": {
    "totalLocations": 5,
    "totalStations": 14,
    "onlineStations": 9,
    "offlineStations": 5,
    "totalTransactions": 320,
    "totalEnergyWh": 900000,
    "grossRevenue": 360000,
    "productionCost": 180000,
    "partnerEarning": 90000,
    "companyEarning": 90000,
    "pendingSettlement": 45000,
    "paidSettlement": 45000
  }
}
```

### 4.9 Partner Monitor Map Endpoint

```txt
GET /api/partner/monitor/locations
```

Return only partner locations:

```json
{
  "success": true,
  "locations": [
    {
      "id": 1,
      "name": "Maiduguri Station Hub",
      "latitude": 11.8333,
      "longitude": 13.1500,
      "address": "Bama Road, Maiduguri",
      "stationCount": 4,
      "onlineStations": 3,
      "offlineStations": 1,
      "todayEnergyWh": 50000,
      "todayPartnerEarning": 5000,
      "stations": [
        {
          "chargePointId": "CP-001",
          "name": "Station 1",
          "status": "Available",
          "isOnline": true,
          "connectorCount": 2,
          "todayTransactions": 12,
          "todayEnergyWh": 20000
        }
      ]
    }
  ]
}
```

### 4.10 Admin Monitor Map Endpoint

```txt
GET /api/admin/monitor/locations?partnerId=all|main|specificId
```

Admin can see:

- Main company locations.
- Partner locations.
- Filter by partner.
- Filter by online/offline status.
- View station details from map click.
- View partner revenue statistics from each marker.

### 4.11 Performance Endpoints

Partner:

```txt
GET /api/partner/performance?range=daily
GET /api/partner/performance?range=weekly
GET /api/partner/performance?range=monthly
GET /api/partner/performance?range=yearly
GET /api/partner/performance?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
```

Admin:

```txt
GET /api/admin/partners/:partnerId/performance?range=monthly
```

Return:

```json
{
  "success": true,
  "range": "monthly",
  "totals": {
    "transactions": 100,
    "energyWh": 500000,
    "grossRevenue": 200000,
    "productionCost": 100000,
    "partnerEarning": 50000,
    "companyEarning": 50000
  },
  "series": [
    {
      "label": "2026-06-01",
      "transactions": 10,
      "energyWh": 50000,
      "grossRevenue": 20000,
      "partnerEarning": 5000
    }
  ]
}
```

### 4.12 Settlement Generation

Admin settlement page must support:

```txt
weekly
monthly
yearly
custom date range
```

Endpoint:

```txt
POST /api/admin/partners/:partnerId/settlements/generate
```

Payload:

```json
{
  "periodType": "monthly",
  "periodStart": "2026-06-01",
  "periodEnd": "2026-06-30"
}
```

Process:

1. Find all completed billed transactions for the partner.
2. Include only transactions with `settlementStatus = 'pending'`.
3. Sum gross amount, production cost, profit, partner earning, company earning.
4. Create settlement in `draft` status.
5. Create settlement items.
6. Update transaction settlement status to `included`.

Settlement approval:

```txt
POST /api/admin/settlements/:id/approve
```

Settlement payment:

```txt
POST /api/admin/settlements/:id/mark-paid
```

Payment payload:

```json
{
  "paymentReference": "BANK-TRANSFER-12345",
  "paymentMethod": "bank_transfer",
  "notes": "Paid to partner bank account"
}
```

Cancel settlement:

```txt
POST /api/admin/settlements/:id/cancel
```

Cancel behavior:

- Set settlement status to `cancelled`.
- Set included transaction settlement status back to `pending`.
- Do not allow cancellation after paid unless super admin approves reversal.

---

## 5. Frontend Implementation

### 5.1 Admin Pages

Add pages:

```txt
frontend/src/pages/partners/PartnerList.js
frontend/src/pages/partners/PartnerForm.js
frontend/src/pages/partners/PartnerDetail.js
frontend/src/pages/partners/PartnerUsers.js
frontend/src/pages/partners/PartnerLocations.js
frontend/src/pages/partners/PartnerPerformance.js
frontend/src/pages/partners/PartnerSettlements.js
frontend/src/pages/monitor/AdminMonitorMap.js
frontend/src/pages/settlements/SettlementList.js
frontend/src/pages/settlements/SettlementDetail.js
frontend/src/pages/users/UserList.js
frontend/src/pages/users/UserForm.js
frontend/src/pages/roles/RolesPermissions.js
```

### 5.2 Partner Portal Pages

Add pages:

```txt
frontend/src/pages/partner/PartnerDashboard.js
frontend/src/pages/partner/PartnerMonitorMap.js
frontend/src/pages/partner/PartnerPerformance.js
frontend/src/pages/partner/PartnerStations.js
frontend/src/pages/partner/PartnerSettlements.js
frontend/src/pages/partner/PartnerSettlementDetail.js
frontend/src/pages/partner/PartnerProfile.js
```

### 5.3 Admin Partner List Page

Features:

- Partner table.
- Search by company name, contact, city, state.
- Status filter: active, inactive, suspended.
- Settlement frequency filter.
- Summary cards:
  - Total partners.
  - Active partners.
  - Total partner locations.
  - Pending settlement amount.
- Actions:
  - View.
  - Edit.
  - Suspend/activate.
  - Manage users.
  - Assign locations.
  - Generate settlement.

### 5.4 Admin Partner Detail Page

Tabs:

1. Overview
2. Locations
3. Stations
4. Pricing & Share
5. Performance
6. Settlements
7. Users
8. Documents/Notes

Overview should show:

- Company details.
- Contact details.
- Bank details.
- Settlement frequency.
- Total revenue.
- Partner earning.
- Pending settlement.
- Paid settlement.
- Assigned locations.
- Active stations.

### 5.5 Location Assignment UI

Admin should be able to assign a location to a partner from:

- Partner detail page.
- Location detail page.
- Bulk assignment modal.

Fields:

```txt
Partner company
Production cost per Wh
Partner share percentage
Settlement enabled
Effective date
```

Validation:

- Production cost must be >= 0.
- Production cost should not be greater than selling price unless admin confirms.
- Partner share must be between 0 and 100.
- Effective date cannot be before last settled period unless super admin.

### 5.6 Admin Monitor Map Page

The admin monitor page should display all locations on a map.

Features:

- Markers for each location.
- Marker color by status:
  - Green: mostly online.
  - Yellow: partially online.
  - Red: offline/faulted.
  - Blue: main company location.
  - Purple: partner location.
- Filter by partner.
- Filter by state/city.
- Filter by online/offline.
- Click marker to open location drawer.
- Location drawer should show stations under that location.
- Clicking a station should open station details.
- Show live station status using MQTT where available.

Location drawer should display:

```txt
Location name
Partner name or Main Company
Address
Total stations
Online stations
Offline stations
Today transactions
Today energy
Today gross revenue
Today partner earning
Today company earning
```

### 5.7 Partner Monitor Map Page

Partner monitor page should show only the partner’s assigned locations.

Features:

- Map markers for partner locations.
- Location list beside map.
- Click location marker to show stations.
- Station cards with live status.
- Today performance summary.
- Station availability indicators.
- Energy and revenue summary.

Partner must not see:

- Main company-only locations.
- Other partners’ locations.
- Other partners’ settlements.
- Admin user management.

### 5.8 Partner Performance Page

Filters:

```txt
Today
This week
This month
This year
Custom date range
Location
Station
```

Charts:

- Energy consumed over time.
- Gross revenue over time.
- Partner earnings over time.
- Station utilization.
- Transactions count.
- Top-performing stations.
- Low-performing stations.

Cards:

```txt
Total Energy
Gross Revenue
Production Cost
Partner Earning
Company Earning
Total Sessions
Average Session Value
Best Location
Best Station
```

### 5.9 Partner Settlements Page

Partner can view:

- Settlement history.
- Draft settlements.
- Approved settlements.
- Paid settlements.
- Settlement period.
- Gross revenue.
- Production cost.
- Partner share.
- Final payable amount.
- Payment reference.
- Paid date.

Partner should not be able to mark settlement as paid.

Partner can download:

- PDF settlement statement.
- CSV transaction breakdown.

### 5.10 Admin Settlement/Disbursement Page

Admin settlement page should support:

- Generate weekly settlement.
- Generate monthly settlement.
- Generate yearly settlement.
- Generate custom settlement.
- Preview before creating.
- Approve settlement.
- Mark as paid.
- Cancel draft settlement.
- Export PDF/CSV.
- Filter by partner, period, status.

Settlement table columns:

```txt
Settlement ID
Partner
Period
Transactions
Energy
Gross Revenue
Production Cost
Partner Earning
Adjustments
Final Payable
Status
Actions
```

Settlement detail should include:

- Partner information.
- Bank information.
- Period.
- Summary.
- Transaction line items.
- Approval log.
- Payment log.

---

## 6. Roles and Permissions

### 6.1 Admin Roles

Recommended roles:

```txt
super_admin
admin
finance
operations
support
viewer
```

### 6.2 Partner Roles

Recommended roles:

```txt
partner_owner
partner_manager
partner_finance
partner_viewer
```

### 6.3 Permission Model

Create permission system instead of relying only on role names.

Recommended permissions:

```txt
partners.view
partners.create
partners.update
partners.suspend
partners.delete
partners.assign_locations
partners.manage_users

locations.view
locations.create
locations.update
locations.assign_partner
locations.unassign_partner

stations.view
stations.create
stations.update
stations.delete
stations.remote_control
stations.monitor

pricing.view
pricing.update
pricing.partner_update

settlements.view
settlements.generate
settlements.approve
settlements.mark_paid
settlements.cancel
settlements.export

users.view
users.create
users.update
users.delete
roles.view
roles.update

reports.view
reports.export
monitor.view
```

### 6.4 Default Role Permission Matrix

| Permission | Super Admin | Admin | Finance | Operations | Support | Viewer | Partner Owner | Partner Manager | Partner Finance | Partner Viewer |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| partners.view | Yes | Yes | Yes | No | No | No | No | No | No | No |
| partners.create | Yes | Yes | No | No | No | No | No | No | No | No |
| partners.update | Yes | Yes | No | No | No | No | No | No | No | No |
| partners.assign_locations | Yes | Yes | No | No | No | No | No | No | No | No |
| partners.manage_users | Yes | Yes | No | No | No | No | No | No | No | No |
| settlements.view | Yes | Yes | Yes | No | No | View | Own Only | Own Only | Own Only | Own Only |
| settlements.generate | Yes | Yes | Yes | No | No | No | No | No | No | No |
| settlements.approve | Yes | Yes | No | No | No | No | No | No | No | No |
| settlements.mark_paid | Yes | No | Yes | No | No | No | No | No | No | No |
| monitor.view | Yes | Yes | Yes | Yes | Yes | Yes | Own Only | Own Only | Own Only | Own Only |
| stations.remote_control | Yes | Yes | No | Yes | No | No | No | No | No | No |
| users.create | Yes | Yes | No | No | No | No | No | No | No | No |
| roles.update | Yes | No | No | No | No | No | No | No | No | No |

---

## 7. API Access Control Rules

### 7.1 Admin Access

Admin can access all partners and all locations only if they have the required permission.

Example middleware:

```js
requirePermission('partners.view')
requirePermission('settlements.generate')
```

### 7.2 Partner Access

Partner route middleware must always apply partner scoping.

Example:

```js
function partnerOnly(req, res, next) {
  if (!req.user.partnerId) {
    return res.status(403).json({ success: false, message: 'Partner access required' });
  }
  next();
}
```

Every partner query must include:

```js
where: { partnerId: req.user.partnerId }
```

or join through locations:

```js
include: [{
  model: Location,
  where: { partnerId: req.user.partnerId }
}]
```

---

## 8. Settlement Workflow

### 8.1 Weekly Settlement

A weekly settlement should cover Monday 00:00 to Sunday 23:59:59 Africa/Lagos time.

### 8.2 Monthly Settlement

A monthly settlement should cover the first day of the month to the last day of the month.

### 8.3 Yearly Settlement

A yearly settlement should cover January 1 to December 31.

### 8.4 Settlement Status Flow

```txt
draft -> approved -> paid
       -> cancelled
```

Rules:

- Draft can be cancelled.
- Approved can be marked as paid.
- Paid cannot be edited.
- Paid cannot be cancelled except through reversal by super admin.
- Transactions should not appear in more than one active settlement.

---

## 9. Navigation Structure

### 9.1 Admin Sidebar

Add:

```txt
Dashboard
Monitor Map
Stations
Locations
Partners
Settlements
Transactions
Mobile Users
Users & Roles
Payments
Settings
```

### 9.2 Partner Sidebar

Add:

```txt
Partner Dashboard
Monitor Map
Locations
Stations
Performance
Settlements
Profile
```

Partner users should not see admin-only menus.

---

## 10. UI/UX Requirements

### 10.1 Partner Dashboard Must Feel Professional

Partner pages should be polished and business-friendly.

Use:

- Summary cards.
- Graphs and charts.
- Map view.
- Transaction tables.
- Settlement statements.
- Export buttons.
- Partner branding/logo.
- Clear financial breakdown.

### 10.2 Financial Display Format

All money should use Nigerian Naira formatting:

```txt
₦1,250.00
```

Energy should be shown as:

```txt
Wh for raw meter values
kWh for reports and dashboards
```

Example:

```txt
10,000 Wh = 10 kWh
```

### 10.3 Important Partner Metrics

Partner dashboard should show:

```txt
Today’s Revenue
Today’s Partner Earning
This Month’s Partner Earning
Pending Settlement
Paid Settlement
Total Energy Delivered
Total Charging Sessions
Online Stations
Offline Stations
Best Performing Location
Best Performing Station
```

---

## 11. Reports and Exports

Admin and partners should be able to export:

- Performance report CSV.
- Settlement statement PDF.
- Transaction breakdown CSV.
- Location performance report.
- Station performance report.

Settlement PDF should contain:

```txt
Company logo
Partner details
Settlement period
Total transactions
Total energy
Gross revenue
Production cost
Profit amount
Partner percentage
Partner earning
Adjustment
Final payable
Bank details
Generated by
Approved by
Paid by
```

---

## 12. Validation Rules

### 12.1 Partner Creation

Required fields:

```txt
name
contactPersonName
contactEmail
contactPhone
settlementFrequency
```

Optional but recommended:

```txt
bankName
bankAccountName
bankAccountNumber
registrationNumber
```

### 12.2 Pricing Validation

Rules:

```txt
sellingPricePerWh > 0
productionCostPerWh >= 0
partnerSharePercent >= 0
partnerSharePercent <= 100
minimumCharge >= 0
```

Warning rule:

```txt
productionCostPerWh > sellingPricePerWh
```

Should trigger confirmation because it means there is no profit.

### 12.3 Settlement Validation

Rules:

- Cannot generate settlement with no transactions.
- Cannot generate duplicate settlement for same partner and same period.
- Cannot include unbilled transactions.
- Cannot include transactions already in another active settlement.
- Cannot mark as paid without payment reference.

---

## 13. Migration Plan

### Phase 1: Database and Backend Core

- Add partner models.
- Add partner fields to locations and transactions.
- Add user roles and partnerId.
- Add model exports and associations.
- Add revenue calculation service.
- Integrate revenue snapshots into StopTransaction.

### Phase 2: Admin Partner Management

- Partner CRUD.
- Partner user creation.
- Assign/unassign locations.
- Pricing and share settings per location.

### Phase 3: Partner Portal

- Partner login support.
- Partner dashboard.
- Partner monitor map.
- Partner performance page.
- Partner settlement view.

### Phase 4: Admin Monitor and Settlement

- Admin map monitor.
- Settlement generation.
- Settlement approval.
- Mark as paid.
- Export PDF/CSV.

### Phase 5: Permissions and Audit

- Permission model.
- User creation and role assignment.
- Activity logs.
- Settlement approval logs.
- Security review.

---

## 14. Implementation Acceptance Criteria

### Admin Partnership

- Admin can create partner company.
- Admin can edit partner company.
- Admin can suspend partner company.
- Admin can create partner login users.
- Admin can assign locations to partners.
- Admin can set production cost and partner share for each assigned location.
- Unassigned locations remain main company locations.

### Partner Login

- Partner users can log in.
- Partner users see only their own dashboard.
- Partner users see only assigned locations and stations.
- Partner users cannot access admin routes.
- Partner users cannot see other partners.

### Pricing and Revenue Share

- Charging transaction stores pricing snapshot.
- Production cost is deducted from gross revenue.
- Partner percentage is applied to remaining profit.
- Partner earning and company earning are stored per transaction.
- Settlement uses stored transaction snapshot values.

### Monitor Map

- Admin can see all locations on map.
- Admin can filter by partner or main company.
- Partner can see only their own locations on map.
- Clicking a location shows stations under it.
- Station status should update with live status where available.

### Performance

- Partner can view daily performance.
- Partner can view weekly performance.
- Partner can view monthly performance.
- Partner can view yearly performance.
- Partner can filter by location and station.

### Settlement

- Admin can generate weekly settlement.
- Admin can generate monthly settlement.
- Admin can generate yearly settlement.
- Admin can approve settlement.
- Admin can mark settlement as paid.
- Partner can view settlement history.
- Partner can download settlement statement.

### Users, Roles, and Permissions

- Admin can create users apart from partners.
- Admin can assign roles.
- Super admin can manage permissions.
- Partner roles are restricted to partner scope.
- Finance role can manage settlement payment but not system roles.

---

## 15. Recommended Files to Create

Backend:

```txt
backend/src/models/PartnerCompany.js
backend/src/models/PartnerSettlement.js
backend/src/models/PartnerSettlementItem.js
backend/src/services/partnerRevenueService.js
backend/src/services/partnerSettlementService.js
backend/src/middleware/permissions.js
backend/src/middleware/partnerScope.js
backend/src/routes/admin/partners.js
backend/src/routes/admin/monitor.js
backend/src/routes/admin/settlements.js
backend/src/routes/admin/users.js
backend/src/routes/admin/roles.js
backend/src/routes/partner/dashboard.js
backend/src/routes/partner/monitor.js
backend/src/routes/partner/performance.js
backend/src/routes/partner/settlements.js
```

Frontend:

```txt
frontend/src/services/partnerService.js
frontend/src/services/settlementService.js
frontend/src/services/userRoleService.js
frontend/src/pages/partners/PartnerList.js
frontend/src/pages/partners/PartnerDetail.js
frontend/src/pages/partners/PartnerForm.js
frontend/src/pages/partners/PartnerUsers.js
frontend/src/pages/partners/PartnerLocations.js
frontend/src/pages/monitor/AdminMonitorMap.js
frontend/src/pages/partner/PartnerDashboard.js
frontend/src/pages/partner/PartnerMonitorMap.js
frontend/src/pages/partner/PartnerPerformance.js
frontend/src/pages/partner/PartnerSettlements.js
frontend/src/pages/settlements/SettlementList.js
frontend/src/pages/settlements/SettlementDetail.js
frontend/src/pages/users/UserList.js
frontend/src/pages/users/UserForm.js
frontend/src/pages/roles/RolesPermissions.js
```

---

## 16. Final Recommended Business Rule

Use this as the official rule for partnerships:

```txt
Partner earning is calculated only from profit after production cost.
Profit = customer bill - production cost.
Partner earning = profit × partner share percentage.
Main company earning = profit - partner earning.
Unassigned locations belong fully to the main company.
```

This makes the partnership model fair, transparent, and easy to explain to both admins and partners.
