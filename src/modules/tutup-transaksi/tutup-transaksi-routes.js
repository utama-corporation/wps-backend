const express = require("express");
const router = express.Router();
const verifyToken = require("../../core/middleware/verify-token");
const attachPermissions = require("../../core/middleware/attach-permissions");
const requirePermission = require("../../core/middleware/require-permission");
const ctrl = require("./tutup-transaksi-controller");

router.use(express.json());
router.use(verifyToken, attachPermissions);

/* Permission: tutup_transaksi:create | read | update | delete (lihat permissions.sql) */
router.get("/bulanan", requirePermission("tutup_transaksi:read"), ctrl.getBulanan);
router.post("/bulanan", requirePermission("tutup_transaksi:create"), ctrl.createBulanan);
router.put("/bulanan/:period", requirePermission("tutup_transaksi:update"), ctrl.updateBulanan);
router.delete("/bulanan/:period", requirePermission("tutup_transaksi:delete"), ctrl.removeBulanan);

router.get("/harian", requirePermission("tutup_transaksi:read"), ctrl.getHarian);
router.post("/harian", requirePermission("tutup_transaksi:create"), ctrl.createHarian);
router.put("/harian/:id", requirePermission("tutup_transaksi:update"), ctrl.updateHarian);
router.delete("/harian/:id", requirePermission("tutup_transaksi:delete"), ctrl.removeHarian);

module.exports = router;
