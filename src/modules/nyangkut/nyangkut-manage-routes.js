const express = require("express");
const router = express.Router();
const verifyToken = require("../../core/middleware/verify-token");
const attachPermissions = require("../../core/middleware/attach-permissions");
const requirePermission = require("../../core/middleware/require-permission");
const ctrl = require("./nyangkut-controller");

router.use(express.json());
router.use(verifyToken, attachPermissions);

router.get("/nyangkut/list", requirePermission("nyangkut:read"), ctrl.getAll);
router.get("/nyangkut/label-info", requirePermission("nyangkut:read"), ctrl.getLabelInfo);
router.get("/nyangkut/detail/:no", requirePermission("nyangkut:read"), ctrl.getDetail);
router.get("/nyangkut/scan-ready/:no", requirePermission("nyangkut:read"), ctrl.scanReady);
router.post("/nyangkut/lookup", requirePermission("nyangkut:read"), ctrl.lookup);
router.post("/nyangkut", requirePermission("nyangkut:create"), ctrl.create);
router.put("/nyangkut/:no", requirePermission("nyangkut:update"), ctrl.update);
router.delete("/nyangkut/:no", requirePermission("nyangkut:delete"), ctrl.remove);
router.post("/nyangkut/:no/save", requirePermission("nyangkut:update"), ctrl.saveDetail);
router.delete("/nyangkut/:no/label", requirePermission("nyangkut:delete"), ctrl.deleteLabel);

module.exports = router;
