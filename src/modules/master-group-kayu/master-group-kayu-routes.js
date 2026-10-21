const express = require("express");
const router = express.Router();
const verifyToken = require("../../core/middleware/verify-token");
const attachPermissions = require("../../core/middleware/attach-permissions");
const requirePermission = require("../../core/middleware/require-permission");
const ctrl = require("./master-group-kayu-controller");

router.use(express.json());
router.use(verifyToken, attachPermissions);

/* Permission (NoPermission di MstUserGroupPermission):
 *   datamaster_groupkayu:create | read | update | delete  (lihat permissions.sql) */
router.get("/", requirePermission("datamaster_groupkayu:read"), ctrl.getAll);
router.post("/", requirePermission("datamaster_groupkayu:create"), ctrl.create);
router.put("/:id", requirePermission("datamaster_groupkayu:update"), ctrl.update);
router.delete("/:id", requirePermission("datamaster_groupkayu:delete"), ctrl.remove);

module.exports = router;
