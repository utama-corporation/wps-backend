const express = require("express");
const router = express.Router();
const verifyToken = require("../../core/middleware/verify-token");
const attachPermissions = require("../../core/middleware/attach-permissions");
const requirePermission = require("../../core/middleware/require-permission");
const ctrl = require("./master-grade-controller");

router.use(express.json());
router.use(verifyToken, attachPermissions);

/* Permission: datamaster_grade:create | read | update | delete (lihat permissions.sql) */
router.get("/", requirePermission("datamaster_grade:read"), ctrl.getAll);
router.get("/:id/categories", requirePermission("datamaster_grade:read"), ctrl.getCategories);
router.put("/:id/categories", requirePermission("datamaster_grade:update"), ctrl.replaceCategories);
router.post("/", requirePermission("datamaster_grade:create"), ctrl.create);
router.put("/:id", requirePermission("datamaster_grade:update"), ctrl.update);
router.delete("/:id", requirePermission("datamaster_grade:delete"), ctrl.remove);

module.exports = router;
