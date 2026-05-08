# 🥗 RescueBite — Backend API v2.0

Food waste reduction platform. Restaurants list near-expiry food at a discount. Customers and shelters get it cheap or free. Drivers deliver it.

## 🚀 Quick Start (one command)

```bash
docker compose up --build
```

API → http://localhost:3000  
Swagger → http://localhost:3000/docs  
Health → http://localhost:3000/health

## 🔥 Key Features

| Feature | Description |
|---|---|
| **Price Decay** | `FRESH → DISCOUNTED → FREE → COMPOST` — cron every 15 min |
| **Flash Auction** | Last 30 min before expiry → reverse auction (lowest bid wins) |
| **Route Optimization** | `GET /drivers/me/route?orderIds=...` — TSP nearest neighbor |
| **Geofencing** | `PATCH /drivers/me/location` — auto-completes delivery within 100m |
| **Shelter Role** | Charities receive FREE/COMPOST food via dedicated role |

## 👤 Roles

| Role | Can do |
|---|---|
| CUSTOMER | Browse, order, bid in auctions, refunds |
| VENDOR | Create listings, manage orders |
| DRIVER | Deliver orders, get optimized routes, geofencing |
| SHELTER | Place orders for free food on behalf of charity |
| ADMIN | Approve all roles, analytics, resolve refunds |

## 🛠 Tech Stack

Express.js · PostgreSQL 16 · Prisma ORM · Redis · JWT · Zod · node-cron

## 🧪 Run Tests

```bash
# Inside Docker
docker compose exec app npm test

# Or with local Node + running DB/Redis
npm test
```

## 📁 Structure

```
src/
├── config/       — env validation, DB, Redis
├── middleware/   — auth, RBAC, rate limiter, error handler
├── routes/       — URL mapping (auth, listings, orders, vendors, drivers, shelters, auctions, admin)
├── controllers/  — thin layer: parse request, call service, send response
├── services/     — business logic (auth, listings, orders, auction, route)
└── cron/         — price decay (15min) + auction resolver (1min)
```
