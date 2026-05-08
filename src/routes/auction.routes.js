const { Router } = require("express");
const auctionService = require("../services/auction.service");
const { authenticate } = require("../middleware/auth");
const { requireRole } = require("../middleware/roleCheck");
const { validate } = require("../middleware/validate");
const { z } = require("zod");

const router = Router();

// Public: list active auctions
router.get("/", async (req, res, next) => {
  try { res.json(await auctionService.getActiveAuctions(req.query)); } catch (e) { next(e); }
});

// Public: get auction details
router.get("/:id", async (req, res, next) => {
  try { res.json(await auctionService.getAuction(req.params.id)); } catch (e) { next(e); }
});

// Place a bid (Customer only)
router.post("/:id/bid",
  authenticate,
  requireRole("CUSTOMER"),
  validate(z.object({ amount: z.number().min(0, "Bid must be >= 0") })),
  async (req, res, next) => {
    try { res.status(201).json(await auctionService.placeBid(req.params.id, req.user.id, req.body.amount)); } catch (e) { next(e); }
  }
);

module.exports = router;
