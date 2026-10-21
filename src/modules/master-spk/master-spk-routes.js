const express = require("express");
const router = express.Router();
const verifyToken = require("../../core/middleware/verify-token");
const attachPermissions = require("../../core/middleware/attach-permissions");
const requirePermission = require("../../core/middleware/require-permission");
const ctrl = require("./master-spk-controller");

router.use(express.json({ limit: "2mb" }));
router.use(verifyToken, attachPermissions);

/* Permission: datamaster_spk:create | read | update | delete (lihat permissions.sql) */
router.get("/", requirePermission("datamaster_spk:read"), ctrl.getAll);
router.get("/masters", requirePermission("datamaster_spk:read"), ctrl.getMasters);
router.get("/:no", requirePermission("datamaster_spk:read"), ctrl.getByNo);
router.post("/", requirePermission("datamaster_spk:create"), ctrl.create);
router.put("/:no", requirePermission("datamaster_spk:update"), ctrl.update);
router.delete("/:no", requirePermission("datamaster_spk:delete"), ctrl.remove);

module.exports = router;
