const express = require("express");
const router = express.Router();
const verifyToken = require("../../core/middleware/verify-token");
const attachPermissions = require("../../core/middleware/attach-permissions");
const requirePermission = require("../../core/middleware/require-permission");
const ctrl = require("./master-offset-racipan-controller");

router.use(express.json());
router.use(verifyToken, attachPermissions);

/* Permission: datamaster_offsetracipan:create | read | update | delete (lihat permissions.sql)
 * PK header = TglSaldoAwal; detail Offset di-replace-all pada create/update. */
router.get("/", requirePermission("datamaster_offsetracipan:read"), ctrl.getAll);
router.get("/lookups/jenis-kayu", requirePermission("datamaster_offsetracipan:read"), ctrl.getJenisKayu);
router.get("/:tgl/detail", requirePermission("datamaster_offsetracipan:read"), ctrl.getDetail);
router.post("/", requirePermission("datamaster_offsetracipan:create"), ctrl.create);
router.put("/:tgl", requirePermission("datamaster_offsetracipan:update"), ctrl.update);
router.delete("/:tgl", requirePermission("datamaster_offsetracipan:delete"), ctrl.remove);

module.exports = router;
