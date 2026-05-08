const { Router } = require("express");
const controller = require("../controllers/orders.controller");
const { authenticate } = require("../middleware/auth");
const { requireRole } = require("../middleware/roleCheck");
const { validate } = require("../middleware/validate");
const { createOrderSchema, refundSchema } = require("../schemas/order.schema");
const { z } = require("zod");

const router = Router();
router.use(authenticate);

router.post("/",              requireRole("CUSTOMER", "SHELTER"), validate(createOrderSchema), controller.create);
router.get("/",               requireRole("CUSTOMER", "SHELTER"), controller.getAll);
router.get("/:id",            requireRole("CUSTOMER", "SHELTER"), controller.getOne);
router.patch("/:id/status",   requireRole("CUSTOMER", "VENDOR", "DRIVER", "SHELTER", "ADMIN"), validate(z.object({ status: z.string() })), controller.updateStatus);
router.post("/:id/refund",    requireRole("CUSTOMER"), validate(refundSchema), controller.refund);

module.exports = router;
