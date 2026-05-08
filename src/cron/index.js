const cron = require("node-cron");
const { applyPriceDecay } = require("../services/listings.service");
const { resolveExpiredAuctions } = require("../services/auction.service");

const startCronJobs = () => {
  // Price decay every 15 minutes
  cron.schedule("*/15 * * * *", async () => {
    console.log("⏰  [CRON] Price decay running...");
    try { await applyPriceDecay(); } catch (e) { console.error("❌  Price decay failed:", e.message); }
  });

  // Resolve expired auctions every minute
  cron.schedule("* * * * *", async () => {
    try { await resolveExpiredAuctions(); } catch (e) { console.error("❌  Auction resolve failed:", e.message); }
  });

  console.log("✅  Cron jobs started (price decay: 15min, auction resolve: 1min)");
};

module.exports = { startCronJobs };
