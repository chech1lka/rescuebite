const { z } = require("zod");

const createOrderSchema = z.object({
  items: z.array(z.object({
    listingId: z.string().uuid(),
    quantity: z.number().int().positive(),
  })).min(1),
  deliveryType: z.enum(["PICKUP", "DELIVERY"]).default("PICKUP"),
  shelterId: z.string().uuid().optional(),
});

const refundSchema = z.object({
  reason: z.string().min(10),
});

module.exports = { createOrderSchema, refundSchema };
