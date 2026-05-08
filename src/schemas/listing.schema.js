const { z } = require("zod");

const createListingSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  photoUrl: z.string().url().optional(),
  originalPrice: z.number().positive(),
  quantity: z.number().int().positive(),
  expiryAt: z.string().datetime(),
  decayStartHours: z.number().int().min(1).max(72).default(24),
  minPricePct: z.number().int().min(5).max(50).default(20),
  ingredientIds: z.array(z.string().uuid()).optional().default([]),
});

const updateListingSchema = createListingSchema.partial();

const allergenCheckSchema = z.object({
  ingredientIds: z.array(z.string().uuid()).min(1),
});

module.exports = { createListingSchema, updateListingSchema, allergenCheckSchema };
