const express = require("express");
const router = express.Router();
const ctrl = require("./finger-join-produksi-controller");
const verifyToken = require("../../../core/middleware/verify-token");
const attachPermissions = require("../../../core/middleware/attach-permissions");
const requirePermission = require("../../../core/middleware/require-permission");

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
// Memakai verifyToken supaya field "Print by" diambil dari req.username
// (hasil decode JWT), bukan dari query string yang bisa dimanipulasi.
// Kunci permission memakai singkatan yang sama dengan menu sidebar di app
// ("proses_fj:read"), bukan nama folder.
router.get(
  "/report/:noProduksi/pdf",
  verifyToken,
  attachPermissions,
  requirePermission("proses_fj:read"),
  ctrl.generateProduksiReportPdf,
);

module.exports = router;
