const express = require("express");
const router = express.Router();
const verifyToken = require("../../core/middleware/verify-token");
const attachPermissions = require("../../core/middleware/attach-permissions");
const requirePermission = require("../../core/middleware/require-permission");
const ctrl = require("./master-org-telly-controller");

router.use(express.json());
router.use(verifyToken, attachPermissions);

/* Permission (NoPermission di MstUserGroupPermission):
 *   datamaster_orgtelly:create | read | update | delete  (lihat permissions.sql) */
router.get("/", requirePermission("datamaster_orgtelly:read"), ctrl.getAll);
router.post("/", requirePermission("datamaster_orgtelly:create"), ctrl.create);
router.put("/:id", requirePermission("datamaster_orgtelly:update"), ctrl.update);
router.delete("/:id", requirePermission("datamaster_orgtelly:delete"), ctrl.remove);

module.exports = router;
