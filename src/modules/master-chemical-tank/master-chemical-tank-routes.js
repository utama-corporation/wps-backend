const express = require("express");
const router = express.Router();
const verifyToken = require("../../core/middleware/verify-token");
const attachPermissions = require("../../core/middleware/attach-permissions");
const requirePermission = require("../../core/middleware/require-permission");
const ctrl = require("./master-chemical-tank-controller");

router.use(express.json());
router.use(verifyToken, attachPermissions);

/* Permission: datamaster_chemicaltank:create | read | update | delete (lihat permissions.sql) */
router.get("/", requirePermission("datamaster_chemicaltank:read"), ctrl.getAll);
router.get("/lookups/jenis-kayu", requirePermission("datamaster_chemicaltank:read"), ctrl.getJenisKayu);
router.get("/:id/detail", requirePermission("datamaster_chemicaltank:read"), ctrl.getDetail);
router.post("/", requirePermission("datamaster_chemicaltank:create"), ctrl.create);
router.put("/:id", requirePermission("datamaster_chemicaltank:update"), ctrl.update);
router.delete("/:id", requirePermission("datamaster_chemicaltank:delete"), ctrl.remove);

module.exports = router;
