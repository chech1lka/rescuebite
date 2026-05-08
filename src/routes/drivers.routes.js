const { Router } = require("express");
const prisma = require("../config/database");
const { authenticate } = require("../middleware/auth");
const { requireRole } = require("../middleware/roleCheck");
const { createError } = require("../middleware/errorHandler");
const { validate } = require("../middleware/validate");
const { z } = require("zod");
const ordersService = require("../services/orders.service");
const routeService = require("../services/route.service");

const router = Router();
router.use(authenticate);

router.post("/", requireRole("DRIVER"),
  validate(z.object({ phone: z.string().min(10) })),
  async (req, res, next) => {
    try {
      const exists = await prisma.driver.findUnique({ where: { userId: req.user.id } });
      if (exists) return next(createError(409, "Driver profile exists"));
      res.status(201).json(await prisma.driver.create({ data: { ...req.body, userId: req.user.id } }));
    } catch (e) { next(e); }
  }
);

router.get("/me", requireRole("DRIVER"), async (req, res, next) => {
  try {
    const d = await prisma.driver.findUnique({ where: { userId: req.user.id } });
    if (!d) return next(createError(404, "Driver not found"));
    res.json(d);
  } catch (e) { next(e); }
});

// Toggle status (PATCH)
router.patch("/me/status", requireRole("DRIVER"),
  validate(z.object({ isOnline: z.boolean(), latitude: z.number().optional(), longitude: z.number().optional() })),
  async (req, res, next) => {
    try { res.json(await prisma.driver.update({ where: { userId: req.user.id }, data: req.body })); } catch (e) { next(e); }
  }
);

// 📍 GEOFENCING: update location + auto-complete deliveries within 100m
router.patch("/me/location", requireRole("DRIVER"),
  validate(z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) })),
  async (req, res, next) => {
    try {
      const result = await ordersService.updateDriverLocation(req.user.id, req.body.latitude, req.body.longitude);
      res.json(result);
    } catch (e) { next(e); }
  }
);

// 🗺️ ROUTE OPTIMIZATION: TSP-lite nearest neighbor
router.get("/me/route", requireRole("DRIVER"),
  async (req, res, next) => {
    try {
      const { orderIds } = req.query;
      if (!orderIds) return res.status(400).json({ error: "orderIds query param required (comma-separated)" });
      const idsRaw = Array.isArray(orderIds) ? orderIds.join(",") : String(orderIds); const ids = idsRaw.split(",").map((s) => s.trim()).filter(Boolean);
      if (ids.length === 0) return res.status(400).json({ error: "Provide at least one orderId" });
      res.json(await routeService.optimizeRoute(req.user.id, ids));
    } catch (e) { next(e); }
  }
);

router.get("/me/deliveries", requireRole("DRIVER"), async (req, res, next) => {
  try {
    const driver = await prisma.driver.findUnique({ where: { userId: req.user.id } });
    if (!driver) return next(createError(404, "Driver not found"));
    const { cursor, limit = 20, status } = req.query;
    const take = Math.min(Number(limit), 50);
    const where = { driverId: driver.id };
    if (status) where.status = status;
    const orders = await prisma.order.findMany({
      where, take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { createdAt: "desc" },
      include: {
        vendor: { select: { id: true, storeName: true, address: true, latitude: true, longitude: true } },
        shelter: { select: { id: true, name: true, address: true, latitude: true, longitude: true } },
      },
    });
    const hasMore = orders.length > take;
    const data = hasMore ? orders.slice(0, -1) : orders;
    res.json({ data, nextCursor: hasMore ? data[data.length - 1].id : null, hasMore });
  } catch (e) { next(e); }
});

router.patch("/me/deliveries/:id/pickup", requireRole("DRIVER"), async (req, res, next) => {
  try {
    const driver = await prisma.driver.findUnique({ where: { userId: req.user.id } });
    res.json(await ordersService.updateOrderStatus(req.params.id, req.user.id, "DRIVER", "PICKED_UP", driver.id));
  } catch (e) { next(e); }
});

router.patch("/me/deliveries/:id/deliver", requireRole("DRIVER"), async (req, res, next) => {
  try {
    const driver = await prisma.driver.findUnique({ where: { userId: req.user.id } });
    res.json(await ordersService.updateOrderStatus(req.params.id, req.user.id, "DRIVER", "DELIVERED", driver.id));
  } catch (e) { next(e); }
});

module.exports = router;
