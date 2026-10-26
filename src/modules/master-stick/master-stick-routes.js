const express = require("express");
const router = express.Router();
const verifyToken = require("../../core/middleware/verify-token");
const attachPermissions = require("../../core/middleware/attach-permissions");
const requirePermission = require("../../core/middleware/require-permission");
const ctrl = require("./master-stick-controller");

router.use(express.json());
router.use(verifyToken, attachPermissions);

/* Permission: datamaster_stick:create | read | update | delete (lihat permissions.sql)
 * Composite PK (TglSaldoAwal + IdGradeStick): PUT/DELETE memakai body {old|key}. */
router.get("/", requirePermission("datamaster_stick:read"), ctrl.getAll);
router.get("/lookups/grades", requirePermission("datamaster_stick:read"), ctrl.getGrades);
router.post("/", requirePermission("datamaster_stick:create"), ctrl.create);
router.put("/", requirePermission("datamaster_stick:update"), ctrl.update);
router.delete("/", requirePermission("datamaster_stick:delete"), ctrl.remove);

module.exports = router;
