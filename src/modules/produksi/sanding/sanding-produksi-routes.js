const express = require("express");
const router = express.Router();
const verifyToken = require("../../../core/middleware/verify-token");
const attachPermissions = require("../../../core/middleware/attach-permissions");
const requirePermission = require("../../../core/middleware/require-permission");
const ctrl = require("./sanding-produksi-controller");

router.use(express.json());
router.use(verifyToken, attachPermissions);

// Read (lihat data produksi)
router.get("/mesin-list", requirePermission("proses_sanding:read"), ctrl.getMesinList);
router.get("/history", requirePermission("proses_sanding:read"), ctrl.getHistory);
router.get("/stok", requirePermission("proses_sanding:read"), ctrl.getStok);
router.get("/stok-labels", requirePermission("proses_sanding:read"), ctrl.getStokLabels);
router.get("/detail/:noProduksi", requirePermission("proses_sanding:read"), ctrl.getDetail);
router.get("/header/:noProduksi", requirePermission("proses_sanding:read"), ctrl.getHeader);
router.get("/next-no-produksi", requirePermission("proses_sanding:read"), ctrl.getNextNoProduksi);
router.get("/next-no-label", requirePermission("proses_sanding:read"), ctrl.getNextNoLabel);
router.get("/master-options", requirePermission("proses_sanding:read"), ctrl.getMasterOptions);
router.get("/operators", requirePermission("proses_sanding:read"), ctrl.getOperators);
router.get("/org-telly", requirePermission("proses_sanding:read"), ctrl.getOrgTelly);

// Create (buka produksi baru)
router.post("/header", requirePermission("proses_sanding:create"), ctrl.saveHeader);

// Update / hapus header produksi (dari menu riwayat)
router.put("/header/:noProduksi", requirePermission("proses_sanding:update"), ctrl.updateHeader);
router.put("/header", requirePermission("proses_sanding:update"), ctrl.updateHeaderBody);
router.post("/header/:noProduksi/ganti", requirePermission("proses_sanding:update"), ctrl.gantiHeader);
router.delete("/header/:noProduksi", requirePermission("proses_sanding:delete"), ctrl.deleteHeader);

// Buat label output -> permission khusus label sanding
router.post("/label", requirePermission("label_snd:create"), ctrl.createLabel);

// Update (tambah input / output pada produksi berjalan)
router.post("/input", requirePermission("proses_sanding:update"), ctrl.addInput);
router.post("/input/simpan", requirePermission("proses_sanding:update"), ctrl.simpanInput);
router.post("/output", requirePermission("proses_sanding:update"), ctrl.addOutput);
router.post("/reject", requirePermission("proses_sanding:update"), ctrl.addReject);

// Delete (hapus input / output)
router.delete("/input", requirePermission("proses_sanding:delete"), ctrl.removeInput);
router.delete("/input/temporary", requirePermission("proses_sanding:delete"), ctrl.batalInput);
router.delete("/output", requirePermission("proses_sanding:delete"), ctrl.removeOutput);
router.delete("/reject", requirePermission("proses_sanding:delete"), ctrl.removeReject);

// Laporan produksi (PDF) per nomor produksi
router.get("/report/:noProduksi/pdf", requirePermission("proses_sanding:read"), ctrl.generateProduksiReportPdf);

module.exports = router;
