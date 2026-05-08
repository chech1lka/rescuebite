const { Router } = require("express");
const prisma = require("../config/database");
const { authenticate } = require("../middleware/auth");
const { requireRole } = require("../middleware/roleCheck");
const { createError } = require("../middleware/errorHandler");
const { validate } = require("../middleware/validate");
const { z } = require("zod");

const router = Router();
router.use(authenticate);

const shelterSchema = z.object({
  name:      z.string().min(1).max(100),
  address:   z.string().min(1),
  latitude:  z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  phone:     z.string().optional(),
  capacity:  z.number().int().positive().default(50),
});

// Create shelter profile
router.post("/", requireRole("SHELTER"), validate(shelterSchema), async (req, res, next) => {
  try {
    const exists = await prisma.shelter.findUnique({ where: { userId: req.user.id } });
    if (exists) return next(createError(409, "Shelter profile already exists"));
    res.status(201).json(await prisma.shelter.create({ data: { ...req.body, userId: req.user.id } }));
  } catch (e) { next(e); }
});

// Get own profile
router.get("/me", requireRole("SHELTER"), async (req, res, next) => {
  try {
    const shelter = await prisma.shelter.findUnique({
      where: { userId: req.user.id },
      include: { _count: { select: { orders: true } } },
    });
    if (!shelter) return next(createError(404, "Shelter profile not found"));
    res.json(shelter);
  } catch (e) { next(e); }
});

// Edit shelter profile (PATCH)
router.patch("/me", requireRole("SHELTER"), validate(shelterSchema.partial()), async (req, res, next) => {
  try {
    res.json(await prisma.shelter.update({ where: { userId: req.user.id }, data: req.body }));
  } catch (e) { next(e); }
});

// Get all approved shelters (public — for vendors/admins to see where to donate)
router.get("/", async (req, res, next) => {
  try {
    const shelters = await prisma.shelter.findMany({
      where: { isApproved: true },
      select: { id: true, name: true, address: true, latitude: true, longitude: true, capacity: true },
    });
    res.json(shelters);
  } catch (e) { next(e); }
});

module.exports = router;
