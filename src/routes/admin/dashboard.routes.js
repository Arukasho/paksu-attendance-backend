const express = require('express');
const router = express.Router();
const dashboardController = require('../../controllers/admin/dashboard.controller');
const authenticate = require('../../middleware/authenticate');
const requireAdmin = require('../../middleware/requireAdmin');

router.use(authenticate, requireAdmin);

router.get('/summary', dashboardController.summary);
router.get('/events/:id/summary', dashboardController.eventSummary);
router.get('/events/:id/attendance', dashboardController.eventAttendance);

module.exports = router;
