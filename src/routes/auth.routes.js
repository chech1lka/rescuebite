const { Router } = require("express");
const controller = require("../controllers/auth.controller");
const { validate } = require("../middleware/validate");
const { authenticate } = require("../middleware/auth");
const { rateLimitMiddleware } = require("../middleware/rateLimiter");
const { registerSchema, loginSchema, refreshSchema } = require("../schemas/auth.schema");
const { z } = require("zod");

const router = Router();

router.post("/register",       rateLimitMiddleware, validate(registerSchema), controller.register);
router.get("/verify-email",    controller.verifyEmail);
router.post("/login",          rateLimitMiddleware, validate(loginSchema), controller.login);
router.post("/refresh",        validate(refreshSchema), controller.refresh);
router.post("/logout",         authenticate, controller.logout);
router.post("/forgot-password",rateLimitMiddleware, validate(z.object({ email: z.string().email() })), controller.forgotPassword);
router.post("/reset-password", validate(z.object({ password: z.string().min(8).regex(/[A-Z]/).regex(/[0-9]/) })), controller.resetPassword);

module.exports = router;
