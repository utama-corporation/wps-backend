const express = require("express");
const router = express.Router();
const verifyToken = require("../../core/middleware/verify-token");
const attachPermissions = require("../../core/middleware/attach-permissions");
const requirePermission = require("../../core/middleware/require-permission");
const ctrl = require("./bongkar-susun-controller");

router.use(express.json());
router.use(verifyToken, attachPermissions);

router.get("/bongkar-susun/list", requirePermission("bongkar_susun:read"), ctrl.getAll);
router.get("/bongkar-susun/label-info", requirePermission("bongkar_susun:read"), ctrl.getLabelInfo);
router.get("/bongkar-susun/detail/:no", requirePermission("bongkar_susun:read"), ctrl.getDetail);
router.get("/bongkar-susun/scan-ready/:no", requirePermission("bongkar_susun:read"), ctrl.scanReady);
router.get("/bongkar-susun/:no/history", requirePermission("bongkar_susun:read"), ctrl.getHistory);
router.post("/bongkar-susun/lookup", requirePermission("bongkar_susun:read"), ctrl.lookup);
router.post("/bongkar-susun", requirePermission("bongkar_susun:create"), ctrl.create);
router.put("/bongkar-susun/:no", requirePermission("bongkar_susun:update"), ctrl.update);
router.post("/bongkar-susun/:no/save", requirePermission("bongkar_susun:update"), ctrl.saveDetail);
router.delete("/bongkar-susun/:no/label", requirePermission("bongkar_susun:delete"), ctrl.deleteLabel);

module.exports = router;
