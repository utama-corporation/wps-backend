const express = require("express");
const router = express.Router();
const verifyToken = require("../../core/middleware/verify-token");
const attachPermissions = require("../../core/middleware/attach-permissions");
const requirePermission = require("../../core/middleware/require-permission");
const ctrl = require("./penerimaan-st-pembelian-controller");

router.use(express.json());

// Permission memakai label_st:* (menu Sawn Timber satu grup dengan Label ST)
const BASE = "/penerimaan-st-pembelian";

router.get(BASE, verifyToken, attachPermissions, requirePermission("label_st:read"), ctrl.getAll);
router.get(`${BASE}/masters`, verifyToken, attachPermissions, requirePermission("label_st:read"), ctrl.getMasters);
router.get(`${BASE}/:no/labels`, verifyToken, attachPermissions, requirePermission("label_st:read"), ctrl.getLabels);
router.get(`${BASE}/:no/reject`, verifyToken, attachPermissions, requirePermission("label_st:read"), ctrl.getRejects);
router.get(`${BASE}/:no/pdf`, verifyToken, attachPermissions, requirePermission("label_st:read"), ctrl.generatePdf);
router.get(`${BASE}/:no`, verifyToken, attachPermissions, requirePermission("label_st:read"), ctrl.getByNo);
router.post(BASE, verifyToken, attachPermissions, requirePermission("label_st:create"), ctrl.create);
router.post(`${BASE}/:no/reject`, verifyToken, attachPermissions, requirePermission("label_st:create"), ctrl.addReject);
router.put(`${BASE}/:no`, verifyToken, attachPermissions, requirePermission("label_st:update"), ctrl.update);
router.delete(`${BASE}/:no`, verifyToken, attachPermissions, requirePermission("label_st:delete"), ctrl.remove);

module.exports = router;
