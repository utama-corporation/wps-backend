const express = require('express');
const router = express.Router();
const verifyToken = require('../../core/middleware/verify-token');
const attachPermissions = require('../../core/middleware/attach-permissions');
const requirePermission = require('../../core/middleware/require-permission');
const ctrl = require('./stock-opname-web-controller');

router.use(express.json());
router.use(verifyToken, attachPermissions);

/* Permission: stock_opname:read | create | update | delete (lihat permissions.sql) */
router.post('/', requirePermission('stock_opname:create'), ctrl.create);
router.get('/meta-ascend', requirePermission('stock_opname:read'), ctrl.ascendMeta);
router.get('/family', requirePermission('stock_opname:read'), ctrl.ascendFamilyByCategory);
router.get('/headers', requirePermission('stock_opname:read'), ctrl.headers);
router.get('/lokasi', requirePermission('stock_opname:read'), ctrl.lokasi);
router.get('/:noso/laporan', requirePermission('stock_opname:read'), ctrl.laporanKayu);
router.get('/:noso/laporan-ascend', requirePermission('stock_opname:read'), ctrl.laporanAscend);
router.get('/:noso/crystal/:key', requirePermission('stock_opname:read'), ctrl.crystalPdf);
router.get('/:noso/summary', requirePermission('stock_opname:read'), ctrl.summary);
router.get('/:noso/users', requirePermission('stock_opname:read'), ctrl.users);
router.get('/:noso/stok', requirePermission('stock_opname:read'), ctrl.stok);
router.get('/:noso/hasil', requirePermission('stock_opname:read'), ctrl.hasil);
router.delete('/:noso/hasil', requirePermission('stock_opname:delete'), ctrl.removeHasil);

router.get('/:noso/ascend/families', requirePermission('stock_opname:read'), ctrl.ascendFamilies);
router.get('/:noso/ascend/items', requirePermission('stock_opname:read'), ctrl.ascendItems);
router.get('/:noso/ascend/usage', requirePermission('stock_opname:read'), ctrl.ascendUsage);
router.put('/:noso/ascend/hasil', requirePermission('stock_opname:update'), ctrl.ascendSave);
router.delete('/:noso/ascend/hasil', requirePermission('stock_opname:delete'), ctrl.ascendRemove);

module.exports = router;
