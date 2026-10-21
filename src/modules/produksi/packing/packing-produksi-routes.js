const express = require("express");
const router = express.Router();
const verifyToken = require("../../../core/middleware/verify-token");
const attachPermissions = require("../../../core/middleware/attach-permissions");
const requirePermission = require("../../../core/middleware/require-permission");
const ctrl = require("./packing-produksi-controller");

router.use(express.json());
router.use(verifyToken, attachPermissions);

// Read (lihat data produksi)
router.get("/mesin-list", requirePermission("proses_bj:read"), ctrl.getMesinList);
router.get("/history", requirePermission("proses_bj:read"), ctrl.getHistory);
router.get("/stok", requirePermission("proses_bj:read"), ctrl.getStok);
router.get("/stok-labels", requirePermission("proses_bj:read"), ctrl.getStokLabels);
router.get("/detail/:noProduksi", requirePermission("proses_bj:read"), ctrl.getDetail);
router.get("/header/:noProduksi", requirePermission("proses_bj:read"), ctrl.getHeader);
router.get("/next-no-produksi", requirePermission("proses_bj:read"), ctrl.getNextNoProduksi);
router.get("/next-no-label", requirePermission("proses_bj:read"), ctrl.getNextNoLabel);
router.get("/master-options", requirePermission("proses_bj:read"), ctrl.getMasterOptions);
router.get("/operators", requirePermission("proses_bj:read"), ctrl.getOperators);
router.get("/org-telly", requirePermission("proses_bj:read"), ctrl.getOrgTelly);

// Create (buka produksi baru)
router.post("/header", requirePermission("proses_bj:create"), ctrl.saveHeader);

// Update / hapus header produksi (dari menu riwayat)
router.put("/header/:noProduksi", requirePermission("proses_bj:update"), ctrl.updateHeader);
router.put("/header", requirePermission("proses_bj:update"), ctrl.updateHeaderBody);
router.post("/header/:noProduksi/ganti", requirePermission("proses_bj:update"), ctrl.gantiHeader);
router.delete("/header/:noProduksi", requirePermission("proses_bj:delete"), ctrl.deleteHeader);

// Buat label output -> permission khusus label barang jadi
router.post("/label", requirePermission("label_bj:create"), ctrl.createLabel);

// Update (tambah input / output pada produksi berjalan)
router.post("/input", requirePermission("proses_bj:update"), ctrl.addInput);
router.post("/input/simpan", requirePermission("proses_bj:update"), ctrl.simpanInput);
router.post("/output", requirePermission("proses_bj:update"), ctrl.addOutput);
router.post("/reject", requirePermission("proses_bj:update"), ctrl.addReject);

// Delete (hapus input / output)
router.delete("/input", requirePermission("proses_bj:delete"), ctrl.removeInput);
router.delete("/input/temporary", requirePermission("proses_bj:delete"), ctrl.batalInput);
router.delete("/output", requirePermission("proses_bj:delete"), ctrl.removeOutput);
router.delete("/reject", requirePermission("proses_bj:delete"), ctrl.removeReject);

// Laporan produksi (PDF) per nomor produksi
router.get("/report/:noProduksi/pdf", requirePermission("proses_bj:read"), ctrl.generateProduksiReportPdf);

// Laporan Produksi per No. Produksi (PDF, via report microservice)
router.get("/laporan", requirePermission("proses_packing:read"), ctrl.getLaporan);

module.exports = router;
