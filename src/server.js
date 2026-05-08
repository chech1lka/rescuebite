const app = require("./app");
const env = require("./config/env");
const prisma = require("./config/database");
const redis = require("./config/redis");
const { startCronJobs } = require("./cron/index");

const start = async () => {
  try {
    await redis.connect();
    await prisma.$connect();
    console.log("✅  Database connected");
    startCronJobs();
    app.listen(env.PORT, () => {
      console.log(`🚀  RescueBite API → http://localhost:${env.PORT}`);
      console.log(`📚  Swagger docs  → http://localhost:${env.PORT}/docs`);
      console.log(`🌍  Environment   → ${env.NODE_ENV}`);
    });
  } catch (err) {
    console.error("❌  Failed to start:", err);
    process.exit(1);
  }
};

process.on("SIGTERM", async () => {
  await prisma.$disconnect();
  await redis.quit();
  process.exit(0);
});

start();
