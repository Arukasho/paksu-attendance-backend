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

module.exports = { loginLimiter, forgotPasswordLimiter, checkinLimiter };
