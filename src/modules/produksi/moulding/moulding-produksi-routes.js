const express = require("express");
const router = express.Router();
const verifyToken = require("../../../core/middleware/verify-token");
const attachPermissions = require("../../../core/middleware/attach-permissions");
const requirePermission = require("../../../core/middleware/require-permission");
const ctrl = require("./moulding-produksi-controller");

router.use(express.json());

router.get("/mesin-list", verifyToken, ctrl.getMesinList);
router.get("/history", verifyToken, ctrl.getHistory);
router.get("/next-no-produksi", verifyToken, ctrl.getNextNoProduksi);
router.get("/next-no-label", verifyToken, ctrl.getNextNoLabel);
router.get("/master-options", verifyToken, ctrl.getMasterOptions);

router.get("/header/:noProduksi", verifyToken, ctrl.getHeader);
router.post("/header", verifyToken, ctrl.saveHeader);
router.put("/header", verifyToken, ctrl.updateHeader);
router.post("/label", verifyToken, ctrl.createLabel);
router.post("/input", verifyToken, ctrl.addInput);
router.delete("/input", verifyToken, ctrl.removeInput);
router.post("/output", verifyToken, ctrl.addOutput);
router.delete("/output", verifyToken, ctrl.removeOutput);
// Route laporan tetap memakai verifyToken (sama seperti modul produksi lain)
// supaya kolom "Print by" terisi username. Kunci permission memakai singkatan
// yang sama dengan menu sidebar di app ("proses_mld:read"), bukan nama folder.
router.get(
  "/report/:noProduksi/pdf",
  verifyToken,
  attachPermissions,
  requirePermission("proses_mld:read"),
  ctrl.generateProduksiReportPdf,
);

module.exports = router;
