const jwt = require("jsonwebtoken");
const redis = require("../config/redis");
const env = require("../config/env");
const { createError } = require("./errorHandler");

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) return next(createError(401, "No token provided"));
    const token = authHeader.split(" ")[1];
    const isBlacklisted = await redis.get(`blacklist:${token}`);
    if (isBlacklisted) return next(createError(401, "Token has been revoked"));
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET);
    req.user = decoded;
    req.token = token;
    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") return next(createError(401, "Token expired"));
    return next(createError(401, "Invalid token"));
  }
};

module.exports = { authenticate };
