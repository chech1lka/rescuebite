const { calculateDecayedPrice } = require("../src/services/listings.service");
const { haversine } = require("../src/services/route.service");

describe("Price Decay Formula", () => {
  const base = { originalPrice: 1000, decayStartHours: 24, minPricePct: 20 };

  it("returns original price before decay starts", () => {
    const expiryAt = new Date(Date.now() + 48 * 3600000);
    const { currentPrice, discountPct } = calculateDecayedPrice({ ...base, expiryAt });
    expect(currentPrice).toBe(1000);
    expect(discountPct).toBe(0);
  });

  it("returns 0 when expired", () => {
    const expiryAt = new Date(Date.now() - 1000);
    const { currentPrice, discountPct } = calculateDecayedPrice({ ...base, expiryAt });
    expect(currentPrice).toBe(0);
    expect(discountPct).toBe(100);
  });

  it("never goes below minPricePct", () => {
    const expiryAt = new Date(Date.now() + 60000);
    const { currentPrice } = calculateDecayedPrice({ ...base, expiryAt });
    expect(currentPrice).toBeGreaterThanOrEqual(base.originalPrice * base.minPricePct / 100);
  });

  it("rounds to 2 decimal places", () => {
    const expiryAt = new Date(Date.now() + 12 * 3600000);
    const { currentPrice } = calculateDecayedPrice({ ...base, originalPrice: 333, expiryAt });
    const decimals = (currentPrice.toString().split(".")[1] || "").length;
    expect(decimals).toBeLessThanOrEqual(2);
  });
});

describe("Haversine Distance", () => {
  it("calculates distance between Almaty points", () => {
    // Almaty city center to airport (~15km)
    const dist = haversine(43.238, 76.945, 43.352, 77.040);
    expect(dist).toBeGreaterThan(10);
    expect(dist).toBeLessThan(25);
  });

  it("returns 0 for same point", () => {
    expect(haversine(43.238, 76.945, 43.238, 76.945)).toBe(0);
  });

  it("is symmetric", () => {
    const d1 = haversine(43.238, 76.945, 43.352, 77.040);
    const d2 = haversine(43.352, 77.040, 43.238, 76.945);
    expect(Math.abs(d1 - d2)).toBeLessThan(0.001);
  });
});

describe("TSP Route Optimization", () => {
  it("haversine distance is always positive", () => {
    const dist = haversine(43.0, 76.0, 43.5, 77.0);
    expect(dist).toBeGreaterThan(0);
  });
});
