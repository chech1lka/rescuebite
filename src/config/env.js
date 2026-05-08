const { z } = require("zod");
require("dotenv").config();

const envSchema = z.object({
  PORT: z.string().default("3000"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  REDIS_URL: z.string().min(1, "REDIS_URL is required"),
  JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET must be at least 32 chars"),
  JWT_REFRESH_SECRET: z.string().min(32, "JWT_REFRESH_SECRET must be at least 32 chars"),
  JWT_ACCESS_EXPIRES_IN: z.string().default("15m"),
  JWT_REFRESH_EXPIRES_IN: z.string().default("7d"),
  BCRYPT_ROUNDS: z.string().transform(Number).default("12"),
  CORS_ORIGIN: z.string().default("http://localhost:3001"),
  RATE_LIMIT_WINDOW_MS: z.string().transform(Number).default("60000"),
  RATE_LIMIT_MAX_REQUESTS: z.string().transform(Number).default("5"),
  EMAIL_USER: z.string().min(1, "EMAIL_USER is required"),
  EMAIL_PASS: z.string().min(1, "EMAIL_PASS is required"),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("❌  Invalid environment variables:");
  parsed.error.errors.forEach((e) => console.error(`   ${e.path.join(".")}: ${e.message}`));
  process.exit(1);
}

module.exports = parsed.data;
