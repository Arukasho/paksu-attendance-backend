const express = require("express");
const router = express.Router();
const controller = require("../../controllers/admin/activityLogs.controller");
const authenticate = require("../../middleware/authenticate");
const requireAdmin = require("../../middleware/requireAdmin");

router.use(authenticate, requireAdmin);
router.get("/", controller.list);

module.exports = router;
