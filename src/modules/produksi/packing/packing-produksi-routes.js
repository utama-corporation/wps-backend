const express = require("express");
const router = express.Router();
const verifyToken = require("../../../core/middleware/verify-token");
const ctrl = require("./packing-produksi-controller");

router.use(express.json());

router.get("/mesin-list", verifyToken, ctrl.getMesinList);
router.get("/history", verifyToken, ctrl.getHistory);
router.get("/next-no-produksi", verifyToken, ctrl.getNextNoProduksi);
router.get("/next-no-label", verifyToken, ctrl.getNextNoLabel);
router.get("/master-options", verifyToken, ctrl.getMasterOptions);

router.get("/header/:noProduksi", verifyToken, ctrl.getHeader);
router.put("/header", verifyToken, ctrl.updateHeader);
router.post("/header", verifyToken, ctrl.saveHeader);
router.post("/label", verifyToken, ctrl.createLabel);
router.post("/input", verifyToken, ctrl.addInput);
router.delete("/input", verifyToken, ctrl.removeInput);
router.post("/output", verifyToken, ctrl.addOutput);
router.delete("/output", verifyToken, ctrl.removeOutput);

module.exports = router;
