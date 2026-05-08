const { Router } = require("express");
const prisma = require("../config/database");
const { authenticate } = require("../middleware/auth");
const { requireRole } = require("../middleware/roleCheck");
const { createError } = require("../middleware/errorHandler");
const { validate } = require("../middleware/validate");
const { z } = require("zod");

const router = Router();
router.use(authenticate);

const vendorSchema = z.object({
  storeName: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  address: z.string().min(1),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  phone: z.string().optional(),
});

router.post("/", requireRole("VENDOR"), validate(vendorSchema), async (req, res, next) => {
  try {
    const exists = await prisma.vendor.findUnique({ where: { userId: req.user.id } });
    if (exists) return next(createError(409, "Vendor profile exists"));
    res.status(201).json(await prisma.vendor.create({ data: { ...req.body, userId: req.user.id } }));
  } catch (e) { next(e); }
});

router.get("/me", requireRole("VENDOR"), async (req, res, next) => {
  try {
    const v = await prisma.vendor.findUnique({ where: { userId: req.user.id }, include: { _count: { select: { listings: true, orders: true } } } });
    if (!v) return next(createError(404, "Vendor not found"));
    res.json(v);
  } catch (e) { next(e); }
});

router.patch("/me", requireRole("VENDOR"), validate(vendorSchema.partial()), async (req, res, next) => {
  try { res.json(await prisma.vendor.update({ where: { userId: req.user.id }, data: req.body })); } catch (e) { next(e); }
});

router.get("/me/orders", requireRole("VENDOR"), async (req, res, next) => {
  try {
    const vendor = await prisma.vendor.findUnique({ where: { userId: req.user.id } });
    if (!vendor) return next(createError(404, "Vendor not found"));
    const { cursor, limit = 20, status } = req.query;
    const take = Math.min(Number(limit), 50);
    const where = { vendorId: vendor.id };
    if (status) where.status = status;
    const orders = await prisma.order.findMany({
      where, take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { createdAt: "desc" },
      include: { customer: { select: { id: true, email: true } }, items: { include: { listing: { select: { id: true, name: true } } } } },
    });
    const hasMore = orders.length > take;
    const data = hasMore ? orders.slice(0, -1) : orders;
    res.json({ data, nextCursor: hasMore ? data[data.length - 1].id : null, hasMore });
  } catch (e) { next(e); }
});

module.exports = router;
