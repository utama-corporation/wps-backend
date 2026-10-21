const express = require("express");
const router = express.Router();
const verifyToken = require("../../core/middleware/verify-token");
const attachPermissions = require("../../core/middleware/attach-permissions");
const requirePermission = require("../../core/middleware/require-permission");
const ctrl = require("./master-mesin-sawmill-controller");

router.use(express.json());
router.use(verifyToken, attachPermissions);

/* Permission (NoPermission di MstUserGroupPermission):
 *   datamaster_mesinsawmill:create | read | update | delete  (lihat permissions.sql) */
router.get("/", requirePermission("datamaster_mesinsawmill:read"), ctrl.getAll);
router.get("/options", requirePermission("datamaster_mesinsawmill:read"), ctrl.getOptions);
router.post("/", requirePermission("datamaster_mesinsawmill:create"), ctrl.create);
router.put("/:noMeja", requirePermission("datamaster_mesinsawmill:update"), ctrl.update);
router.delete("/:noMeja", requirePermission("datamaster_mesinsawmill:delete"), ctrl.remove);

module.exports = router;
