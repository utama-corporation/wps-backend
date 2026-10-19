const express = require("express");
const router = express.Router();
const verifyToken = require("../../core/middleware/verify-token");
const ctrl = require("./penerimaan-st-sawmill-controller");

router.use(express.json());

// Menu Penerimaan ST (Sawmill) di tablet tanpa permission khusus (null) — hanya login.
// Sejalan dengan modul Lembar Tally Hasil Sawmill yang membuat penerimaan ini.
const BASE = "/penerimaan-st-sawmill";

router.get(BASE, verifyToken, ctrl.getAll);
router.get(`${BASE}/:no/st-sawmill`, verifyToken, ctrl.getSTSawmillList);
router.delete(`${BASE}/:no`, verifyToken, ctrl.remove);

module.exports = router;
