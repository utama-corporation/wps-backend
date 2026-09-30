const express = require("express");
const router = express.Router();
const verifyToken = require("../../../core/middleware/verify-token");
const attachPermissions = require("../../../core/middleware/attach-permissions");
const requirePermission = require("../../../core/middleware/require-permission");
const ctrl = require("./label-bj-controller");

router.use(express.json());
router.use(verifyToken, attachPermissions);

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
  requirePermission("label_bj:read"),
  ctrl.updateLabel,
);

// DELETE /api/label/bj/:nobj -> delete label
router.delete(
  "/label/bj/:nobj",
  requirePermission("label_bj:read"),
  ctrl.deleteLabel,
);

module.exports = router;
