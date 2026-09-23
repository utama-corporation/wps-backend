// routes/qc-spk-barang-jadi/qc-spk-barang-jadi-routes.js
const express = require('express');
const router = express.Router();

const verifyToken = require('../../core/middleware/verify-token');
const attachPermissions = require('../../core/middleware/attach-permissions');
const requirePermission = require('../../core/middleware/require-permission');
const ctrl = require('./qc-spk-barang-jadi-controller');
const { uploadBundlePhotos, processBundlePhotos } = require('./qc-spk-bj-upload');

router.use(express.json());
router.use(verifyToken, attachPermissions);

// ------ Daftar SPK ------
router.get('/', requirePermission('spk:read'), ctrl.getSpkHeaders);

// ------ Baris detail SPK + progress QC ------
router.get('/:noSPK/lines', requirePermission('spk:read'), ctrl.getSpkLines);

// ------ Bundle QC per baris SPK ------
router.get('/:noSPK/lines/:lineNo/bundles', requirePermission('spk:read'), ctrl.getBundles);
router.post('/:noSPK/lines/:lineNo/bundles', requirePermission('spk:create'), ctrl.saveBundles);
router.put(
  '/:noSPK/lines/:lineNo/bundles/:noBundle',
  requirePermission('spk:create'),
  uploadBundlePhotos,
  processBundlePhotos,
  ctrl.saveOneBundle
);
router.delete('/:noSPK/lines/:lineNo/bundles/:noBundle/photos/:field', requirePermission('spk:delete'), ctrl.deleteOnePhoto);
router.delete('/:noSPK/lines/:lineNo/bundles', requirePermission('spk:delete'), ctrl.deleteBundles);
router.delete('/:noSPK/lines/:lineNo/bundles/:noBundle', requirePermission('spk:delete'), ctrl.deleteOneBundle);

module.exports = router;
