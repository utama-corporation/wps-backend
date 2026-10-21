const express = require("express");
const router = express.Router();
const verifyToken = require("../../../core/middleware/verify-token");
const attachPermissions = require("../../../core/middleware/attach-permissions");
const requirePermission = require("../../../core/middleware/require-permission");
const ctrl = require("./ccakhir-produksi-controller");

router.use(express.json());
router.use(verifyToken, attachPermissions);

// Read (lihat data produksi)
router.get("/mesin-list", requirePermission("proses_cca:read"), ctrl.getMesinList);
router.get("/history", requirePermission("proses_cca:read"), ctrl.getHistory);
router.get("/stok", requirePermission("proses_cca:read"), ctrl.getStok);
router.get("/stok-labels", requirePermission("proses_cca:read"), ctrl.getStokLabels);
router.get("/detail/:noProduksi", requirePermission("proses_cca:read"), ctrl.getDetail);
router.get("/header/:noProduksi", requirePermission("proses_cca:read"), ctrl.getHeader);
router.get("/next-no-produksi", requirePermission("proses_cca:read"), ctrl.getNextNoProduksi);
router.get("/next-no-label", requirePermission("proses_cca:read"), ctrl.getNextNoLabel);
router.get("/master-options", requirePermission("proses_cca:read"), ctrl.getMasterOptions);
router.get("/operators", requirePermission("proses_cca:read"), ctrl.getOperators);
router.get("/org-telly", requirePermission("proses_cca:read"), ctrl.getOrgTelly);

// Create (buka produksi baru)
router.post("/header", requirePermission("proses_cca:create"), ctrl.saveHeader);

// Update / hapus header produksi (dari menu riwayat)
// PUT /header (tanpa :noProduksi, noProduksi dari body) — kompatibilitas API lama.
router.put("/header", requirePermission("proses_cca:update"), ctrl.updateHeader);
router.put("/header/:noProduksi", requirePermission("proses_cca:update"), ctrl.updateHeader);
router.post("/header/:noProduksi/ganti", requirePermission("proses_cca:update"), ctrl.gantiHeader);
router.delete("/header/:noProduksi", requirePermission("proses_cca:delete"), ctrl.deleteHeader);

// Buat label output (CCA=V / S4S=R) → permission khusus label cross cut akhir
router.post("/label", requirePermission("label_cca:create"), ctrl.createLabel);

// Update (tambah input / output pada produksi berjalan)
router.post("/input", requirePermission("proses_cca:update"), ctrl.addInput);
router.post("/input/simpan", requirePermission("proses_cca:update"), ctrl.simpanInput);
router.post("/output", requirePermission("proses_cca:update"), ctrl.addOutput);
router.post("/reject", requirePermission("proses_cca:update"), ctrl.addReject);

// Delete (hapus input / output)
router.delete("/input", requirePermission("proses_cca:delete"), ctrl.removeInput);
router.delete("/input/temporary", requirePermission("proses_cca:delete"), ctrl.batalInput);
router.delete("/output", requirePermission("proses_cca:delete"), ctrl.removeOutput);
router.delete("/reject", requirePermission("proses_cca:delete"), ctrl.removeReject);

// Laporan produksi (PDF) per nomor produksi
router.get("/report/:noProduksi/pdf", requirePermission("proses_cca:read"), ctrl.generateProduksiReportPdf);

// Laporan Produksi per No. Produksi (PDF, via report microservice)
router.get("/laporan", requirePermission("proses_cca:read"), ctrl.getLaporan);

module.exports = router;
