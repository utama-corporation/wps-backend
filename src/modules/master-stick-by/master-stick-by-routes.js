const express = require("express");
const router = express.Router();
const verifyToken = require("../../core/middleware/verify-token");
const attachPermissions = require("../../core/middleware/attach-permissions");
const requirePermission = require("../../core/middleware/require-permission");
const ctrl = require("./master-stick-by-controller");

router.use(express.json());
router.use(verifyToken, attachPermissions);

/* Permission: datamaster_stickby:create | read | update | delete (lihat permissions.sql) */
router.get("/", requirePermission("datamaster_stickby:read"), ctrl.getAll);
router.post("/", requirePermission("datamaster_stickby:create"), ctrl.create);
router.put("/:id", requirePermission("datamaster_stickby:update"), ctrl.update);
router.delete("/:id", requirePermission("datamaster_stickby:delete"), ctrl.remove);

module.exports = router;
