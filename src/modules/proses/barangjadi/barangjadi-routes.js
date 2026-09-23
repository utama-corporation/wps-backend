const express = require("express");
const router = express.Router();
const verifyToken = require("../../../core/middleware/verify-token");
const ctrl = require("./barangjadi-controller");
// Health check
router.use(express.json());

router.get("/barangjadi-stock", verifyToken, ctrl.getBarangJadiStock);
router.get("/barangjadi-labels", verifyToken, ctrl.getBarangJadiLabels);

module.exports = router;
