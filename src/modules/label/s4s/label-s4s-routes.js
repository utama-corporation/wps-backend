const express = require("express");
const router = express.Router();
const verifyToken = require("../../../core/middleware/verify-token");
const attachPermissions = require("../../../core/middleware/attach-permissions");
const requirePermission = require("../../../core/middleware/require-permission");
const { resetPrintHandler } = require("../../../core/utils/print-limit");
const { mastersHandler } = require("../label-masters-service");
const ctrl = require("./label-s4s-controller");
const { getSusunList } = require("../st/label-st-controller");

router.use(express.json());
router.use(verifyToken, attachPermissions);

// GET /api/label/s4s/masters -> data combo dialog Ubah (jenis kayu, grade, telly, SPK, lokasi)
router.get(
  "/label/s4s/masters",
  requirePermission("label_s4s:read"),
  mastersHandler("S4S", "S4S"),
);

// GET /api/label/s4s/susun?date= -> list bongkar susun per tanggal (form Buat Label)
router.get(
  "/label/s4s/susun",
  requirePermission("label_s4s:create"),
  getSusunList,
);

// GET /api/label/s4s/list -> list semua label S4S
router.get(
  "/label/s4s/list",
  requirePermission("label_s4s:read"),
  ctrl.getAllLabels,
);

// GET /api/label/s4s/detail/:nos4s -> detail by no S4S
router.get(
  "/label/s4s/detail/:nos4s",
  requirePermission("label_s4s:read"),
  ctrl.getDetailByNo,
);

// GET /api/label/s4s/:nos4s/edit -> header data with IDs for editing
router.get(
  "/label/s4s/:nos4s/edit",
  requirePermission("label_s4s:read"),
  ctrl.getHeaderForEdit,
);

// GET /api/label/s4s/:nos4s/pdf -> PDF label
router.get(
  "/label/s4s/:nos4s/pdf",
  requirePermission("label_s4s:read"),
  ctrl.generatePdf,
);

// GET /api/label/s4s/:nos4s -> data mentah label
router.get(
  "/label/s4s/:nos4s",
  requirePermission("label_s4s:read"),
  ctrl.getLabelData,
);

// PUT /api/label/s4s/:nos4s -> update label
router.put(
  "/label/s4s/:nos4s",
  requirePermission("label_s4s:update"),
  ctrl.updateLabel,
);

// DELETE /api/label/s4s/:nos4s -> delete label
router.delete(
  "/label/s4s/:nos4s",
  requirePermission("label_s4s:delete"),
  ctrl.deleteLabel,
);

// PUT /api/label/s4s/:nos4s/print/reset -> reset HasBeenPrinted (butuh permission khusus)
router.put(
  "/label/s4s/:nos4s/print/reset",
  requirePermission("label_s4s:reset_print"),
  resetPrintHandler({ table: "S4S_h", keyCol: "NoS4S", param: "nos4s", label: "S4S" }),
);

module.exports = router;
