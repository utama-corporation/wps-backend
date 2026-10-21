const express = require("express");
const router = express.Router();
const verifyToken = require("../../core/middleware/verify-token");
const attachPermissions = require("../../core/middleware/attach-permissions");
const requirePermission = require("../../core/middleware/require-permission");
const ctrl = require("./master-barang-jadi-controller");

router.use(express.json());
router.use(verifyToken, attachPermissions);

/* Permission: datamaster_barangjadi:create | read | update | delete (lihat permissions.sql) */
router.get("/", requirePermission("datamaster_barangjadi:read"), ctrl.getAll);
router.post("/", requirePermission("datamaster_barangjadi:create"), ctrl.create);
router.put("/:id", requirePermission("datamaster_barangjadi:update"), ctrl.update);
router.delete("/:id", requirePermission("datamaster_barangjadi:delete"), ctrl.remove);

module.exports = router;
