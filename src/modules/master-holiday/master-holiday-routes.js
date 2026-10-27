const express = require("express");
const router = express.Router();
const verifyToken = require("../../core/middleware/verify-token");
const attachPermissions = require("../../core/middleware/attach-permissions");
const requirePermission = require("../../core/middleware/require-permission");
const ctrl = require("./master-holiday-controller");

router.use(express.json());
router.use(verifyToken, attachPermissions);

/* Permission (MstPermissionList):
 *   datamaster_holiday:create | read | update | delete */
router.get("/", requirePermission("datamaster_holiday:read"), ctrl.getAll);
router.post("/", requirePermission("datamaster_holiday:create"), ctrl.create);
router.put("/:tgl", requirePermission("datamaster_holiday:update"), ctrl.update);
router.delete("/:tgl", requirePermission("datamaster_holiday:delete"), ctrl.remove);

module.exports = router;
