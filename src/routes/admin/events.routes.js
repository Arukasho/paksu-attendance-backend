const express = require('express');
const router = express.Router();
const eventsController = require('../../controllers/admin/events.controller');
const authenticate = require('../../middleware/authenticate');
const requireAdmin = require('../../middleware/requireAdmin');

router.use(authenticate, requireAdmin);

router.get('/', eventsController.list);
router.post('/', eventsController.create);
router.get('/:id', eventsController.getOne);
router.patch('/:id', eventsController.update);
router.delete('/:id', eventsController.remove);

module.exports = router;
