const express = require("express");
const router = express.Router();
const verifyToken = require("../../core/middleware/verify-token");
const attachPermissions = require("../../core/middleware/attach-permissions");
const requirePermission = require("../../core/middleware/require-permission");
const ctrl = require("./master-grade-stick-controller");

router.use(express.json());
router.use(verifyToken, attachPermissions);

/* Permission: datamaster_gradestick:create | read | update | delete (lihat permissions.sql) */
router.get("/", requirePermission("datamaster_gradestick:read"), ctrl.getAll);
router.post("/", requirePermission("datamaster_gradestick:create"), ctrl.create);
router.put("/:id", requirePermission("datamaster_gradestick:update"), ctrl.update);
router.delete("/:id", requirePermission("datamaster_gradestick:delete"), ctrl.remove);

module.exports = router;
