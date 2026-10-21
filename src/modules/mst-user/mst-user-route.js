const express = require('express');
const router = express.Router();

const verifyToken = require('../../core/middleware/verify-token');
const attachPermissions = require('../../core/middleware/attach-permissions');
const requirePermission = require('../../core/middleware/require-permission');
const ctrl = require('./mst-user-controller');

router.get(
  '/',
  verifyToken,
  attachPermissions,
  requirePermission('tambahakun:read'),
  ctrl.list,
);
router.get(
  '/groups',
  verifyToken,
  attachPermissions,
  requirePermission('tambahakun:read'),
  ctrl.getGroups,
);
router.get(
  '/employees',
  verifyToken,
  attachPermissions,
  requirePermission('tambahakun:read'),
  ctrl.getEmployees,
);
router.get(
  '/:idUsername/group',
  verifyToken,
  attachPermissions,
  requirePermission('tambahakun:read'),
  ctrl.getUserGroups,
);
router.post(
  '/',
  verifyToken,
  attachPermissions,
  requirePermission('tambahakun:create'),
  ctrl.create,
);
router.put(
  '/',
  verifyToken,
  attachPermissions,
  requirePermission('tambahakun:update'),
  ctrl.update,
);
router.delete(
  '/',
  verifyToken,
  attachPermissions,
  requirePermission('tambahakun:delete'),
  ctrl.remove,
);

module.exports = router;
