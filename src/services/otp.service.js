const bcrypt = require("bcrypt");
const pool = require("../config/db");

const OTP_TTL_MINUTES = 15;

function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit code
}

async function createOtpForUser(userId) {
  const otp = generateOtp();
  const otpHash = await bcrypt.hash(otp, 10);
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60000);

  await pool.query(
    "INSERT INTO password_resets (user_id, otp_hash, expires_at) VALUES ($1, $2, $3)",
    [userId, otpHash, expiresAt],
  );

  return otp; // the raw OTP, only returned here so it can be emailed — never stored raw
}

async function verifyOtp(userId, otp) {
  const result = await pool.query(
    `SELECT id, otp_hash FROM password_resets
     WHERE user_id = $1 AND used_at IS NULL AND expires_at > now()
     ORDER BY created_at DESC LIMIT 1`,
    [userId],
  );

  if (result.rows.length === 0) return false;

  const row = result.rows[0];
  const matches = await bcrypt.compare(otp, row.otp_hash);
  if (!matches) return false;

  await pool.query("UPDATE password_resets SET used_at = now() WHERE id = $1", [
    row.id,
  ]);
  return true;
}

module.exports = { createOtpForUser, verifyOtp };
