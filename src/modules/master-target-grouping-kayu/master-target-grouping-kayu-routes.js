const express = require("express");
const router = express.Router();
const verifyToken = require("../../core/middleware/verify-token");
const attachPermissions = require("../../core/middleware/attach-permissions");
const requirePermission = require("../../core/middleware/require-permission");
const ctrl = require("./master-target-grouping-kayu-controller");

router.use(express.json());
router.use(verifyToken, attachPermissions);

/* Permission (MstPermissionList):
 *   datamaster_targetgroupingkayu:create | read | update | delete */
router.get("/", requirePermission("datamaster_targetgroupingkayu:read"), ctrl.getAll);
router.get("/group-options", requirePermission("datamaster_targetgroupingkayu:read"), ctrl.getGroupOptions);
router.get("/:id", requirePermission("datamaster_targetgroupingkayu:read"), ctrl.getDetail);
router.post("/", requirePermission("datamaster_targetgroupingkayu:create"), ctrl.create);
router.put("/:id", requirePermission("datamaster_targetgroupingkayu:update"), ctrl.update);
router.delete("/:id", requirePermission("datamaster_targetgroupingkayu:delete"), ctrl.remove);

module.exports = router;
