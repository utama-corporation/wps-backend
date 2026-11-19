const express = require("express");
const verifyToken = require("../../core/middleware/verify-token");
const attachPermissions = require("../../core/middleware/attach-permissions");
const ctrl = require("./my-work-controller");

/* Pekerjaan Saya: semua pengguna login boleh membuka; isi tiap kategori disaring
 * per izin di service, jadi tidak ada requirePermission di tingkat rute. */
const router = express.Router();
router.use(verifyToken, attachPermissions);

router.get("/summary", ctrl.summary);
router.get("/list", ctrl.list);

module.exports = router;
