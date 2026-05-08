const { RateLimiterRedis } = require("rate-limiter-flexible");
const redis = require("../config/redis");
const env = require("../config/env");

const authLimiter = new RateLimiterRedis({
  storeClient: redis,
  keyPrefix: "rate_limit_auth",
  points: env.RATE_LIMIT_MAX_REQUESTS,
  duration: Math.floor(env.RATE_LIMIT_WINDOW_MS / 1000),
  blockDuration: 60,
});

const rateLimitMiddleware = async (req, res, next) => {
  try {
    await authLimiter.consume(req.ip);
    next();
  } catch (err) {
    const secs = Math.round(err.msBeforeNext / 1000) || 60;
    res.set("Retry-After", String(secs));
    res.status(429).json({ error: "Too many requests. Try again later.", retryAfter: secs });
  }
};

module.exports = { rateLimitMiddleware };
