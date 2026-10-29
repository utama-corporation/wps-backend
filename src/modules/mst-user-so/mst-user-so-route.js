const express = require('express');
const router = express.Router();
const verifyToken = require('../../core/middleware/verify-token');
const attachPermissions = require('../../core/middleware/attach-permissions');
const requirePermission = require('../../core/middleware/require-permission');
const ctrl = require('./mst-user-so-controller');

router.use(verifyToken, attachPermissions);
router.get('/', requirePermission('tambahakunso:read'), ctrl.list);
router.get('/employees', requirePermission('tambahakunso:create'), ctrl.getEmployees);
router.post('/', requirePermission('tambahakunso:create'), ctrl.create);
router.put('/', requirePermission('tambahakunso:update'), ctrl.update);
router.delete('/', requirePermission('tambahakunso:delete'), ctrl.remove);

module.exports = router;
