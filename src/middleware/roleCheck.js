const { createError } = require("./errorHandler");

const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) return next(createError(401, "Not authenticated"));
  if (!roles.includes(req.user.role)) return next(createError(403, `Access denied. Required: ${roles.join(" or ")}`));
  next();
};

module.exports = { requireRole };
