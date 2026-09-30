const express = require("express");
const router = express.Router();
const verifyToken = require("../../../core/middleware/verify-token");
const attachPermissions = require("../../../core/middleware/attach-permissions");
const requirePermission = require("../../../core/middleware/require-permission");
const ctrl = require("./label-cca-controller");

router.use(express.json());
// urutan penting: verify → attach → require → controller
router.use(verifyToken, attachPermissions);

// GET /api/label/cca/list -> all labels
router.get(
  "/label/cca/list",
  requirePermission("label_cca:read"),
  ctrl.getAllLabels,
);

// GET /api/label/cca/detail/:nocca -> detail rows
router.get(
  "/label/cca/detail/:nocca",
  requirePermission("label_cca:read"),
  ctrl.getDetailByNo,
);

// GET /api/label/cca/:nocca/edit -> header for edit form
router.get(
  "/label/cca/:nocca/edit",
  requirePermission("label_cca:read"),
  ctrl.getHeaderForEdit,
);

// PUT /api/label/cca/:nocca -> update label
router.put(
  "/label/cca/:nocca",
  requirePermission("label_cca:read"),
  ctrl.updateLabel,
);

// DELETE /api/label/cca/:nocca -> delete label
router.delete(
  "/label/cca/:nocca",
  requirePermission("label_cca:read"),
  ctrl.deleteLabel,
);

// GET /api/label/cca/:nocca/pdf -> PDF label
router.get(
  "/label/cca/:nocca/pdf",
  requirePermission("label_cca:read"),
  ctrl.generatePdf,
);

// GET /api/label/cca/:nocca -> raw label data
router.get(
  "/label/cca/:nocca",
  requirePermission("label_cca:read"),
  ctrl.getLabelData,
);

module.exports = router;
