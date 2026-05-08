const { Router } = require("express");
const prisma = require("../config/database");
const { authenticate } = require("../middleware/auth");
const { requireRole } = require("../middleware/roleCheck");
const { validate } = require("../middleware/validate");
const { z } = require("zod");

const ALLERGEN_ENUM = z.enum(["GLUTEN","DAIRY","EGGS","NUTS","PEANUTS","SOY","FISH","SHELLFISH","SESAME","MUSTARD","CELERY","SULPHITES","LUPIN","MOLLUSCS"]);
const router = Router();

router.get("/", async (req, res, next) => {
  try {
    const { search } = req.query;
    res.json(await prisma.ingredient.findMany({
      where: search ? { name: { contains: search, mode: "insensitive" } } : undefined,
      include: { allergens: true },
      orderBy: { name: "asc" },
    }));
  } catch (e) { next(e); }
});

router.post("/", authenticate, requireRole("ADMIN", "VENDOR"),
  validate(z.object({ name: z.string().min(1).max(100), allergens: z.array(ALLERGEN_ENUM).optional().default([]) })),
  async (req, res, next) => {
    try {
      const { name, allergens } = req.body;
      res.status(201).json(await prisma.ingredient.create({
        data: { name, allergens: allergens.length ? { create: allergens.map((allergen) => ({ allergen })) } : undefined },
        include: { allergens: true },
      }));
    } catch (e) { next(e); }
  }
);

module.exports = router;
