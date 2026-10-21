const express = require("express");
const router = express.Router();
const verifyToken = require("../../../core/middleware/verify-token");
const attachPermissions = require("../../../core/middleware/attach-permissions");
const requirePermission = require("../../../core/middleware/require-permission");
const ctrl = require("./sanding-produksi-controller");

router.use(express.json());
router.use(verifyToken, attachPermissions);

// Read (lihat data produksi)
router.get("/mesin-list", requirePermission("proses_snd:read"), ctrl.getMesinList);
router.get("/history", requirePermission("proses_snd:read"), ctrl.getHistory);
router.get("/stok", requirePermission("proses_snd:read"), ctrl.getStok);
router.get("/stok-labels", requirePermission("proses_snd:read"), ctrl.getStokLabels);
router.get("/detail/:noProduksi", requirePermission("proses_snd:read"), ctrl.getDetail);
router.get("/header/:noProduksi", requirePermission("proses_snd:read"), ctrl.getHeader);
router.get("/next-no-produksi", requirePermission("proses_snd:read"), ctrl.getNextNoProduksi);
router.get("/next-no-label", requirePermission("proses_snd:read"), ctrl.getNextNoLabel);
router.get("/master-options", requirePermission("proses_snd:read"), ctrl.getMasterOptions);
router.get("/operators", requirePermission("proses_snd:read"), ctrl.getOperators);
router.get("/org-telly", requirePermission("proses_snd:read"), ctrl.getOrgTelly);

// Create (buka produksi baru)
router.post("/header", requirePermission("proses_snd:create"), ctrl.saveHeader);

// Update / hapus header produksi (dari menu riwayat)
router.put("/header/:noProduksi", requirePermission("proses_snd:update"), ctrl.updateHeader);
router.put("/header", requirePermission("proses_snd:update"), ctrl.updateHeaderBody);
router.post("/header/:noProduksi/ganti", requirePermission("proses_snd:update"), ctrl.gantiHeader);
router.delete("/header/:noProduksi", requirePermission("proses_snd:delete"), ctrl.deleteHeader);

// Buat label output -> permission khusus label sanding
router.post("/label", requirePermission("label_snd:create"), ctrl.createLabel);

// Update (tambah input / output pada produksi berjalan)
router.post("/input", requirePermission("proses_snd:update"), ctrl.addInput);
router.post("/input/simpan", requirePermission("proses_snd:update"), ctrl.simpanInput);
router.post("/output", requirePermission("proses_snd:update"), ctrl.addOutput);
router.post("/reject", requirePermission("proses_snd:update"), ctrl.addReject);

// Delete (hapus input / output)
router.delete("/input", requirePermission("proses_snd:delete"), ctrl.removeInput);
router.delete("/input/temporary", requirePermission("proses_snd:delete"), ctrl.batalInput);
router.delete("/output", requirePermission("proses_snd:delete"), ctrl.removeOutput);
router.delete("/reject", requirePermission("proses_snd:delete"), ctrl.removeReject);

// Laporan produksi (PDF) per nomor produksi
router.get("/report/:noProduksi/pdf", requirePermission("proses_snd:read"), ctrl.generateProduksiReportPdf);

// Laporan Produksi per No. Produksi (PDF, via report microservice)
router.get("/laporan", requirePermission("proses_sanding:read"), ctrl.getLaporan);

module.exports = router;
