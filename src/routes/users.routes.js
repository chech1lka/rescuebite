const { Router } = require("express");
const prisma = require("../config/database");
const { authenticate } = require("../middleware/auth");
const { validate } = require("../middleware/validate");
const { z } = require("zod");

const ALLERGEN_ENUM = z.enum(["GLUTEN","DAIRY","EGGS","NUTS","PEANUTS","SOY","FISH","SHELLFISH","SESAME","MUSTARD","CELERY","SULPHITES","LUPIN","MOLLUSCS"]);

const router = Router();
router.use(authenticate);

router.get("/me", async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, email: true, role: true, createdAt: true },
    });
    res.json(user);
  } catch (e) { next(e); }
});

router.patch("/me/allergens", validate(z.object({ allergens: z.array(ALLERGEN_ENUM) })), async (req, res, next) => {
  try {
    await prisma.$transaction([
      prisma.customerAllergen.deleteMany({ where: { userId: req.user.id } }),
      prisma.customerAllergen.createMany({ data: req.body.allergens.map((allergen) => ({ userId: req.user.id, allergen })) }),
    ]);
    res.json({ userId: req.user.id, allergens: req.body.allergens });
  } catch (e) { next(e); }
});

module.exports = router;
