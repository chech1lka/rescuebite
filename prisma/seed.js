const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function main() {
  const hashed = await bcrypt.hash("Admin1234", 12);
  const admin = await prisma.user.upsert({
    where: { email: "admin@test.com" },
    update: {},
    create: { email: "admin@test.com", password: hashed, role: "ADMIN" },
  });
  console.log("✅ Admin created:", admin.email);
}

main().catch(console.error).finally(() => prisma.$disconnect());
