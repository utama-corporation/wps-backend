const express = require("express");
const router = express.Router();
const verifyToken = require("../../../core/middleware/verify-token");
const attachPermissions = require("../../../core/middleware/attach-permissions");
const requirePermission = require("../../../core/middleware/require-permission");
const ctrl = require("./packing-produksi-controller");
// Health checks
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
// Route laporan tetap memakai verifyToken (sama seperti modul produksi lain)
// supaya kolom "Print by" terisi username. Health check di atas tidak
// terpengaruh karena tidak memanggil /report. Kunci permission memakai
// singkatan yang sama dengan menu sidebar di app ("proses_bj:read"),
// bukan "proses_packing:read".
router.get(
  "/report/:noProduksi/pdf",
  verifyToken,
  attachPermissions,
  requirePermission("proses_bj:read"),
  ctrl.generateProduksiReportPdf,
);

module.exports = router;
