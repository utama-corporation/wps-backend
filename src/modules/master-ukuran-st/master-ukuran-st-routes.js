const express = require("express");
const router = express.Router();
const verifyToken = require("../../core/middleware/verify-token");
const attachPermissions = require("../../core/middleware/attach-permissions");
const requirePermission = require("../../core/middleware/require-permission");
const ctrl = require("./master-ukuran-st-controller");

router.use(express.json());
router.use(verifyToken, attachPermissions);

/* Permission: datamaster_ukuranst:create | read | update | delete (lihat permissions.sql)
 * PK komposit (IdJenisKayu, IdUOMTblLebar, Tebal, Lebar) — update/hapus pakai body key lama. */
router.get("/", requirePermission("datamaster_ukuranst:read"), ctrl.getAll);
router.get("/lookups", requirePermission("datamaster_ukuranst:read"), ctrl.getLookups);
router.post("/", requirePermission("datamaster_ukuranst:create"), ctrl.create);
router.put("/", requirePermission("datamaster_ukuranst:update"), ctrl.update);
router.delete("/", requirePermission("datamaster_ukuranst:delete"), ctrl.remove);

module.exports = router;
