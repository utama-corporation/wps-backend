const express = require("express");
const router = express.Router();
const verifyToken = require("../../core/middleware/verify-token");
const attachPermissions = require("../../core/middleware/attach-permissions");
const requirePermission = require("../../core/middleware/require-permission");
const ctrl = require("./laporan-controller");

router.use(verifyToken, attachPermissions);

// PDF per kode laporan (menu Laporan — paritas FrmLaporan aplikasi desktop)
router.get("/:kode/pdf", requirePermission("laporan:read"), ctrl.getPdf);

module.exports = router;
