const express = require("express");
const router = express.Router();
const authController = require("../controllers/auth.controller");
const {
  loginLimiter,
  forgotPasswordLimiter,
  registerLimiter,
  verifyOtpLimiter,
  refreshLimiter,
  resetPasswordLimiter,
} = require("../middleware/rateLimiter");

router.post("/register", registerLimiter, authController.register);
router.post("/login", loginLimiter, authController.login);
router.post("/refresh", authController.refresh);
router.post("/logout", authController.logout);
router.post(
  "/forgot-password",
  forgotPasswordLimiter,
  authController.forgotPassword,
);
router.post("/verify-otp", verifyOtpLimiter, authController.verifyOtp);
router.post("/reset-password", authController.resetPassword);
router.post("/refresh", refreshLimiter, authController.refresh);
router.post(
  "/reset-password",
  resetPasswordLimiter,
  authController.resetPassword,
);

module.exports = router;
