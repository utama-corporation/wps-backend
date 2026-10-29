const express = require("express");
const router = express.Router();
const verifyToken = require("../../core/middleware/verify-token");
const attachPermissions = require("../../core/middleware/attach-permissions");
const requirePermission = require("../../core/middleware/require-permission");
const ctrl = require("./master-uom-controller");

router.use(express.json());
router.use(verifyToken, attachPermissions);

/* Permission: datamaster_uom:create | read | update | delete (lihat permissions.sql) */
router.get("/", requirePermission("datamaster_uom:read"), ctrl.getAll);
router.post("/", requirePermission("datamaster_uom:create"), ctrl.create);
router.put("/:id", requirePermission("datamaster_uom:update"), ctrl.update);
router.delete("/:id", requirePermission("datamaster_uom:delete"), ctrl.remove);

module.exports = router;
