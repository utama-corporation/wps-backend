const express = require("express");
const router = express.Router();
const verifyToken = require("../../core/middleware/verify-token");
const attachPermissions = require("../../core/middleware/attach-permissions");
const requirePermission = require("../../core/middleware/require-permission");
const ctrl = require("./master-operator-controller");

router.use(express.json());
router.use(verifyToken, attachPermissions);

/* Permission (NoPermission di MstUserGroupPermission):
 *   datamaster_operator:create | read | update | delete  (lihat permissions.sql) */
router.get("/", requirePermission("datamaster_operator:read"), ctrl.getAll);
router.get("/options", requirePermission("datamaster_operator:read"), ctrl.getOptions);
router.post("/", requirePermission("datamaster_operator:create"), ctrl.create);
router.put("/:id", requirePermission("datamaster_operator:update"), ctrl.update);
router.delete("/:id", requirePermission("datamaster_operator:delete"), ctrl.remove);

module.exports = router;
