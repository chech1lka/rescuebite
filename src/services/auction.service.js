const prisma = require("../config/database");
const { createError } = require("../middleware/errorHandler");
const emailService = require("./email.service");

// Place a bid — reverse auction: LOWEST bid wins
const placeBid = async (auctionId, userId, amount) => {
  const auction = await prisma.auction.findUnique({
    where: { id: auctionId },
    include: { listing: true },
  });
  if (!auction) throw createError(404, "Auction not found");
  if (auction.status !== "ACTIVE") throw createError(400, "Auction is not active");
  if (new Date() > new Date(auction.endsAt)) throw createError(400, "Auction has ended");

  // Amount must be <= current listing price (reverse auction — bidding down)
  if (amount > auction.listing.currentPrice) {
    throw createError(400, `Bid must be lower than current price (${auction.listing.currentPrice})`);
  }
  if (amount < 0) throw createError(400, "Bid cannot be negative");

  const bid = await prisma.auctionBid.create({
    data: { auctionId, userId, amount },
    include: { user: { select: { id: true, email: true } } },
  });

  return bid;
};

// Get auction with all bids sorted lowest first
const getAuction = async (auctionId) => {
  const auction = await prisma.auction.findUnique({
    where: { id: auctionId },
    include: {
      listing: { select: { id: true, name: true, originalPrice: true, currentPrice: true, expiryAt: true } },
      bids: {
        orderBy: { amount: "asc" },
        include: { user: { select: { id: true, email: true } } },
      },
    },
  });
  if (!auction) throw createError(404, "Auction not found");
  return auction;
};

// Get active auctions
const getActiveAuctions = async ({ cursor, limit = 20 }) => {
  const take = Math.min(Number(limit), 50);
  const auctions = await prisma.auction.findMany({
    where: { status: "ACTIVE", endsAt: { gt: new Date() } },
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    orderBy: { endsAt: "asc" },
    include: {
      listing: { select: { id: true, name: true, currentPrice: true, expiryAt: true, vendor: { select: { storeName: true } } } },
      bids: { orderBy: { amount: "asc" }, take: 1 }, // lowest bid
    },
  });
  const hasMore = auctions.length > take;
  const data = hasMore ? auctions.slice(0, -1) : auctions;
  return { data, nextCursor: hasMore ? data[data.length - 1].id : null, hasMore };
};

// Cron: resolve expired auctions — pick lowest bidder as winner
const resolveExpiredAuctions = async () => {
  const expired = await prisma.auction.findMany({
    where: { status: "ACTIVE", endsAt: { lte: new Date() } },
    include: {
      bids: { orderBy: { amount: "asc" }, take: 1 },
      listing: true,
    },
  });

  for (const auction of expired) {
    if (auction.bids.length === 0) {
      // No bids — cancel auction
      await prisma.$transaction([
        prisma.auction.update({ where: { id: auction.id }, data: { status: "CANCELLED" } }),
        prisma.listing.update({ where: { id: auction.listingId }, data: { status: "COMPOST" } }),
      ]);
      console.log(`Auction ${auction.id} cancelled — no bids`);
    } else {
      const winner = auction.bids[0];
      // Create order for winner at winning bid price
      await prisma.$transaction(async (tx) => {
        await tx.auction.update({
          where: { id: auction.id },
          data: { status: "COMPLETED", winnerId: winner.userId, winningBid: winner.amount },
        });
        await tx.listing.update({
          where: { id: auction.listingId },
          data: { status: "SOLD_OUT", currentPrice: winner.amount },
        });
        await tx.order.create({
          data: {
            customerId: winner.userId,
            vendorId: auction.listing.vendorId,
            status: "PLACED",
            deliveryType: "PICKUP",
            totalPrice: winner.amount,
            items: { create: [{ listingId: auction.listingId, quantity: 1, unitPrice: winner.amount }] },
          },
        });
        await tx.auditLog.create({
          data: { userId: winner.userId, action: "AUCTION_WON", entity: "Auction", entityId: auction.id, newValue: { winningBid: winner.amount } },
        });
      });
      // Send auction won email
      const winner_user = await prisma.user.findUnique({ where: { id: winner.userId }, select: { email: true } });
      if (winner_user) emailService.sendAuctionWonEmail(winner_user.email, { listingName: auction.listing.name, winningBid: winner.amount }).catch(()=>{});
      console.log(`Auction ${auction.id} completed — winner: ${winner.userId} at ${winner.amount}`);
    }
  }
};

module.exports = { placeBid, getAuction, getActiveAuctions, resolveExpiredAuctions };
