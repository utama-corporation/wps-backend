const express = require("express");
const router = express.Router();
const verifyToken = require("../../../core/middleware/verify-token");
const attachPermissions = require("../../../core/middleware/attach-permissions");
const requirePermission = require("../../../core/middleware/require-permission");
const ctrl = require("./label-moulding-controller");

router.use(express.json());
// urutan penting: verify → attach → require → controller
router.use(verifyToken, attachPermissions);

// GET /api/label/moulding/list -> all labels
router.get(
  "/label/moulding/list",
  requirePermission("label_mld:read"),
  ctrl.getAllLabels,
);

// GET /api/label/moulding/detail/:nomoulding -> detail rows
router.get(
  "/label/moulding/detail/:nomoulding",
  requirePermission("label_mld:read"),
  ctrl.getDetailByNo,
);

// GET /api/label/moulding/:nomoulding/edit -> header for edit form
router.get(
  "/label/moulding/:nomoulding/edit",
  requirePermission("label_mld:read"),
  ctrl.getHeaderForEdit,
);

// PUT /api/label/moulding/:nomoulding -> update label
router.put(
  "/label/moulding/:nomoulding",
  requirePermission("label_mld:read"),
  ctrl.updateLabel,
);

// DELETE /api/label/moulding/:nomoulding -> delete label
router.delete(
  "/label/moulding/:nomoulding",
  requirePermission("label_mld:read"),
  ctrl.deleteLabel,
);

// GET /api/label/moulding/:nomoulding/pdf -> PDF label
router.get(
  "/label/moulding/:nomoulding/pdf",
  requirePermission("label_mld:read"),
  ctrl.generatePdf,
);

// GET /api/label/moulding/:nomoulding -> raw label data
router.get(
  "/label/moulding/:nomoulding",
  requirePermission("label_mld:read"),
  ctrl.getLabelData,
);

module.exports = router;
