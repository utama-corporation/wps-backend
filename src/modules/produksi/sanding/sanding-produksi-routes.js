const express = require("express");
const router = express.Router();
const verifyToken = require("../../../core/middleware/verify-token");
const ctrl = require("./sanding-produksi-controller");
// Health check
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
// terpengaruh karena tidak memanggil /report.
router.get("/report/:noProduksi/pdf", verifyToken, ctrl.generateProduksiReportPdf);

module.exports = router;
