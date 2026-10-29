const express = require("express");
const router = express.Router();
const verifyToken = require("../../core/middleware/verify-token");
const attachPermissions = require("../../core/middleware/attach-permissions");
const requirePermission = require("../../core/middleware/require-permission");
const ctrl = require("./master-gol-pengukuran-controller");

router.use(express.json());
router.use(verifyToken, attachPermissions);

/* Permission: datamaster_golpengukuran:create | read | update | delete (lihat permissions.sql) */
router.get("/", requirePermission("datamaster_golpengukuran:read"), ctrl.getAll);
router.get("/:id/detail", requirePermission("datamaster_golpengukuran:read"), ctrl.getDetail);
router.post("/", requirePermission("datamaster_golpengukuran:create"), ctrl.create);
router.put("/:id", requirePermission("datamaster_golpengukuran:update"), ctrl.update);
router.put("/:id/status", requirePermission("datamaster_golpengukuran:update"), ctrl.setEnable);
router.delete("/:id", requirePermission("datamaster_golpengukuran:delete"), ctrl.remove);

module.exports = router;
