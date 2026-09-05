const rateLimit = require("express-rate-limit");

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts per IP per window
  message: {
    error: true,
    code: "too_many_attempts",
    message: "Too many login attempts. Try again later.",
  },
});

const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: {
    error: true,
    code: "too_many_attempts",
    message: "Too many reset requests. Try again later.",
  },
});

const checkinLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20,
  message: {
    error: true,
    code: "too_many_attempts",
    message: "Too many scan attempts. Slow down.",
  },
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  message: {
    error: true,
    code: "too_many_attempts",
    message: "Too many registration attempts. Try again later.",
  },
});

const verifyOtpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // matches the OTP's own 15-min expiry
  max: 5,
  message: {
    error: true,
    code: "too_many_attempts",
    message: "Too many attempts. Please request a new code.",
  },
});

const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: {
    error: true,
    code: "too_many_attempts",
    message: "Too many requests. Try again later.",
  },
});

const resetPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: {
    error: true,
    code: "too_many_attempts",
    message: "Too many attempts. Try again later.",
  },
});

const photoUploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: {
    error: true,
    code: "too_many_attempts",
    message: "Too many photo uploads. Try again later.",
  },
});

// Baseline safety net for every other route not covered by a stricter limiter above.
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: {
    error: true,
    code: "too_many_attempts",
    message: "Too many requests. Please slow down.",
  },
});

module.exports = {
  loginLimiter,
  forgotPasswordLimiter,
  checkinLimiter,
  registerLimiter,
  verifyOtpLimiter,
  refreshLimiter,
  resetPasswordLimiter,
  photoUploadLimiter,
  generalLimiter,
};
