const express = require("express");
const router = express.Router();
const verifyToken = require("../../core/middleware/verify-token");
const attachPermissions = require("../../core/middleware/attach-permissions");
const requirePermission = require("../../core/middleware/require-permission");
const ctrl = require("./master-buyer-controller");

router.use(express.json());
router.use(verifyToken, attachPermissions);

/* Permission: datamaster_buyer:create | read | update | delete (lihat permissions.sql) */
router.get("/", requirePermission("datamaster_buyer:read"), ctrl.getAll);
router.post("/", requirePermission("datamaster_buyer:create"), ctrl.create);
router.put("/:id", requirePermission("datamaster_buyer:update"), ctrl.update);
router.delete("/:id", requirePermission("datamaster_buyer:delete"), ctrl.remove);

module.exports = router;
