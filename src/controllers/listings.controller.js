const listingsService = require("../services/listings.service");

const getListings  = async (req, res, next) => { try { res.json(await listingsService.getListings(req.query)); } catch (e) { next(e); } };
const getNearby    = async (req, res, next) => {
  try {
    const { lat, lng, radius, cursor, limit } = req.query;
    if (!lat || !lng) return res.status(400).json({ error: "lat and lng required" });
    res.json(await listingsService.getNearby({ lat: parseFloat(lat), lng: parseFloat(lng), radiusKm: radius ? parseFloat(radius) : 5, cursor, limit, userId: req.user?.id }));
  } catch (e) { next(e); }
};
const getOne       = async (req, res, next) => { try { res.json(await listingsService.getListingById(req.params.id)); } catch (e) { next(e); } };
const create       = async (req, res, next) => { try { res.status(201).json(await listingsService.createListing(req.user.id, req.body)); } catch (e) { next(e); } };
const update       = async (req, res, next) => { try { res.json(await listingsService.updateListing(req.params.id, req.user.id, req.body)); } catch (e) { next(e); } };
const remove       = async (req, res, next) => { try { await listingsService.deleteListing(req.params.id, req.user.id); res.status(204).send(); } catch (e) { next(e); } };
const checkAllergens = async (req, res, next) => {
  try { res.json(await listingsService.checkAllergens(req.body.ingredientIds, req.user?.id)); } catch (e) { next(e); }
};

module.exports = { getListings, getNearby, getOne, create, update, remove, checkAllergens };
