const express = require("express");
const router = express.Router();
const verifyToken = require("../../core/middleware/verify-token");
const attachPermissions = require("../../core/middleware/attach-permissions");
const requirePermission = require("../../core/middleware/require-permission");
const ctrl = require("./master-tarif-upah-stick-controller");

router.use(express.json());
router.use(verifyToken, attachPermissions);

/* Permission: datamaster_tarifupahstick:create | read | update | delete (lihat permissions.sql) */
router.get("/", requirePermission("datamaster_tarifupahstick:read"), ctrl.getAll);
router.get("/jenis-kayu-options", requirePermission("datamaster_tarifupahstick:read"), ctrl.getJenisKayuOptions);
router.post("/", requirePermission("datamaster_tarifupahstick:create"), ctrl.create);
router.post("/hitung-ulang", requirePermission("datamaster_tarifupahstick:update"), ctrl.hitungUlang);
router.put("/:id", requirePermission("datamaster_tarifupahstick:update"), ctrl.update);
router.delete("/:id", requirePermission("datamaster_tarifupahstick:delete"), ctrl.remove);

module.exports = router;
