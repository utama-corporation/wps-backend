const express = require("express");
const router = express.Router();
const verifyToken = require("../../core/middleware/verify-token");
const attachPermissions = require("../../core/middleware/attach-permissions");
const requirePermission = require("../../core/middleware/require-permission");
const ctrl = require("./master-target-kayu-bulat-controller");

router.use(express.json());
router.use(verifyToken, attachPermissions);

/* Permission (MstPermissionList):
 *   datamaster_targetkayubulat:create | read | update | delete */
router.get("/", requirePermission("datamaster_targetkayubulat:read"), ctrl.getAll);
router.get("/grouping-options", requirePermission("datamaster_targetkayubulat:read"), ctrl.getGroupingOptions);
router.post("/", requirePermission("datamaster_targetkayubulat:create"), ctrl.create);
router.put("/", requirePermission("datamaster_targetkayubulat:update"), ctrl.update);
router.delete("/", requirePermission("datamaster_targetkayubulat:delete"), ctrl.remove);

module.exports = router;
