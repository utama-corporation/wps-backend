const express = require("express");
const router = express.Router();
const verifyToken = require("../../core/middleware/verify-token");
const attachPermissions = require("../../core/middleware/attach-permissions");
const requirePermission = require("../../core/middleware/require-permission");
const ctrl = require("./po-supplier-st-controller");

router.use(express.json());

const BASE = "/po-supplier-st";
const guard = (action) => [verifyToken, attachPermissions, requirePermission(`po_supplier_st:${action}`)];

router.get(BASE, guard("read"), ctrl.getAll);
router.get(`${BASE}/masters`, guard("read"), ctrl.getMasters);
router.get(`${BASE}/:no`, guard("read"), ctrl.getByNo);
router.post(BASE, guard("create"), ctrl.create);
router.put(`${BASE}/:no/close`, guard("close"), ctrl.close);
router.put(`${BASE}/:no/reopen`, guard("close"), ctrl.reopen);
router.put(`${BASE}/:no`, guard("update"), ctrl.update);
router.delete(`${BASE}/:no`, guard("delete"), ctrl.remove);

module.exports = router;
