const express = require("express");
const router = express.Router();
const verifyToken = require("../../core/middleware/verify-token");
const attachPermissions = require("../../core/middleware/attach-permissions");
const requirePermission = require("../../core/middleware/require-permission");
const ctrl = require("./master-planning-mesin-controller");

router.use(express.json());
router.use(verifyToken, attachPermissions);

/* Permission: datamaster_planningmesin:create | read | update | delete (lihat permissions.sql)
 * Parameter ?proses = s4s|fj|moulding|laminating|cca|sanding|packing|slp
 * Composite PK (IdMesin + Tanggal): PUT/DELETE memakai body {old|key, proses}. */
router.get("/proses", requirePermission("datamaster_planningmesin:read"), ctrl.getProses);
router.get("/mesin", requirePermission("datamaster_planningmesin:read"), ctrl.getMesin);
router.get("/", requirePermission("datamaster_planningmesin:read"), ctrl.getAll);
router.post("/", requirePermission("datamaster_planningmesin:create"), ctrl.create);
router.put("/", requirePermission("datamaster_planningmesin:update"), ctrl.update);
router.delete("/", requirePermission("datamaster_planningmesin:delete"), ctrl.remove);

module.exports = router;
