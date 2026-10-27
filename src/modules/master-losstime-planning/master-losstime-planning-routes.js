const express = require("express");
const router = express.Router();
const verifyToken = require("../../core/middleware/verify-token");
const attachPermissions = require("../../core/middleware/attach-permissions");
const requirePermission = require("../../core/middleware/require-permission");
const ctrl = require("./master-losstime-planning-controller");

router.use(express.json());
router.use(verifyToken, attachPermissions);

/* Permission (MstPermissionList):
 *   datamaster_losstimeplanning:create | read | update | delete */
router.get("/", requirePermission("datamaster_losstimeplanning:read"), ctrl.getAll);
router.get("/options", requirePermission("datamaster_losstimeplanning:read"), ctrl.getOptions);
router.post("/", requirePermission("datamaster_losstimeplanning:create"), ctrl.create);
router.put("/", requirePermission("datamaster_losstimeplanning:update"), ctrl.update);
router.delete("/", requirePermission("datamaster_losstimeplanning:delete"), ctrl.remove);

module.exports = router;
