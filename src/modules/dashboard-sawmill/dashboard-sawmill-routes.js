const express = require("express");
const verifyToken = require("../../core/middleware/verify-token");
const attachPermissions = require("../../core/middleware/attach-permissions");
const requirePermission = require("../../core/middleware/require-permission");
const ctrl = require("./dashboard-sawmill-controller");

const router = express.Router();
router.use(verifyToken, attachPermissions);

/* Permission: dashboard_sawmill:read (lihat permissions.sql) */
router.use(requirePermission("dashboard_sawmill:read"));

router.get("/vacuum", ctrl.vacuum);
router.get("/produktivitas-slp", ctrl.produktivitasSlp);
router.get("/produktivitas-bansaw", ctrl.produktivitasBansaw);
router.get("/rendemen", ctrl.rendemen);
router.get("/rendemen-daftar", ctrl.rendemenDaftar);
router.get("/bahan-baku", ctrl.bahanBaku);
router.get("/kd", ctrl.kd);
router.get("/saldo-kb", ctrl.saldoKb);

module.exports = router;
