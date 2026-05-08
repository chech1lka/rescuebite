const prisma = require("../config/database");
const redis = require("../config/redis");
const { createError } = require("../middleware/errorHandler");
const { haversine } = require("./route.service");
const emailService = require("./email.service");

const RESERVATION_TTL = 600;
const GEOFENCE_RADIUS_METERS = 100;

// ─── Redis stock reservation ──────────────────────────────────────────────────
const reserveStock = async (listingId, qty) => {
  const key = `reservation:${listingId}`;
  const reserved = await redis.incrby(key, qty);
  await redis.expire(key, RESERVATION_TTL);
  return reserved;
};

const releaseReservation = async (listingId, qty) => {
  await redis.decrby(`reservation:${listingId}`, qty);
};

// ─── Create Order ─────────────────────────────────────────────────────────────
const createOrder = async (userId, userRole, { items, deliveryType, shelterId }) => {
  const listingIds = items.map((i) => i.listingId);
  const listings = await prisma.listing.findMany({
    where: { id: { in: listingIds }, status: { in: ["FRESH", "DISCOUNTED", "FREE", "AUCTION"] } },
  });
  if (listings.length !== listingIds.length) throw createError(404, "One or more listings unavailable");

  // Redis reservations
  const reservations = [];
  try {
    for (const item of items) {
      const listing = listings.find((l) => l.id === item.listingId);
      const reserved = await reserveStock(listing.id, item.quantity);
      reservations.push({ listingId: listing.id, quantity: item.quantity });
      if (reserved > listing.quantity) {
        await releaseReservation(listing.id, item.quantity);
        throw createError(409, `Not enough stock: ${listing.name}`);
      }
    }
  } catch (err) {
    for (const r of reservations) await releaseReservation(r.listingId, r.quantity);
    throw err;
  }

  try {
    const order = await prisma.$transaction(async (tx) => {
      let totalPrice = 0;
      const orderItemsData = [];

      for (const item of items) {
        const listing = listings.find((l) => l.id === item.listingId);
        const fresh = await tx.listing.findUnique({ where: { id: listing.id } });
        if (fresh.quantity < item.quantity) throw createError(409, `Not enough stock: ${listing.name}`);

        await tx.listing.update({
          where: { id: listing.id },
          data: { quantity: { decrement: item.quantity }, ...(fresh.quantity - item.quantity <= 0 ? { status: "SOLD_OUT" } : {}) },
        });
        totalPrice += listing.currentPrice * item.quantity;
        orderItemsData.push({ listingId: listing.id, quantity: item.quantity, unitPrice: listing.currentPrice });
      }

      const vendorListing = await tx.listing.findUnique({ where: { id: listings[0].id }, select: { vendorId: true } });

      // Shelter orders: customerId = null, shelterId = set
      const isShelf = userRole === "SHELTER";
      let shelterRecord = null;
      if (isShelf) {
        shelterRecord = await tx.shelter.findUnique({ where: { userId } });
        if (!shelterRecord) throw createError(404, "Shelter profile not found");
      }

      const newOrder = await tx.order.create({
        data: {
          ...(isShelf ? { shelterId: shelterRecord.id } : { customerId: userId }),
          vendorId: vendorListing.vendorId,
          status: "PLACED",
          deliveryType,
          totalPrice: Math.round(totalPrice * 100) / 100,
          items: { create: orderItemsData },
        },
        include: { items: true },
      });

      await tx.auditLog.create({
        data: { userId, action: "ORDER_PLACED", entity: "Order", entityId: newOrder.id, newValue: { totalPrice: newOrder.totalPrice } },
      });
      return newOrder;
    });

    for (const r of reservations) await releaseReservation(r.listingId, r.quantity);
    return order;
  } catch (err) {
    for (const r of reservations) await releaseReservation(r.listingId, r.quantity);
    throw err;
  }
};

// ─── Geofencing: update driver location + auto-complete delivery ──────────────
const updateDriverLocation = async (driverUserId, lat, lng) => {
  const driver = await prisma.driver.findUnique({ where: { userId: driverUserId } });
  if (!driver) throw createError(404, "Driver profile not found");

  // Update driver coordinates
  await prisma.driver.update({ where: { id: driver.id }, data: { latitude: lat, longitude: lng } });

  // Check all active deliveries for this driver
  const activeDeliveries = await prisma.order.findMany({
    where: { driverId: driver.id, status: "PICKED_UP" },
    include: {
      shelter: { select: { latitude: true, longitude: true, name: true, address: true } },
      vendor: { select: { latitude: true, longitude: true } },
    },
  });

  const autoCompleted = [];

  for (const order of activeDeliveries) {
    // Determine destination: shelter or vendor coords (fallback)
    const destLat = order.shelter?.latitude ?? order.vendor.latitude;
    const destLng = order.shelter?.longitude ?? order.vendor.longitude;

    const distanceKm = haversine(lat, lng, destLat, destLng);
    const distanceMeters = distanceKm * 1000;

    if (distanceMeters <= GEOFENCE_RADIUS_METERS) {
      // Auto-complete delivery
      await prisma.$transaction(async (tx) => {
        await tx.order.update({ where: { id: order.id }, data: { status: "DELIVERED" } });
        await tx.auditLog.create({
          data: {
            userId: driverUserId, action: "DELIVERY_AUTO_COMPLETED_GEOFENCE",
            entity: "Order", entityId: order.id,
            newValue: { driverLat: lat, driverLng: lng, distanceMeters: Math.round(distanceMeters), geofenceRadius: GEOFENCE_RADIUS_METERS },
          },
        });
      });
      autoCompleted.push({ orderId: order.id, distanceMeters: Math.round(distanceMeters) });
    }
  }

  return {
    location: { latitude: lat, longitude: lng },
    geofenceChecked: activeDeliveries.length,
    autoCompleted,
    message: autoCompleted.length > 0 ? `${autoCompleted.length} delivery auto-completed by geofence` : "Location updated",
  };
};

// ─── Order queries ────────────────────────────────────────────────────────────
const getOrders = async (userId, userRole, { cursor, limit = 20, status }) => {
  const take = Math.min(Number(limit), 50);
  let where = {};

  if (userRole === "SHELTER") {
    const shelter = await prisma.shelter.findUnique({ where: { userId } });
    if (!shelter) throw createError(404, "Shelter not found");
    where = { shelterId: shelter.id };
  } else {
    where = { customerId: userId };
  }
  if (status) where.status = status;

  const orders = await prisma.order.findMany({
    where, take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    orderBy: { createdAt: "desc" },
    include: {
      items: { include: { listing: { select: { id: true, name: true } } } },
      vendor: { select: { id: true, storeName: true } },
    },
  });
  const hasMore = orders.length > take;
  const data = hasMore ? orders.slice(0, -1) : orders;
  return { data, nextCursor: hasMore ? data[data.length - 1].id : null, hasMore };
};

const getOrderById = async (id, userId) => {
  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      items: { include: { listing: true } },
      vendor: { select: { id: true, storeName: true, address: true } },
      driver: { select: { id: true } },
      shelter: { select: { id: true, name: true } },
    },
  });
  if (!order) throw createError(404, "Order not found");
  if (order.customerId !== userId && order.shelter?.userId !== userId) throw createError(403, "Not your order");
  return order;
};

const updateOrderStatus = async (orderId, actorId, actorRole, newStatus, driverId = null) => {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw createError(404, "Order not found");

  const allowed = {
    VENDOR:   { PLACED: "ACCEPTED", ACCEPTED: "READY" },
    DRIVER:   { READY: "PICKED_UP", PICKED_UP: "DELIVERED" },
    CUSTOMER: { PLACED: "CANCELLED" },
    SHELTER:  { PLACED: "CANCELLED" },
    ADMIN:    {},
  };
  const transition = allowed[actorRole];
  if (!transition || transition[order.status] !== newStatus) {
    throw createError(400, `Cannot transition from ${order.status} to ${newStatus}`);
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.order.update({
      where: { id: orderId },
      data: {
        status: newStatus,
        ...(actorRole === "DRIVER" && newStatus === "PICKED_UP" && driverId ? { driverId } : {}),
      },
    });
    if (newStatus === "CANCELLED") {
      for (const item of await tx.orderItem.findMany({ where: { orderId } })) {
        await tx.listing.update({ where: { id: item.listingId }, data: { quantity: { increment: item.quantity } } });
      }
    }
    await tx.auditLog.create({
      data: { userId: actorId, action: `ORDER_${newStatus}`, entity: "Order", entityId: orderId, oldValue: { status: order.status }, newValue: { status: newStatus } },
    });
    return updated;
  });
};

const requestRefund = async (orderId, userId, reason) => {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw createError(404, "Order not found");
  if (order.customerId !== userId) throw createError(403, "Not your order");
  if (order.status !== "DELIVERED") throw createError(400, "Can only refund delivered orders");
  return prisma.$transaction(async (tx) => {
    const updated = await tx.order.update({ where: { id: orderId }, data: { status: "REFUND_REQUESTED" } });
    await tx.auditLog.create({ data: { userId, action: "REFUND_REQUESTED", entity: "Order", entityId: orderId, newValue: { reason } } });
    return updated;
  });
};

module.exports = { createOrder, getOrders, getOrderById, updateOrderStatus, requestRefund, updateDriverLocation };
