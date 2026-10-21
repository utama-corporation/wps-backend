const express = require("express");
const router = express.Router();
const verifyToken = require("../../core/middleware/verify-token");
const attachPermissions = require("../../core/middleware/attach-permissions");
const requirePermission = require("../../core/middleware/require-permission");
const ctrl = require("./master-mesin-controller");

router.use(express.json());
router.use(verifyToken, attachPermissions);

/* Permission (NoPermission di MstUserGroupPermission):
 *   datamaster_mesin:create | read | update | delete  (lihat permissions.sql) */
router.get("/", requirePermission("datamaster_mesin:read"), ctrl.getAll);
router.get("/options", requirePermission("datamaster_mesin:read"), ctrl.getOptions);
router.post("/", requirePermission("datamaster_mesin:create"), ctrl.create);
router.put("/:id", requirePermission("datamaster_mesin:update"), ctrl.update);
router.delete("/:id", requirePermission("datamaster_mesin:delete"), ctrl.remove);

module.exports = router;
