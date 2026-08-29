const express = require('express');
const router = express.Router();
const checkinController = require('../controllers/checkin.controller');
const authenticate = require('../middleware/authenticate');

router.use(authenticate);

router.post('/', checkinController.checkin);

module.exports = router;
