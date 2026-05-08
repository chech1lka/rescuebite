const { Router } = require("express");
const controller = require("../controllers/listings.controller");
const { authenticate } = require("../middleware/auth");
const { requireRole } = require("../middleware/roleCheck");
const { validate } = require("../middleware/validate");
const { createListingSchema, updateListingSchema, allergenCheckSchema } = require("../schemas/listing.schema");

const router = Router();

router.get("/",       controller.getListings);
router.get("/nearby", controller.getNearby);
router.get("/:id",    controller.getOne);

// Optional auth for allergen check
router.post("/allergen-check",
  (req, res, next) => { authenticate(req, res, (err) => { if (err) req.user = null; next(); }); },
  validate(allergenCheckSchema),
  controller.checkAllergens
);

router.post("/",   authenticate, requireRole("VENDOR"), validate(createListingSchema), controller.create);
router.patch("/:id", authenticate, requireRole("VENDOR"), validate(updateListingSchema), controller.update);
router.delete("/:id", authenticate, requireRole("VENDOR"), controller.remove);

module.exports = router;
