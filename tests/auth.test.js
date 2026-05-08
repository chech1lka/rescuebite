// Auth tests require a running DB — these are integration tests
// Run with: docker compose exec app npm test

const request = require("supertest");
const app = require("../src/app");
const prisma = require("../src/config/database");

beforeAll(async () => {
  await prisma.$connect();
  await prisma.refreshToken.deleteMany({});
  await prisma.user.deleteMany({ where: { email: { contains: "jest_" } } });
});

afterAll(async () => {
  await prisma.refreshToken.deleteMany({});
  await prisma.user.deleteMany({ where: { email: { contains: "jest_" } } });
  await prisma.$disconnect();
});

describe("POST /auth/register", () => {
  it("registers successfully", async () => {
    const res = await request(app).post("/auth/register").send({ email: "jest_user@test.com", password: "Password1", role: "CUSTOMER" });
    expect(res.status).toBe(201);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.user.password).toBeUndefined();
  });

  it("rejects duplicate email", async () => {
    const res = await request(app).post("/auth/register").send({ email: "jest_user@test.com", password: "Password1" });
    expect(res.status).toBe(409);
  });

  it("rejects weak password", async () => {
    const res = await request(app).post("/auth/register").send({ email: "jest_weak@test.com", password: "123" });
    expect(res.status).toBe(422);
  });
});

describe("POST /auth/login", () => {
  it("logs in correctly", async () => {
    const res = await request(app).post("/auth/login").send({ email: "jest_user@test.com", password: "Password1" });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
  });

  it("rejects wrong password", async () => {
    const res = await request(app).post("/auth/login").send({ email: "jest_user@test.com", password: "Wrong1234" });
    expect(res.status).toBe(401);
  });
});

describe("RBAC", () => {
  it("returns 401 without token", async () => {
    const res = await request(app).get("/users/me");
    expect(res.status).toBe(401);
  });

  it("returns 403 when wrong role", async () => {
    const loginRes = await request(app).post("/auth/login").send({ email: "jest_user@test.com", password: "Password1" });
    const res = await request(app).post("/listings").set("Authorization", `Bearer ${loginRes.body.accessToken}`).send({});
    expect(res.status).toBe(403);
  });
});
