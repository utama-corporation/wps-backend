const express = require("express");
const router = express.Router();
const verifyToken = require("../../../core/middleware/verify-token");
const attachPermissions = require("../../../core/middleware/attach-permissions");
const requirePermission = require("../../../core/middleware/require-permission");
const ctrl = require("./label-fj-controller");

router.use(express.json());
router.use(verifyToken, attachPermissions);

// GET /api/label/fj/list -> list semua label FJ
router.get(
  "/label/fj/list",
  requirePermission("label_fj:read"),
  ctrl.getAllLabels,
);

// GET /api/label/fj/detail/:nofj -> detail by NoFJ
router.get(
  "/label/fj/detail/:nofj",
  requirePermission("label_fj:read"),
  ctrl.getDetailByNo,
);

// GET /api/label/fj/:nofj/pdf -> PDF label
router.get(
  "/label/fj/:nofj/pdf",
  requirePermission("label_fj:read"),
  ctrl.generatePdf,
);

// GET /api/label/fj/:nofj/edit -> header data with IDs for editing
router.get(
  "/label/fj/:nofj/edit",
  requirePermission("label_fj:read"),
  ctrl.getHeaderForEdit,
);

// GET /api/label/fj/:nofj -> data mentah label
router.get(
  "/label/fj/:nofj",
  requirePermission("label_fj:read"),
  ctrl.getLabelData,
);

// PUT /api/label/fj/:nofj -> update label
router.put(
  "/label/fj/:nofj",
  requirePermission("label_fj:read"),
  ctrl.updateLabel,
);

// DELETE /api/label/fj/:nofj -> delete label
router.delete(
  "/label/fj/:nofj",
  requirePermission("label_fj:read"),
  ctrl.deleteLabel,
);

module.exports = router;
