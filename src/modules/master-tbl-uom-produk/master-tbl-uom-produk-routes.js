const express = require("express");
const router = express.Router();
const verifyToken = require("../../core/middleware/verify-token");
const attachPermissions = require("../../core/middleware/attach-permissions");
const requirePermission = require("../../core/middleware/require-permission");
const ctrl = require("./master-tbl-uom-produk-controller");

router.use(express.json());
router.use(verifyToken, attachPermissions);

/* Permission: datamaster_tbluomproduk:create | read | update | delete (lihat permissions.sql)
 * PK komposit (IdGroup, Tebal, Lebar, IdUOM) — update/hapus pakai body key lama. */
router.get("/", requirePermission("datamaster_tbluomproduk:read"), ctrl.getAll);
router.get("/lookups", requirePermission("datamaster_tbluomproduk:read"), ctrl.getLookups);
router.post("/", requirePermission("datamaster_tbluomproduk:create"), ctrl.create);
router.put("/", requirePermission("datamaster_tbluomproduk:update"), ctrl.update);
router.delete("/", requirePermission("datamaster_tbluomproduk:delete"), ctrl.remove);

module.exports = router;
