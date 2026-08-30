const express = require("express");
const router = express.Router();
const checkinController = require("../controllers/checkin.controller");
const { checkinLimiter } = require("../middleware/rateLimiter");
const authenticate = require("../middleware/authenticate");

router.use(authenticate);

router.post("/", checkinLimiter, checkinController.checkin);

module.exports = router;
