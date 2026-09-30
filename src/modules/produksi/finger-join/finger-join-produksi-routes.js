const express = require("express");
const router = express.Router();
const ctrl = require("./finger-join-produksi-controller");

router.get("/mesin-list", ctrl.getMesinList);
router.get("/history", ctrl.getHistory);
router.get("/next-no-produksi", ctrl.getNextNoProduksi);
router.get("/next-no-label", ctrl.getNextNoLabel);
router.get("/master-options", ctrl.getMasterOptions);
router.get("/header/:noProduksi", ctrl.getHeader);
router.post("/header", ctrl.saveHeader);
router.put("/header", ctrl.updateHeader);
router.post("/label", ctrl.createLabel);
router.post("/input", ctrl.addInput);
router.delete("/input", ctrl.removeInput);
router.post("/output", ctrl.addOutput);
router.delete("/output", ctrl.removeOutput);

module.exports = router;
