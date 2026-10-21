const express = require("express");
const router = express.Router();
const verifyToken = require("../../core/middleware/verify-token");
const attachPermissions = require("../../core/middleware/attach-permissions");
const requirePermission = require("../../core/middleware/require-permission");
const ctrl = require("./master-spk-reserve-controller");

router.use(express.json({ limit: "2mb" }));
router.use(verifyToken, attachPermissions);

/* Permission: datamaster_spkreserve:create | read | update | delete (lihat permissions.sql) */
router.get("/", requirePermission("datamaster_spkreserve:read"), ctrl.getAll);
router.get("/masters", requirePermission("datamaster_spkreserve:read"), ctrl.getMasters);
router.get("/:id", requirePermission("datamaster_spkreserve:read"), ctrl.getById);
router.post("/", requirePermission("datamaster_spkreserve:create"), ctrl.create);
router.put("/:id", requirePermission("datamaster_spkreserve:update"), ctrl.update);
router.delete("/:id", requirePermission("datamaster_spkreserve:delete"), ctrl.remove);

module.exports = router;
