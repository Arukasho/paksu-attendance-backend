const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const pool = require("../config/db");

const ACCESS_TOKEN_TTL = "1h";
const REFRESH_TOKEN_TTL = "90d";

function signAccessToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: ACCESS_TOKEN_TTL },
  );
}

function signRefreshToken(user) {
  return jwt.sign({ id: user.id }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: REFRESH_TOKEN_TTL,
  });
}

function verifyAccessToken(token) {
  return jwt.verify(token, process.env.JWT_ACCESS_SECRET);
}

function verifyRefreshToken(token) {
  return jwt.verify(token, process.env.JWT_REFRESH_SECRET);
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

async function storeRefreshToken(userId, token) {
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000); // 90 days
  await pool.query(
    "INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)",
    [userId, tokenHash, expiresAt],
  );
}

async function isRefreshTokenActive(token) {
  const tokenHash = hashToken(token);
  const result = await pool.query(
    "SELECT id FROM refresh_tokens WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now()",
    [tokenHash],
  );
  return result.rows.length > 0;
}

async function revokeRefreshToken(token) {
  const tokenHash = hashToken(token);
  await pool.query(
    "UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1",
    [tokenHash],
  );
}

function signResetToken(user) {
  return jwt.sign(
    { id: user.id, purpose: "password_reset" },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: "5m" },
  );
}

function verifyResetToken(token) {
  const payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
  if (payload.purpose !== "password_reset")
    throw new Error("Wrong token purpose");
  return payload;
}

module.exports = {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  hashToken,
  storeRefreshToken,
  isRefreshTokenActive,
  revokeRefreshToken,
  signResetToken,
  verifyResetToken,
};
