const express = require("express");
const router = express.Router();
const verifyToken = require("../../core/middleware/verify-token");
const attachPermissions = require("../../core/middleware/attach-permissions");
const requirePermission = require("../../core/middleware/require-permission");
const ctrl = require("./master-losstime-faktor-controller");

router.use(express.json());
router.use(verifyToken, attachPermissions);

/* Permission (MstPermissionList):
 *   datamaster_losstimefaktor:create | read | update | delete */
router.get("/", requirePermission("datamaster_losstimefaktor:read"), ctrl.getAll);
router.post("/", requirePermission("datamaster_losstimefaktor:create"), ctrl.create);
router.put("/:id", requirePermission("datamaster_losstimefaktor:update"), ctrl.update);
router.delete("/:id", requirePermission("datamaster_losstimefaktor:delete"), ctrl.remove);

module.exports = router;
