const { Router } = require("express");
const prisma = require("../config/database");
const { authenticate } = require("../middleware/auth");
const { requireRole } = require("../middleware/roleCheck");
const { validate } = require("../middleware/validate");
const { z } = require("zod");
const emailService = require("../services/email.service");

const router = Router();
router.use(authenticate, requireRole("ADMIN"));

router.get("/vendors/pending", async (req, res, next) => {
  try {
    const vendors = await prisma.vendor.findMany({ where: { isApproved: false }, include: { user: { select: { email: true } } } });
    res.json(vendors);
  } catch (e) { next(e); }
});
router.patch("/vendors/:id/approve", async (req, res, next) => {
  try {
    const v = await prisma.vendor.update({ where: { id: req.params.id }, data: { isApproved: true } });
    const vendorUser = await prisma.user.findUnique({ where: { id: v.userId }, select: { email: true } });
    emailService.sendVendorApprovedEmail(vendorUser.email, v.storeName).catch(()=>{});
    await prisma.auditLog.create({ data: { userId: req.user.id, action: "VENDOR_APPROVED", entity: "Vendor", entityId: v.id } });
    res.json(v);
  } catch (e) { next(e); }
});

router.get("/drivers/pending", async (req, res, next) => {
  try { res.json(await prisma.driver.findMany({ where: { isApproved: false }, include: { user: { select: { email: true } } } })); } catch (e) { next(e); }
});
router.patch("/drivers/:id/approve", async (req, res, next) => {
  try {
    const d = await prisma.driver.update({ where: { id: req.params.id }, data: { isApproved: true } });
    await prisma.auditLog.create({ data: { userId: req.user.id, action: "DRIVER_APPROVED", entity: "Driver", entityId: d.id } });
    res.json(d);
  } catch (e) { next(e); }
});

router.get("/shelters/pending", async (req, res, next) => {
  try { res.json(await prisma.shelter.findMany({ where: { isApproved: false }, include: { user: { select: { email: true } } } })); } catch (e) { next(e); }
});
router.patch("/shelters/:id/approve", async (req, res, next) => {
  try {
    const s = await prisma.shelter.update({ where: { id: req.params.id }, data: { isApproved: true } });
    await prisma.auditLog.create({ data: { userId: req.user.id, action: "SHELTER_APPROVED", entity: "Shelter", entityId: s.id } });
    res.json(s);
  } catch (e) { next(e); }
});

router.patch("/users/:id/suspend", validate(z.object({ reason: z.string().min(1) })), async (req, res, next) => {
  try {
    const user = await prisma.user.update({ where: { id: req.params.id }, data: { isActive: false }, select: { id: true, email: true, isActive: true } });
    await prisma.refreshToken.deleteMany({ where: { userId: req.params.id } });
    await prisma.auditLog.create({ data: { userId: req.user.id, action: "USER_SUSPENDED", entity: "User", entityId: req.params.id, newValue: { reason: req.body.reason } } });
    res.json(user);
  } catch (e) { next(e); }
});

router.get("/analytics", async (req, res, next) => {
  try {
    const [totalOrders, totalListings, totalUsers, totalShelters] = await Promise.all([
      prisma.order.count(),
      prisma.listing.count({ where: { status: { in: ["FRESH", "DISCOUNTED", "FREE", "AUCTION"] } } }),
      prisma.user.count({ where: { isActive: true } }),
      prisma.shelter.count({ where: { isApproved: true } }),
    ]);
    res.json({ totalOrders, totalListings, totalUsers, totalShelters });
  } catch (e) { next(e); }
});

router.get("/refunds/pending", async (req, res, next) => {
  try { res.json(await prisma.order.findMany({ where: { status: "REFUND_REQUESTED" }, include: { customer: { select: { email: true } } } })); } catch (e) { next(e); }
});
router.patch("/refunds/:id/resolve", validate(z.object({ resolution: z.enum(["REFUNDED", "REJECTED"]) })), async (req, res, next) => {
  try {
    const order = await prisma.order.update({ where: { id: req.params.id }, data: { status: req.body.resolution } });
    await prisma.auditLog.create({ data: { userId: req.user.id, action: `REFUND_${req.body.resolution}`, entity: "Order", entityId: req.params.id } });
    res.json(order);
  } catch (e) { next(e); }
});

module.exports = router;

// List all users (admin)
router.get("/users", async (req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      select: { id: true, email: true, role: true, isActive: true, isEmailVerified: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });
    res.json(users);
  } catch (e) { next(e); }
});

// Delete user (admin)
router.delete("/users/:id", async (req, res, next) => {
  try {
    await prisma.refreshToken.deleteMany({ where: { userId: req.params.id } });
    await prisma.user.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (e) { next(e); }
});
