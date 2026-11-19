const express = require("express");
const router = express.Router();
const verifyToken = require("../../core/middleware/verify-token");
const attachPermissions = require("../../core/middleware/attach-permissions");
const requirePermission = require("../../core/middleware/require-permission");
const ctrl = require("./bongkar-stick-reminder-controller");

router.use(express.json());
router.use(verifyToken, attachPermissions);

/* Permission (MstPermissionList):
 *   bongkar_stick_reminder:read | update */
router.get("/", requirePermission("bongkar_stick_reminder:read"), ctrl.getList);
router.get("/label-info", requirePermission("bongkar_stick_reminder:read"), ctrl.getLabelInfo);
router.get("/setting", requirePermission("bongkar_stick_reminder:read"), ctrl.getSetting);
router.put("/setting", requirePermission("bongkar_stick_reminder:update"), ctrl.updateSetting);
router.put("/:noST/flag", requirePermission("bongkar_stick_reminder:update"), ctrl.setFlag);

module.exports = router;
