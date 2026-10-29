const express = require("express");
const router = express.Router();
const verifyToken = require("../../core/middleware/verify-token");
const attachPermissions = require("../../core/middleware/attach-permissions");
const requirePermission = require("../../core/middleware/require-permission");
const ctrl = require("./supplier-intel-controller");

router.use(express.json());
router.use(verifyToken, attachPermissions);

/* Permission (NoPermission di MstUserGroupPermission):
 *   supplier_intel:create | read | update | delete  (lihat permissions.sql) */
router.get("/", requirePermission("supplier_intel:read"), ctrl.getAll);
router.get("/options", requirePermission("supplier_intel:read"), ctrl.getOptions);
router.post("/", requirePermission("supplier_intel:create"), ctrl.create);
router.put("/:id", requirePermission("supplier_intel:update"), ctrl.update);
router.delete("/:id", requirePermission("supplier_intel:delete"), ctrl.remove);

module.exports = router;
