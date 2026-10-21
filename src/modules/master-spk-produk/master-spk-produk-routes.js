const express = require("express");
const router = express.Router();
const verifyToken = require("../../core/middleware/verify-token");
const attachPermissions = require("../../core/middleware/attach-permissions");
const requirePermission = require("../../core/middleware/require-permission");
const ctrl = require("./master-spk-produk-controller");

router.use(express.json());
router.use(verifyToken, attachPermissions);

/* Permission: datamaster_spkproduk:create | read | update | delete (lihat permissions.sql) */
router.get("/", requirePermission("datamaster_spkproduk:read"), ctrl.getAll);
router.get("/masters", requirePermission("datamaster_spkproduk:read"), ctrl.getMasters);
router.get("/:id", requirePermission("datamaster_spkproduk:read"), ctrl.getById);
router.post("/", requirePermission("datamaster_spkproduk:create"), ctrl.create);
router.put("/:id", requirePermission("datamaster_spkproduk:update"), ctrl.update);
router.delete("/:id", requirePermission("datamaster_spkproduk:delete"), ctrl.remove);

module.exports = router;
