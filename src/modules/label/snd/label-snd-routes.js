const express = require("express");
const router = express.Router();
const verifyToken = require("../../../core/middleware/verify-token");
const attachPermissions = require("../../../core/middleware/attach-permissions");
const requirePermission = require("../../../core/middleware/require-permission");
const ctrl = require("./label-snd-controller");

router.use(express.json());
router.use(verifyToken, attachPermissions);

// GET /api/label/snd/list -> list semua label
router.get(
  "/label/snd/list",
  requirePermission("label_snd:read"),
  ctrl.getAllLabels,
);

// GET /api/label/snd/detail/:nosnd -> detail by no
router.get(
  "/label/snd/detail/:nosnd",
  requirePermission("label_snd:read"),
  ctrl.getDetailByNo,
);

// GET /api/label/snd/:nosnd/edit -> header data with IDs for editing
router.get(
  "/label/snd/:nosnd/edit",
  requirePermission("label_snd:read"),
  ctrl.getHeaderForEdit,
);

// GET /api/label/snd/:nosnd/pdf -> PDF label
router.get(
  "/label/snd/:nosnd/pdf",
  requirePermission("label_snd:read"),
  ctrl.generatePdf,
);

// GET /api/label/snd/:nosnd -> data mentah label
router.get(
  "/label/snd/:nosnd",
  requirePermission("label_snd:read"),
  ctrl.getLabelData,
);

// PUT /api/label/snd/:nosnd -> update label
router.put(
  "/label/snd/:nosnd",
  requirePermission("label_snd:read"),
  ctrl.updateLabel,
);

// DELETE /api/label/snd/:nosnd -> delete label
router.delete(
  "/label/snd/:nosnd",
  requirePermission("label_snd:read"),
  ctrl.deleteLabel,
);

module.exports = router;
