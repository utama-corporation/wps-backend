const express = require("express");
const router = express.Router();
const verifyToken = require("../../core/middleware/verify-token");
const attachPermissions = require("../../core/middleware/attach-permissions");
const requirePermission = require("../../core/middleware/require-permission");
const ctrl = require("./master-grade-abc-controller");

router.use(express.json());
router.use(verifyToken, attachPermissions);

/* Permission: datamaster_gradeabc:create | read | update | delete (lihat permissions.sql) */
router.get("/", requirePermission("datamaster_gradeabc:read"), ctrl.getAll);
router.post("/", requirePermission("datamaster_gradeabc:create"), ctrl.create);
router.put("/:id", requirePermission("datamaster_gradeabc:update"), ctrl.update);
router.delete("/:id", requirePermission("datamaster_gradeabc:delete"), ctrl.remove);

module.exports = router;
