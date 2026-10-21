const express = require("express");
const router = express.Router();
const verifyToken = require("../../core/middleware/verify-token");
const attachPermissions = require("../../core/middleware/attach-permissions");
const requirePermission = require("../../core/middleware/require-permission");
const ctrl = require("./master-supplier-group-kayu-controller");

router.use(express.json());
router.use(verifyToken, attachPermissions);

/* Permission (NoPermission di MstUserGroupPermission):
 *   datamaster_suppliergroupkayu:create | read | update | delete  (lihat permissions.sql) */
router.get("/", requirePermission("datamaster_suppliergroupkayu:read"), ctrl.getAll);
router.get("/options", requirePermission("datamaster_suppliergroupkayu:read"), ctrl.getOptions);
router.post("/", requirePermission("datamaster_suppliergroupkayu:create"), ctrl.create);
router.put("/:idSupplier/:idGroup", requirePermission("datamaster_suppliergroupkayu:update"), ctrl.update);
router.delete("/:idSupplier/:idGroup", requirePermission("datamaster_suppliergroupkayu:delete"), ctrl.remove);

module.exports = router;
