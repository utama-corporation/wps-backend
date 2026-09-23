const express = require("express");
const router = express.Router();
const verifyToken = require("../../../core/middleware/verify-token");
const attachPermissions = require("../../../core/middleware/attach-permissions");
const requirePermission = require("../../../core/middleware/require-permission");
const ctrl = require("./label-st-controller");

router.use(express.json());
router.use(verifyToken, attachPermissions);

// GET /api/label/st/list -> list semua label ST
router.get(
  "/label/st/list",
  requirePermission("label_st:read"),
  ctrl.getAllLabels,
);

// GET /api/label/st/generate-no -> auto-generate NoST
router.get(
  "/label/st/generate-no",
  requirePermission("label_st:read"),
  ctrl.generateNoST,
);

// GET /api/label/st/masters -> all combo data
router.get(
  "/label/st/masters",
  requirePermission("label_st:read"),
  ctrl.getMasters,
);

// GET /api/label/st/lookup-nokb/:nokb -> lookup from KayuBulat_h
router.get(
  "/label/st/lookup-nokb/:nokb",
  requirePermission("label_st:read"),
  ctrl.lookupNoKB,
);

// GET /api/label/st/detail/:nost -> detail by no ST
router.get(
  "/label/st/detail/:nost",
  requirePermission("label_st:read"),
  ctrl.getDetailByNo,
);

// GET /api/label/st/:nost/edit -> header data with IDs for editing ada test datagit status

router.get(
  "/label/st/:nost/edit",
  requirePermission("label_st:read"),
  ctrl.getHeaderForEdit,
);

// GET /api/label/st/:nost -> data mentah label
router.get(
  "/label/st/:nost",
  requirePermission("label_st:read"),
  ctrl.getLabelData,
);

// PUT /api/label/st/:nost -> update label
router.put(
  "/label/st/:nost",
  requirePermission("label_st:read"),
  ctrl.updateLabel,
);

// DELETE /api/label/st/:nost -> delete label
router.delete(
  "/label/st/:nost",
  requirePermission("label_st:read"),
  ctrl.deleteLabel,
);

// POST /api/label/st -> create new label ST
router.post(
  "/label/st",
  requirePermission("label_st:read"),
  ctrl.createLabel,
);

module.exports = router;
