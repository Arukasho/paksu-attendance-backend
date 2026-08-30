const express = require("express");
const router = express.Router();
const authController = require("../controllers/auth.controller");
const {
  loginLimiter,
  forgotPasswordLimiter,
} = require("../middleware/rateLimiter");

router.post("/register", authController.register);
router.post("/login", loginLimiter, authController.login);
router.post("/refresh", authController.refresh);
router.post("/logout", authController.logout);
router.post(
  "/forgot-password",
  forgotPasswordLimiter,
  authController.forgotPassword,
);
router.post("/verify-otp", authController.verifyOtp);
router.post("/reset-password", authController.resetPassword);

module.exports = router;
