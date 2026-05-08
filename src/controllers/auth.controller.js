const authService = require("../services/auth.service");

const register = async (req, res, next) => {
  try { res.status(201).json(await authService.register(req.body)); } catch (e) { next(e); }
};
const verifyEmail = async (req, res, next) => {
  try { res.json(await authService.verifyEmail(req.query.token)); } catch (e) { next(e); }
};
const login = async (req, res, next) => {
  try { res.json(await authService.login(req.body)); } catch (e) { next(e); }
};
const refresh = async (req, res, next) => {
  try { res.json(await authService.refresh(req.body.refreshToken)); } catch (e) { next(e); }
};
const logout = async (req, res, next) => {
  try {
    await authService.logout(req.token, req.body.refreshToken);
    res.json({ message: "Logged out successfully" });
  } catch (e) { next(e); }
};
const forgotPassword = async (req, res, next) => {
  try { res.json(await authService.forgotPassword(req.body.email)); } catch (e) { next(e); }
};
const resetPassword = async (req, res, next) => {
  try { res.json(await authService.resetPassword(req.query.token, req.body.password)); } catch (e) { next(e); }
};

module.exports = { register, verifyEmail, login, refresh, logout, forgotPassword, resetPassword };
