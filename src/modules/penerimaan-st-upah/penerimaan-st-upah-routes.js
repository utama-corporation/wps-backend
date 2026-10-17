const express = require("express");
const router = express.Router();
const verifyToken = require("../../core/middleware/verify-token");
const attachPermissions = require("../../core/middleware/attach-permissions");
const requirePermission = require("../../core/middleware/require-permission");
const ctrl = require("./penerimaan-st-upah-controller");

router.use(express.json());

// Permission memakai label_st:* (menu Sawn Timber satu grup dengan Label ST)
const BASE = "/penerimaan-st-upah";
const auth = [verifyToken, attachPermissions];

router.get(BASE, ...auth, requirePermission("label_st:read"), ctrl.getAll);
router.get(`${BASE}/masters`, ...auth, requirePermission("label_st:read"), ctrl.getMasters);
router.get(`${BASE}/:no/labels`, ...auth, requirePermission("label_st:read"), ctrl.getLabels);
router.get(`${BASE}/:no`, ...auth, requirePermission("label_st:read"), ctrl.getByNo);
router.post(BASE, ...auth, requirePermission("label_st:create"), ctrl.create);
router.put(`${BASE}/:no`, ...auth, requirePermission("label_st:update"), ctrl.update);
router.delete(`${BASE}/:no`, ...auth, requirePermission("label_st:delete"), ctrl.remove);

module.exports = router;
