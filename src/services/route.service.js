const prisma = require("../config/database");
const { createError } = require("../middleware/errorHandler");

// Haversine distance between two points
const haversine = (lat1, lng1, lat2, lng2) => {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// TSP-lite: Nearest Neighbor greedy algorithm
// Builds optimal pickup route: Driver start → Vendor pickups → Delivery points
const optimizeRoute = async (driverUserId, orderIds) => {
  const driver = await prisma.driver.findUnique({ where: { userId: driverUserId } });
  if (!driver) throw createError(404, "Driver profile not found");
  if (!driver.latitude || !driver.longitude) throw createError(400, "Driver location not set. Update your status with coordinates first.");

  const orders = await prisma.order.findMany({
    where: { id: { in: orderIds }, driverId: driver.id },
    include: {
      vendor: { select: { id: true, storeName: true, address: true, latitude: true, longitude: true } },
      customer: { select: { id: true, email: true } },
      shelter: { select: { id: true, name: true, address: true, latitude: true, longitude: true } },
      items: { include: { listing: { select: { name: true } } } },
    },
  });

  console.log(`Route debug: orderIds=${JSON.stringify(orderIds)} driverId=${driver.id} found=${orders.length}`); if (orders.length !== orderIds.length) {
    throw createError(404, "Some orders not found or not assigned to this driver");
  }

  // Build waypoints list
  // Pickup stops = unique vendors
  // Delivery stops = customer/shelter locations (use vendor coords as proxy for now, real app needs customer address geocoding)
  const pickupStops = [];
  const deliveryStops = [];
  const seenVendors = new Set();

  for (const order of orders) {
    if (!seenVendors.has(order.vendor.id)) {
      seenVendors.add(order.vendor.id);
      pickupStops.push({
        type: "PICKUP",
        orderId: order.id,
        vendorId: order.vendor.id,
        name: order.vendor.storeName,
        address: order.vendor.address,
        latitude: order.vendor.latitude,
        longitude: order.vendor.longitude,
        items: order.items.map((i) => i.listing.name),
      });
    }

    // Delivery stop
    const dest = order.shelter || null;
    deliveryStops.push({
      type: "DELIVERY",
      orderId: order.id,
      name: dest ? dest.name : (order.customer?.email || "Customer"),
      address: dest ? dest.address : "Customer address",
      latitude: dest ? dest.latitude : order.vendor.latitude, // fallback
      longitude: dest ? dest.longitude : order.vendor.longitude,
    });
  }

  // Nearest Neighbor TSP on all stops combined
  const allStops = [...pickupStops, ...deliveryStops];
  const visited = new Array(allStops.length).fill(false);
  const route = [];
  let currentLat = driver.latitude;
  let currentLng = driver.longitude;
  let totalDistance = 0;

  // Must visit all pickups before deliveries (constraint)
  // Phase 1: pickups
  const pickupIndices = pickupStops.map((_, i) => i);
  while (pickupIndices.length > 0) {
    let nearest = null;
    let nearestDist = Infinity;
    let nearestIdx = -1;
    for (let i = 0; i < pickupIndices.length; i++) {
      const stop = allStops[pickupIndices[i]];
      const dist = haversine(currentLat, currentLng, stop.latitude, stop.longitude);
      if (dist < nearestDist) { nearestDist = dist; nearest = stop; nearestIdx = i; }
    }
    totalDistance += nearestDist;
    route.push({ ...nearest, distanceFromPrev: Math.round(nearestDist * 100) / 100 });
    currentLat = nearest.latitude;
    currentLng = nearest.longitude;
    pickupIndices.splice(nearestIdx, 1);
  }

  // Phase 2: deliveries (nearest neighbor)
  const deliveryIndices = deliveryStops.map((_, i) => pickupStops.length + i);
  while (deliveryIndices.length > 0) {
    let nearest = null;
    let nearestDist = Infinity;
    let nearestIdx = -1;
    for (let i = 0; i < deliveryIndices.length; i++) {
      const stop = allStops[deliveryIndices[i]];
      const dist = haversine(currentLat, currentLng, stop.latitude, stop.longitude);
      if (dist < nearestDist) { nearestDist = dist; nearest = stop; nearestIdx = i; }
    }
    totalDistance += nearestDist;
    route.push({ ...nearest, distanceFromPrev: Math.round(nearestDist * 100) / 100 });
    currentLat = nearest.latitude;
    currentLng = nearest.longitude;
    deliveryIndices.splice(nearestIdx, 1);
  }

  return {
    driverStart: { latitude: driver.latitude, longitude: driver.longitude },
    totalStops: route.length,
    totalDistanceKm: Math.round(totalDistance * 100) / 100,
    estimatedMinutes: Math.round((totalDistance / 30) * 60), // assuming 30km/h avg city speed
    route,
    algorithm: "nearest-neighbor-tsp",
  };
};

module.exports = { optimizeRoute, haversine };
