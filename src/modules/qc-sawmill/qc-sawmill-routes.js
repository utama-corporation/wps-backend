// routes/qc-sawmill/qc-sawmill-routes.js
const express = require('express');
const router = express.Router();

const verifyToken = require('../../core/middleware/verify-token');
const attachPermissions = require('../../core/middleware/attach-permissions');
const requirePermission = require('../../core/middleware/require-permission');
const ctrl = require('./qc-sawmill-controller');

// middleware global untuk router ini
router.use(express.json());
router.use(verifyToken, attachPermissions);

// ------ Header (collection) ------
router.get(
  '/',
  requirePermission('qc_sawmill:read'),
  ctrl.getHeader
);

// ------ Masters ------
router.get(
  '/masters',
  verifyToken,
  ctrl.getMasters
);

router.post(
  '/',
  requirePermission('qc_sawmill:create'),
  ctrl.createHeader
);

// ------ Header (single) ------
router.put(
  '/:noqc',
  requirePermission('qc_sawmill:update'),
  ctrl.updateHeaderByNoQc
);

router.delete(
  '/:noqc',
  requirePermission('qc_sawmill:delete'),
  ctrl.deleteByNoQc // hapus header + semua details
);

// ------ Details (by NoQc) ------
router.get(
  '/:noqc/details',
  requirePermission('qc_sawmill:read'),
  ctrl.getDetailsByNoQc
);

router.post(
  '/:noqc/details',
  requirePermission('qc_sawmill:create'),
  ctrl.createDetailsByNoQc // insert (append) atau replace sesuai body.overwrite
);

router.delete(
  '/:noqc/details',
  requirePermission('qc_sawmill:delete'),
  ctrl.deleteDetailsByNoQc // hapus semua detail
);



module.exports = router;
