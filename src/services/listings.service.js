const prisma = require("../config/database");
const { createError } = require("../middleware/errorHandler");

// ─── Price Decay Formula ──────────────────────────────────────────────────────
const calculateDecayedPrice = (listing) => {
  const now = new Date();
  const expiry = new Date(listing.expiryAt);
  const decayStart = new Date(expiry.getTime() - listing.decayStartHours * 3600000);

  if (now < decayStart) return { currentPrice: listing.originalPrice, discountPct: 0 };
  if (now >= expiry)    return { currentPrice: 0, discountPct: 100 };

  const progress = (now - decayStart) / (expiry - decayStart);
  const minPrice = listing.originalPrice * (listing.minPricePct / 100);
  const currentPrice = Math.max(minPrice, listing.originalPrice - (listing.originalPrice - minPrice) * progress);
  const discountPct = Math.round(((listing.originalPrice - currentPrice) / listing.originalPrice) * 100);
  return { currentPrice: Math.round(currentPrice * 100) / 100, discountPct };
};

// ─── State Machine ────────────────────────────────────────────────────────────
const resolveStatus = (listing, currentPrice) => {
  const now = new Date();
  const expiry = new Date(listing.expiryAt);
  const auctionStart = new Date(expiry.getTime() - 30 * 60000); // 30 min before expiry

  if (now >= expiry) return "COMPOST";
  if (now >= auctionStart && listing.status !== "SOLD_OUT") return "AUCTION";
  const discountPct = Math.round(((listing.originalPrice - currentPrice) / listing.originalPrice) * 100);
  if (discountPct >= 100) return "FREE";
  if (discountPct > 0)    return "DISCOUNTED";
  return "FRESH";
};

// ─── Allergen Parser (life-critical validation) ───────────────────────────────
const checkAllergens = async (ingredientIds, userId) => {
  // Strict schema: every ingredientId must exist
  const ingredients = await prisma.ingredient.findMany({
    where: { id: { in: ingredientIds } },
    include: { allergens: true },
  });

  if (ingredients.length !== ingredientIds.length) {
    const found = ingredients.map((i) => i.id);
    const missing = ingredientIds.filter((id) => !found.includes(id));
    throw createError(422, `Unknown ingredient IDs: ${missing.join(", ")}`);
  }

  const detectedAllergens = [...new Set(ingredients.flatMap((i) => i.allergens.map((a) => a.allergen)))];

  let userAllergens = [];
  let conflicts = [];

  if (userId) {
    const ca = await prisma.customerAllergen.findMany({ where: { userId } });
    userAllergens = ca.map((a) => a.allergen);
    conflicts = detectedAllergens.filter((a) => userAllergens.includes(a));
  }

  return { ingredientCount: ingredientIds.length, detectedAllergens, userAllergens, conflicts, isSafe: conflicts.length === 0 };
};

// ─── CRUD ─────────────────────────────────────────────────────────────────────
const getListings = async ({ cursor, limit = 20, status }) => {
  const take = Math.min(Number(limit), 50);
  const where = { status: status ? status : { in: ["FRESH", "DISCOUNTED", "FREE", "AUCTION"] } };
  const listings = await prisma.listing.findMany({
    where, take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    orderBy: { expiryAt: "asc" },
    include: {
      vendor: { select: { id: true, storeName: true, latitude: true, longitude: true } },
      auction: { select: { id: true, endsAt: true, status: true } },
    },
  });
  const hasMore = listings.length > take;
  const data = hasMore ? listings.slice(0, -1) : listings;
  return { data, nextCursor: hasMore ? data[data.length - 1].id : null, hasMore };
};

const getNearby = async ({ lat, lng, radiusKm = 5, cursor, limit = 20, userId }) => {
  const take = Math.min(Number(limit), 50);
  const R = 6371;

  let userAllergens = [];
  if (userId) {
    const ca = await prisma.customerAllergen.findMany({ where: { userId } });
    userAllergens = ca.map((a) => a.allergen);
  }

  const allListings = await prisma.listing.findMany({
    where: { status: { in: ["FRESH", "DISCOUNTED", "FREE", "AUCTION"] }, quantity: { gt: 0 }, expiryAt: { gt: new Date() } },
    include: {
      vendor: { select: { id: true, storeName: true, latitude: true, longitude: true, address: true } },
      ingredients: { include: { ingredient: { include: { allergens: true } } } },
      auction: { select: { id: true, endsAt: true, status: true } },
    },
  });

  const withDistance = allListings.map((l) => {
    const dLat = ((l.vendor.latitude - lat) * Math.PI) / 180;
    const dLng = ((l.vendor.longitude - lng) * Math.PI) / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat * Math.PI) / 180) * Math.cos((l.vendor.latitude * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
    return { ...l, distance_km: Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 100) / 100 };
  })
  .filter((l) => l.distance_km <= radiusKm)
  .filter((l) => {
    if (!userAllergens.length) return true;
    const listingAllergens = l.ingredients.flatMap((li) => li.ingredient.allergens.map((ia) => ia.allergen));
    return !listingAllergens.some((a) => userAllergens.includes(a));
  })
  .sort((a, b) => a.distance_km - b.distance_km);

  let startIndex = 0;
  if (cursor) {
    const idx = withDistance.findIndex((l) => l.id === cursor);
    if (idx !== -1) startIndex = idx + 1;
  }
  const page = withDistance.slice(startIndex, startIndex + take + 1);
  const hasMore = page.length > take;
  const data = hasMore ? page.slice(0, -1) : page;
  return { data, nextCursor: hasMore ? data[data.length - 1].id : null, hasMore };
};

const getListingById = async (id) => {
  const listing = await prisma.listing.findUnique({
    where: { id },
    include: {
      vendor: { select: { id: true, storeName: true, address: true, latitude: true, longitude: true } },
      ingredients: { include: { ingredient: { include: { allergens: true } } } },
      auction: { include: { bids: { orderBy: { amount: "asc" }, take: 5 } } },
    },
  });
  if (!listing) throw createError(404, "Listing not found");
  return listing;
};

const createListing = async (userId, data) => {
  const vendor = await prisma.vendor.findUnique({ where: { userId } });
  if (!vendor) throw createError(404, "Vendor profile not found");
  if (!vendor.isApproved) throw createError(403, "Vendor not approved yet");

  const { ingredientIds, ...listingData } = data;
  return prisma.listing.create({
    data: {
      ...listingData, vendorId: vendor.id, currentPrice: listingData.originalPrice,
      expiryAt: new Date(listingData.expiryAt),
      ingredients: ingredientIds?.length ? { create: ingredientIds.map((id) => ({ ingredientId: id })) } : undefined,
    },
    include: { ingredients: { include: { ingredient: true } } },
  });
};

const updateListing = async (id, userId, data) => {
  const vendor = await prisma.vendor.findUnique({ where: { userId } });
  if (!vendor) throw createError(404, "Vendor not found");
  const listing = await prisma.listing.findUnique({ where: { id } });
  if (!listing) throw createError(404, "Listing not found");
  if (listing.vendorId !== vendor.id) throw createError(403, "Not your listing");
  if (listing.status === "DELETED") throw createError(400, "Listing is deleted");

  const { ingredientIds, ...updateData } = data;
  return prisma.$transaction(async (tx) => {
    if (ingredientIds !== undefined) {
      await tx.listingIngredient.deleteMany({ where: { listingId: id } });
      if (ingredientIds.length > 0) {
        await tx.listingIngredient.createMany({ data: ingredientIds.map((iid) => ({ listingId: id, ingredientId: iid })) });
      }
    }
    return tx.listing.update({
      where: { id }, data: { ...updateData, ...(updateData.expiryAt ? { expiryAt: new Date(updateData.expiryAt) } : {}) },
      include: { ingredients: { include: { ingredient: true } } },
    });
  });
};

const deleteListing = async (id, userId) => {
  const vendor = await prisma.vendor.findUnique({ where: { userId } });
  if (!vendor) throw createError(404, "Vendor not found");
  const listing = await prisma.listing.findUnique({ where: { id } });
  if (!listing) throw createError(404, "Listing not found");
  if (listing.vendorId !== vendor.id) throw createError(403, "Not your listing");
  await prisma.listing.update({ where: { id }, data: { status: "DELETED" } });
};

// ─── Cron: price decay + auto-auction trigger ─────────────────────────────────
const applyPriceDecay = async () => {
  const active = await prisma.listing.findMany({
    where: { status: { in: ["FRESH", "DISCOUNTED", "FREE"] } },
  });

  for (const listing of active) {
    const { currentPrice, discountPct } = calculateDecayedPrice(listing);
    const newStatus = resolveStatus(listing, currentPrice);

    // Auto-create auction when status becomes AUCTION
    if (newStatus === "AUCTION" && listing.status !== "AUCTION") {
      const expiry = new Date(listing.expiryAt);
      await prisma.$transaction([
        prisma.listing.update({ where: { id: listing.id }, data: { currentPrice, discountPct, status: "AUCTION" } }),
        prisma.auction.upsert({
          where: { listingId: listing.id },
          create: { listingId: listing.id, startsAt: new Date(), endsAt: expiry, status: "ACTIVE" },
          update: {},
        }),
      ]);
    } else if (currentPrice !== listing.currentPrice || discountPct !== listing.discountPct || newStatus !== listing.status) {
      await prisma.listing.update({ where: { id: listing.id }, data: { currentPrice, discountPct, status: newStatus } });
    }
  }
  console.log(`✅  Price decay applied to ${active.length} listings`);
};

module.exports = { getListings, getNearby, getListingById, createListing, updateListing, deleteListing, checkAllergens, applyPriceDecay, calculateDecayedPrice };
