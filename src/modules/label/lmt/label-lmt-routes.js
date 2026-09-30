const express = require("express");
const router = express.Router();
const verifyToken = require("../../../core/middleware/verify-token");
const attachPermissions = require("../../../core/middleware/attach-permissions");
const requirePermission = require("../../../core/middleware/require-permission");
const ctrl = require("./label-lmt-controller");

router.use(express.json());
// urutan penting: verify → attach → require → controller
router.use(verifyToken, attachPermissions);

// GET /api/label/lmt/list -> all labels
router.get(
  "/label/lmt/list",
  requirePermission("label_lmt:read"),
  ctrl.getAllLabels,
);

// GET /api/label/lmt/detail/:nolmt -> detail rows
router.get(
  "/label/lmt/detail/:nolmt",
  requirePermission("label_lmt:read"),
  ctrl.getDetailByNo,
);

// GET /api/label/lmt/:nolmt/edit -> header for edit form
router.get(
  "/label/lmt/:nolmt/edit",
  requirePermission("label_lmt:read"),
  ctrl.getHeaderForEdit,
);

// PUT /api/label/lmt/:nolmt -> update label
router.put(
  "/label/lmt/:nolmt",
  requirePermission("label_lmt:read"),
  ctrl.updateLabel,
);

// DELETE /api/label/lmt/:nolmt -> delete label
router.delete(
  "/label/lmt/:nolmt",
  requirePermission("label_lmt:read"),
  ctrl.deleteLabel,
);

// GET /api/label/lmt/:nolmt/pdf -> PDF label
router.get(
  "/label/lmt/:nolmt/pdf",
  requirePermission("label_lmt:read"),
  ctrl.generatePdf,
);

// GET /api/label/lmt/:nolmt -> raw label data
router.get(
  "/label/lmt/:nolmt",
  requirePermission("label_lmt:read"),
  ctrl.getLabelData,
);

module.exports = router;
