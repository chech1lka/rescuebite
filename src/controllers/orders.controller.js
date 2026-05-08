const ordersService = require("../services/orders.service");

const create = async (req, res, next) => {
  try { res.status(201).json(await ordersService.createOrder(req.user.id, req.user.role, req.body)); } catch (e) { next(e); }
};
const getAll = async (req, res, next) => {
  try { res.json(await ordersService.getOrders(req.user.id, req.user.role, req.query)); } catch (e) { next(e); }
};
const getOne = async (req, res, next) => {
  try { res.json(await ordersService.getOrderById(req.params.id, req.user.id)); } catch (e) { next(e); }
};
const updateStatus = async (req, res, next) => {
  try { res.json(await ordersService.updateOrderStatus(req.params.id, req.user.id, req.user.role, req.body.status)); } catch (e) { next(e); }
};
const refund = async (req, res, next) => {
  try { res.json(await ordersService.requestRefund(req.params.id, req.user.id, req.body.reason)); } catch (e) { next(e); }
};

module.exports = { create, getAll, getOne, updateStatus, refund };
