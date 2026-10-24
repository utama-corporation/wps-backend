const express = require("express");
const verifyToken = require("../../core/middleware/verify-token");
const attachPermissions = require("../../core/middleware/attach-permissions");
const requirePermission = require("../../core/middleware/require-permission");
const vacuumV2Controller = require("./vacuumv2-controller");

const router = express.Router();
router.use(express.json());
router.use(verifyToken, attachPermissions);

/* Permission: vacuum_v2:create | read | update | delete (lihat permissions.sql) */
router.get("/masters", requirePermission("vacuum_v2:read"), vacuumV2Controller.getMasters);
router.get("/header", requirePermission("vacuum_v2:read"), vacuumV2Controller.getHeader);
router.get("/detail", requirePermission("vacuum_v2:read"), vacuumV2Controller.getDetail);
router.get("/", requirePermission("vacuum_v2:read"), vacuumV2Controller.getAll);
router.post("/", requirePermission("vacuum_v2:create"), vacuumV2Controller.create);
router.put("/", requirePermission("vacuum_v2:update"), vacuumV2Controller.update);
router.delete("/", requirePermission("vacuum_v2:delete"), vacuumV2Controller.remove);

module.exports = router;
