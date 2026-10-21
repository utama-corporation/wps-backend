const express = require("express");
const router = express.Router();
const verifyToken = require("../../core/middleware/verify-token");
const attachPermissions = require("../../core/middleware/attach-permissions");
const requirePermission = require("../../core/middleware/require-permission");
const ctrl = require("./master-wip-tebal-lebar-controller");

router.use(express.json());
router.use(verifyToken, attachPermissions);

/* Permission: datamaster_wipteballebar:create | read | update | delete (lihat permissions.sql)
 * PK komposit (IdGroup, IdGrade, Tebal, Lebar) — update/hapus pakai body key lama. */
router.get("/", requirePermission("datamaster_wipteballebar:read"), ctrl.getAll);
router.get("/lookups", requirePermission("datamaster_wipteballebar:read"), ctrl.getLookups);
router.post("/", requirePermission("datamaster_wipteballebar:create"), ctrl.create);
router.put("/", requirePermission("datamaster_wipteballebar:update"), ctrl.update);
router.delete("/", requirePermission("datamaster_wipteballebar:delete"), ctrl.remove);

module.exports = router;
