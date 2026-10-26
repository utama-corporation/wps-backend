const express = require("express");
const router = express.Router();
const verifyToken = require("../../core/middleware/verify-token");
const attachPermissions = require("../../core/middleware/attach-permissions");
const ctrl = require("./laporan-controller");

router.use(verifyToken, attachPermissions);

// PDF per kode laporan (menu Laporan — paritas FrmLaporan aplikasi desktop).
// Cek permission dilakukan di controller per kategori
// (laporan:read = semua, atau laporan:<slug>:read per kategori).
router.get("/:kode/pdf", ctrl.getPdf);

module.exports = router;
