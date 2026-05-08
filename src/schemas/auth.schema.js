const { z } = require("zod");

const registerSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z.string().min(8).regex(/[A-Z]/, "Need uppercase").regex(/[0-9]/, "Need number"),
  role: z.enum(["CUSTOMER", "VENDOR", "DRIVER", "SHELTER"]).default("CUSTOMER"),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

module.exports = { registerSchema, loginSchema, refreshSchema };
