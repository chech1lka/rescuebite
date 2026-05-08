const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const prisma = require("../config/database");
const redis = require("../config/redis");
const env = require("../config/env");
const { createError } = require("../middleware/errorHandler");
const emailService = require("./email.service");

const generateTokens = (user) => {
  const payload = { id: user.id, email: user.email, role: user.role };
  const accessToken = jwt.sign(payload, env.JWT_ACCESS_SECRET, { expiresIn: env.JWT_ACCESS_EXPIRES_IN });
  const refreshToken = jwt.sign(payload, env.JWT_REFRESH_SECRET, { expiresIn: env.JWT_REFRESH_EXPIRES_IN });
  return { accessToken, refreshToken };
};

const register = async ({ email, password, role }) => {
  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) throw createError(409, "Email already registered");
  const hashed = await bcrypt.hash(password, env.BCRYPT_ROUNDS);
  const verifyToken = crypto.randomBytes(32).toString("hex");
  const verifyExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const user = await prisma.user.create({
    data: { email, password: hashed, role, emailVerifyToken: verifyToken, emailVerifyExpiry: verifyExpiry, isEmailVerified: false },
    select: { id: true, email: true, role: true, isEmailVerified: true, createdAt: true },
  });
  emailService.sendVerificationEmail(email, verifyToken).catch((err) => console.error("Verify email failed:", err.message));
  return { user, message: "Registration successful. Please check your email to verify your account." };
};

const verifyEmail = async (token) => {
  const user = await prisma.user.findFirst({ where: { emailVerifyToken: token, emailVerifyExpiry: { gt: new Date() } } });
  if (!user) throw createError(400, "Invalid or expired verification token");
  await prisma.user.update({ where: { id: user.id }, data: { isEmailVerified: true, emailVerifyToken: null, emailVerifyExpiry: null } });
  return { message: "Email verified successfully. You can now log in." };
};

const login = async ({ email, password }) => {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw createError(401, "Invalid credentials");
  if (!user.isActive) throw createError(403, "Account suspended");
  if (!user.isEmailVerified) throw createError(403, "Please verify your email before logging in");
  const valid = await bcrypt.compare(password, user.password);
  if (!valid) throw createError(401, "Invalid credentials");
  const { accessToken, refreshToken } = generateTokens(user);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await prisma.refreshToken.create({ data: { token: refreshToken, userId: user.id, expiresAt } });
  return { user: { id: user.id, email: user.email, role: user.role }, accessToken, refreshToken };
};

const refresh = async (refreshToken) => {
  let decoded;
  try { decoded = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET); }
  catch { throw createError(401, "Invalid or expired refresh token"); }
  const stored = await prisma.refreshToken.findUnique({ where: { token: refreshToken } });
  if (!stored || stored.expiresAt < new Date()) throw createError(401, "Refresh token expired");
  const user = await prisma.user.findUnique({ where: { id: decoded.id } });
  if (!user || !user.isActive) throw createError(403, "Account not available");
  const { accessToken, refreshToken: newRefresh } = generateTokens(user);
  await prisma.refreshToken.delete({ where: { token: refreshToken } });
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await prisma.refreshToken.create({ data: { token: newRefresh, userId: user.id, expiresAt } });
  return { accessToken, refreshToken: newRefresh };
};

const logout = async (accessToken, refreshToken) => {
  try {
    const decoded = jwt.decode(accessToken);
    if (decoded?.exp) {
      const ttl = decoded.exp - Math.floor(Date.now() / 1000);
      if (ttl > 0) await redis.setex(`blacklist:${accessToken}`, ttl, "1");
    }
  } catch {}
  if (refreshToken) await prisma.refreshToken.deleteMany({ where: { token: refreshToken } });
};

const forgotPassword = async (email) => {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return { message: "If that email exists, a reset link has been sent." };
  const resetToken = crypto.randomBytes(32).toString("hex");
  const resetExpiry = new Date(Date.now() + 60 * 60 * 1000);
  await prisma.user.update({ where: { id: user.id }, data: { passwordResetToken: resetToken, passwordResetExpiry: resetExpiry } });
  emailService.sendPasswordResetEmail(email, resetToken).catch((err) => console.error("Reset email failed:", err.message));
  return { message: "If that email exists, a reset link has been sent." };
};

const resetPassword = async (token, newPassword) => {
  const user = await prisma.user.findFirst({ where: { passwordResetToken: token, passwordResetExpiry: { gt: new Date() } } });
  if (!user) throw createError(400, "Invalid or expired reset token");
  const hashed = await bcrypt.hash(newPassword, env.BCRYPT_ROUNDS);
  await prisma.user.update({ where: { id: user.id }, data: { password: hashed, passwordResetToken: null, passwordResetExpiry: null } });
  await prisma.refreshToken.deleteMany({ where: { userId: user.id } });
  return { message: "Password reset successfully. Please log in with your new password." };
};

module.exports = { register, verifyEmail, login, refresh, logout, forgotPassword, resetPassword };
