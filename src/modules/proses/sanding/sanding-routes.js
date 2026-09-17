const express = require("express");
const router = express.Router();
const verifyToken = require("../../../core/middleware/verify-token");
const ctrl = require("./sanding-controller");

router.use(express.json());
// Health check
router.get("/sanding-stock", verifyToken, ctrl.getSandingStock);
router.get("/sanding-labels", verifyToken, ctrl.getSandingLabels);

module.exports = router;
