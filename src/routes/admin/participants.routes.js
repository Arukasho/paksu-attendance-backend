const express = require("express");
const router = express.Router();
const participantsController = require("../../controllers/admin/participants.controller");
const authenticate = require("../../middleware/authenticate");
const requireAdmin = require("../../middleware/requireAdmin");

router.use(authenticate, requireAdmin);

router.get("/", participantsController.list);
router.get("/:id", participantsController.getOne);
router.post("/", participantsController.create);
router.patch("/:id", participantsController.update);
router.delete("/:id", participantsController.remove);
router.patch("/:id/role", participantsController.changeRole);

module.exports = router;
