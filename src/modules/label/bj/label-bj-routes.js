const express = require("express");
const router = express.Router();
const verifyToken = require("../../../core/middleware/verify-token");
const attachPermissions = require("../../../core/middleware/attach-permissions");
const requirePermission = require("../../../core/middleware/require-permission");
const { resetPrintHandler } = require("../../../core/utils/print-limit");
const ctrl = require("./label-bj-controller");
const { getSusunList } = require("../st/label-st-controller");

router.use(express.json());
router.use(verifyToken, attachPermissions);

// GET /api/label/bj/masters -> data combo dialog Ubah (jenis kayu, barang jadi, telly, SPK)
router.get(
  "/label/bj/masters",
  requirePermission("label_bj:read"),
  ctrl.getMasters,
);

// GET /api/label/bj/susun?date= -> list bongkar susun per tanggal (form Buat Label)
router.get(
  "/label/bj/susun",
  requirePermission("label_bj:create"),
  getSusunList,
);

// GET /api/label/bj/list -> list semua label
router.get(
  "/label/bj/list",
  requirePermission("label_bj:read"),
  ctrl.getAllLabels,
);

// GET /api/label/bj/detail/:nobj -> detail by no
router.get(
  "/label/bj/detail/:nobj",
  requirePermission("label_bj:read"),
  ctrl.getDetailByNo,
);

// GET /api/label/bj/:nobj/edit -> header data with IDs for editing
router.get(
  "/label/bj/:nobj/edit",
  requirePermission("label_bj:read"),
  ctrl.getHeaderForEdit,
);

// GET /api/label/bj/:nobj/pdf -> PDF label
router.get(
  "/label/bj/:nobj/pdf",
  requirePermission("label_bj:read"),
  ctrl.generatePdf,
);

// GET /api/label/bj/:nobj -> data mentah label
router.get(
  "/label/bj/:nobj",
  requirePermission("label_bj:read"),
  ctrl.getLabelData,
);

// PUT /api/label/bj/:nobj -> update label
router.put(
  "/label/bj/:nobj",
  requirePermission("label_bj:update"),
  ctrl.updateLabel,
);

// DELETE /api/label/bj/:nobj -> delete label
router.delete(
  "/label/bj/:nobj",
  requirePermission("label_bj:delete"),
  ctrl.deleteLabel,
);

// PUT /api/label/bj/:nobj/print/reset -> reset HasBeenPrinted (butuh permission khusus)
router.put(
  "/label/bj/:nobj/print/reset",
  requirePermission("label_bj:reset_print"),
  resetPrintHandler({ table: "BarangJadi_h", keyCol: "NoBJ", param: "nobj", label: "BJ" }),
);

module.exports = router;
