const express = require("express");
const router = express.Router();
const usersController = require("../controllers/users.controller");
const authenticate = require("../middleware/authenticate");
const multer = require("multer");
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

router.use(authenticate); // every route below requires a valid access token

router.get("/me", usersController.getMe);
router.patch("/me", usersController.updateMe);
router.post("/me/photo", upload.single("photo"), usersController.uploadPhoto);
router.get("/me/attendance-history", usersController.getAttendanceHistory);
router.post("/me/logout-all", usersController.logoutAllDevices);

module.exports = router;
