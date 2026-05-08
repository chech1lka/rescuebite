const { ZodError } = require("zod");

const errorHandler = (err, req, res, next) => {
  if (err instanceof ZodError) {
    return res.status(422).json({
      error: "Validation failed",
      details: err.errors.map((e) => ({ field: e.path.join("."), message: e.message })),
    });
  }
  if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
  if (err.code === "P2002") {
    const field = err.meta?.target?.[0] || "field";
    return res.status(409).json({ error: `${field} already exists` });
  }
  if (err.code === "P2025") return res.status(404).json({ error: "Record not found" });
  console.error("Unhandled error:", err);
  return res.status(500).json({ error: "Internal server error" });
};

const createError = (statusCode, message) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
};

module.exports = { errorHandler, createError };
