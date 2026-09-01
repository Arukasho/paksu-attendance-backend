const bcrypt = require("bcrypt");
const pool = require("../config/db");

const {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  storeRefreshToken,
  isRefreshTokenActive,
  revokeRefreshToken,
  signResetToken,
  verifyResetToken,
} = require("../services/token.service");

const {
  createOtpForUser,
  verifyOtp: verifyOtpCode,
} = require("../services/otp.service");

const { sendOtpEmail } = require("../services/email.service");
const { logActivity } = require("../services/activityLog.service");

const SALT_ROUNDS = 10;

async function register(req, res, next) {
  const { full_name, username, phone, email, password, confirm_password } =
    req.body;

  if (
    !full_name ||
    !username ||
    !phone ||
    !email ||
    !password ||
    !confirm_password
  ) {
    return res.status(422).json({
      error: true,
      code: "validation_error",
      message:
        "full_name, username, email, phone, password, and confirm_password are all required.",
    });
  }

  if (password !== confirm_password) {
    return res.status(422).json({
      error: true,
      code: "validation_error",
      message: "Password and confirm_password do not match.",
    });
  }

  try {
    const existing = await pool.query(
      "SELECT username, phone, email FROM users WHERE username = $1 OR phone = $2 OR email = $3",
      [username, phone, email || null],
    );

    if (existing.rows.length > 0) {
      const conflict = existing.rows[0];
      let code = "username_taken";
      if (conflict.phone === phone) code = "phone_taken";
      else if (email && conflict.email === email) code = "email_taken";

      return res.status(409).json({
        error: true,
        code,
        message:
          "An account with this username, phone, or email already exists.",
      });
    }

    // Step 3: hash the password, insert the new user.
    const password_hash = await bcrypt.hash(password, SALT_ROUNDS);

    const insertResult = await pool.query(
      `INSERT INTO users (full_name, username, phone, email, password_hash)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, full_name, username, phone, email, profile_photo_url`,
      [full_name, username, phone, email || null, password_hash],
    );

    const user = insertResult.rows[0];

    await logActivity({
      actorType: "user",
      actorId: user.id,
      actorName: user.full_name,
      action: "register",
    });

    // Step 4: issue tokens so the user is immediately logged in.
    const userResult = await pool.query(
      "SELECT role FROM users WHERE id = $1",
      [user.id],
    );
    if (userResult.rows.length === 0) {
      return res.status(500).json({
        error: true,
        code: "internal_error",
        message: "Could not load user after registration.",
      });
    }
    const access_token = signAccessToken({
      id: user.id,
      role: userResult.rows[0].role,
    });

    const refresh_token = signRefreshToken({ id: user.id });

    await storeRefreshToken(user.id, refresh_token);

    return res.status(201).json({
      data: {
        user: { ...user, profile_completion: 20 },
        access_token,
        refresh_token,
        expires_in: 3600,
      },
    });
  } catch (err) {
    return next(err);
  }
}

async function login(req, res, next) {
  const { identifier, password } = req.body;

  if (!identifier || !password) {
    return res.status(422).json({
      error: true,
      code: "validation_error",
      message: "identifier and password are required.",
    });
  }

  try {
    const result = await pool.query(
      "SELECT id, full_name, username, phone, email, password_hash, role FROM users WHERE username = $1 OR phone = $1 OR email = $1",
      [identifier],
    );

    const user = result.rows[0];
    if (!user) {
      return res.status(401).json({
        error: true,
        code: "invalid_credentials",
        message: "Phone number or password is incorrect.",
      });
    }

    const passwordMatches = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatches) {
      return res.status(401).json({
        error: true,
        code: "invalid_credentials",
        message: "Phone number or password is incorrect.",
      });
    }

    const access_token = signAccessToken({ id: user.id, role: user.role });
    const refresh_token = signRefreshToken({ id: user.id });

    await storeRefreshToken(user.id, refresh_token);

    delete user.password_hash;

    return res.status(200).json({
      data: { user, access_token, refresh_token, expires_in: 3600 },
    });
  } catch (err) {
    return next(err);
  }
}

async function refresh(req, res, next) {
  const { refresh_token } = req.body;

  if (!refresh_token) {
    return res.status(422).json({
      error: true,
      code: "validation_error",
      message: "refresh_token is required.",
    });
  }

  try {
    const payload = verifyRefreshToken(refresh_token);

    const active = await isRefreshTokenActive(refresh_token);
    if (!active) {
      return res.status(401).json({
        error: true,
        code: "invalid_refresh_token",
        message: "Refresh token is invalid or expired.",
      });
    }

    await revokeRefreshToken(refresh_token); // rotation: old token is now dead

    const userResult = await pool.query(
      "SELECT role FROM users WHERE id = $1",
      [payload.id],
    );
    if (userResult.rows.length === 0) {
      return res.status(401).json({
        error: true,
        code: "invalid_refresh_token",
        message: "User not found.",
      });
    }

    const access_token = signAccessToken({
      id: payload.id,
      role: userResult.rows[0].role,
    });
    const new_refresh_token = signRefreshToken({ id: payload.id });
    await storeRefreshToken(payload.id, new_refresh_token);

    return res.status(200).json({
      data: {
        access_token,
        refresh_token: new_refresh_token,
        expires_in: 3600,
      },
    });
  } catch (err) {
    return res.status(401).json({
      error: true,
      code: "invalid_refresh_token",
      message: "Refresh token is invalid or expired.",
    });
  }
}

async function logout(req, res, next) {
  const { refresh_token } = req.body;
  if (!refresh_token) {
    return res.status(422).json({
      error: true,
      code: "validation_error",
      message: "refresh_token is required.",
    });
  }
  try {
    await revokeRefreshToken(refresh_token);
    return res.status(204).send();
  } catch (err) {
    return next(err);
  }
}

async function forgotPassword(req, res, next) {
  const { identifier } = req.body;

  try {
    const result = await pool.query(
      "SELECT id, email FROM users WHERE email = $1",
      [identifier],
    );

    if (result.rows.length > 0) {
      const user = result.rows[0];
      const otp = await createOtpForUser(user.id);
      await sendOtpEmail(user.email, otp);
    }

    // Always the same response, whether or not the account exists — avoids leaking who's registered.
    return res.status(200).json({
      data: { message: "If that account exists, an OTP has been sent." },
    });
  } catch (err) {
    return next(err);
  }
}

async function verifyOtp(req, res, next) {
  const { identifier, otp } = req.body;

  try {
    const result = await pool.query("SELECT id FROM users WHERE email = $1", [
      identifier,
    ]);
    if (result.rows.length === 0) {
      return res.status(400).json({
        error: true,
        code: "invalid_otp",
        message: "Invalid or expired OTP.",
      });
    }

    const userId = result.rows[0].id;
    const valid = await verifyOtpCode(userId, otp);
    if (!valid) {
      return res.status(400).json({
        error: true,
        code: "invalid_otp",
        message: "Invalid or expired OTP.",
      });
    }

    const reset_token = signResetToken({ id: userId });
    return res.status(200).json({ data: { reset_token, expires_in: 300 } });
  } catch (err) {
    return next(err);
  }
}

async function resetPassword(req, res, next) {
  const { reset_token, new_password, confirm_password } = req.body;

  if (new_password !== confirm_password) {
    return res.status(422).json({
      error: true,
      code: "validation_error",
      message: "Passwords do not match.",
    });
  }

  try {
    const payload = verifyResetToken(reset_token); // throws if invalid/expired
    const password_hash = await bcrypt.hash(new_password, SALT_ROUNDS);

    await pool.query("UPDATE users SET password_hash = $1 WHERE id = $2", [
      password_hash,
      payload.id,
    ]);

    // Revoke all existing refresh tokens — force re-login everywhere, since password changed.
    await pool.query(
      "UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL",
      [payload.id],
    );

    return res
      .status(200)
      .json({ data: { message: "Password updated. Please log in." } });
  } catch (err) {
    return res.status(400).json({
      error: true,
      code: "invalid_or_expired_token",
      message: "Reset token is invalid or expired.",
    });
  }
}

module.exports = {
  register,
  login,
  refresh,
  logout,
  forgotPassword,
  verifyOtp,
  resetPassword,
  signResetToken,
  verifyResetToken,
};
