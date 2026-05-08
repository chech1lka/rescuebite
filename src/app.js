const express = require("express");
const cors = require("cors");
const swaggerUi = require("swagger-ui-express");
const fs = require("fs");
const path = require("path");
const YAML = require("yaml");
const env = require("./config/env");
const { errorHandler } = require("./middleware/errorHandler");

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors({
  origin: env.NODE_ENV === "production" ? env.CORS_ORIGIN : "*",
  methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

// Swagger
try {
  const yamlPath = path.join(__dirname, "..", "openapi.yaml");
  if (fs.existsSync(yamlPath)) {
    const swaggerDoc = YAML.parse(fs.readFileSync(yamlPath, "utf8"));
    app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerDoc));
    console.log("📚  Swagger UI at /docs");
  }
} catch (e) { console.warn("⚠️  openapi.yaml not loaded:", e.message); }

// Health + Root
app.get("/health", (req, res) => res.json({ status: "ok", timestamp: new Date().toISOString() }));
app.get("/", (req, res) => res.json({
  name: "RescueBite API", version: "2.0.0",
  docs: "/docs", health: "/health",
  features: ["price-decay", "flash-auction", "route-optimization", "geofencing", "shelter-role"],
  endpoints: ["/auth", "/users", "/listings", "/orders", "/vendors", "/drivers", "/shelters", "/auctions", "/ingredients", "/admin"],
}));

// Routes
app.use("/auth",        require("./routes/auth.routes"));
app.use("/users",       require("./routes/users.routes"));
app.use("/listings",    require("./routes/listings.routes"));
app.use("/orders",      require("./routes/orders.routes"));
app.use("/vendors",     require("./routes/vendors.routes"));
app.use("/drivers",     require("./routes/drivers.routes"));
app.use("/shelters",    require("./routes/shelters.routes"));
app.use("/auctions",    require("./routes/auction.routes"));
app.use("/ingredients", require("./routes/ingredients.routes"));
app.use("/admin",       require("./routes/admin.routes"));

app.use((req, res) => res.status(404).json({ error: `Route ${req.method} ${req.path} not found` }));
app.use(errorHandler);

module.exports = app;
