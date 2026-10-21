const express = require("express");
const verifyToken = require("../../core/middleware/verify-token");
const attachPermissions = require("../../core/middleware/attach-permissions");
const requirePermission = require("../../core/middleware/require-permission");
const penKayuBulatController = require("./pen-kayu-bulat-controller");

const router = express.Router();
router.use(express.json());
router.use(verifyToken, attachPermissions);

// next-no, masters & header dipakai form Tambah/Edit, jadi cukup read.
router.get("/next-no", requirePermission("penerimaan_kayu_bulat:read"), penKayuBulatController.getNextNo);
router.get("/masters", requirePermission("penerimaan_kayu_bulat:read"), penKayuBulatController.getMasters);
router.get("/header", requirePermission("penerimaan_kayu_bulat:read"), penKayuBulatController.getHeader);
router.get("/laporan", requirePermission("penerimaan_kayu_bulat:read"), penKayuBulatController.getLaporan);
router.get("/detail", requirePermission("penerimaan_kayu_bulat:read"), penKayuBulatController.getDetail);
router.get("/", requirePermission("penerimaan_kayu_bulat:read"), penKayuBulatController.getAll);
router.post("/", requirePermission("penerimaan_kayu_bulat:create"), penKayuBulatController.create);
router.put("/", requirePermission("penerimaan_kayu_bulat:update"), penKayuBulatController.update);
router.delete("/", requirePermission("penerimaan_kayu_bulat:delete"), penKayuBulatController.remove);

module.exports = router;
