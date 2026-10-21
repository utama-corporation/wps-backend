const express = require("express");
const router = express.Router();
const verifyToken = require("../../../core/middleware/verify-token");
const attachPermissions = require("../../../core/middleware/attach-permissions");
const requirePermission = require("../../../core/middleware/require-permission");
const ctrl = require("./s4s-produksi-controller");

router.use(express.json());
router.use(verifyToken, attachPermissions);

// Read (lihat data produksi)
router.get("/mesin-list", requirePermission("proses_s4s:read"), ctrl.getMesinList);
router.get("/history", requirePermission("proses_s4s:read"), ctrl.getHistory);
router.get("/stok", requirePermission("proses_s4s:read"), ctrl.getStok);
router.get("/stok-labels", requirePermission("proses_s4s:read"), ctrl.getStokLabels);
router.get("/detail/:noProduksi", requirePermission("proses_s4s:read"), ctrl.getDetail);
router.get("/next-no-produksi", requirePermission("proses_s4s:read"), ctrl.getNextNoProduksi);
router.get("/next-no-label", requirePermission("proses_s4s:read"), ctrl.getNextNoLabel);
router.get("/master-options", requirePermission("proses_s4s:read"), ctrl.getMasterOptions);
router.get("/operators", requirePermission("proses_s4s:read"), ctrl.getOperators);
router.get("/org-telly", requirePermission("proses_s4s:read"), ctrl.getOrgTelly);

// Laporan Produksi S4S per No. Produksi (PDF, via report microservice)
router.get("/laporan", requirePermission("proses_s4s:read"), ctrl.getLaporan);

// Create (buka produksi baru)
router.post("/header", requirePermission("proses_s4s:create"), ctrl.saveHeader);

// Update / hapus header produksi (dari menu riwayat)
router.put("/header/:noProduksi", requirePermission("proses_s4s:update"), ctrl.updateHeader);
router.post("/header/:noProduksi/ganti", requirePermission("proses_s4s:update"), ctrl.gantiHeader);
router.delete("/header/:noProduksi", requirePermission("proses_s4s:delete"), ctrl.deleteHeader);

// Buat label output -> permission khusus label S4S
router.post("/label", requirePermission("label_s4s:create"), ctrl.createLabel);

// Update (tambah input / output pada produksi berjalan)
router.post("/input", requirePermission("proses_s4s:update"), ctrl.addInput);
router.post("/input/simpan", requirePermission("proses_s4s:update"), ctrl.simpanInput);
router.post("/output", requirePermission("proses_s4s:update"), ctrl.addOutput);
router.post("/reject", requirePermission("proses_s4s:update"), ctrl.addReject);

// Delete (hapus input / output)
router.delete("/input", requirePermission("proses_s4s:delete"), ctrl.removeInput);
router.delete("/input/temporary", requirePermission("proses_s4s:delete"), ctrl.batalInput);
router.delete("/output", requirePermission("proses_s4s:delete"), ctrl.removeOutput);
router.delete("/reject", requirePermission("proses_s4s:delete"), ctrl.removeReject);

// Laporan produksi (PDF) per nomor produksi
router.get("/report/:noProduksi/pdf", requirePermission("proses_s4s:read"), ctrl.generateProduksiReportPdf);

module.exports = router;
