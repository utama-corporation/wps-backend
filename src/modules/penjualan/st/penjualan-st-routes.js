const express = require("express");
const router = express.Router();
const verifyToken = require("../../../core/middleware/verify-token");
const attachPermissions = require("../../../core/middleware/attach-permissions");
const requirePermission = require("../../../core/middleware/require-permission");
const ctrl = require("./penjualan-st-controller");

router.use(express.json());
router.use(verifyToken, attachPermissions);

router.get("/penjualan/st/list", requirePermission("penjualan_st_snd:read"), ctrl.getAll);
router.get("/penjualan/st/masters", requirePermission("penjualan_st_snd:read"), ctrl.getMasters);
router.get("/penjualan/st/label-info", requirePermission("penjualan_st_snd:read"), ctrl.getLabelInfo);
router.get("/penjualan/st/:noJual/pdf", requirePermission("penjualan_st_snd:read"), ctrl.pdf);
router.get("/penjualan/st/detail/:noJual", requirePermission("penjualan_st_snd:read"), ctrl.getDetail);
router.get("/penjualan/st/scan-ready/:noJual", requirePermission("penjualan_st_snd:read"), ctrl.scanReady);
router.post("/penjualan/st/lookup", requirePermission("penjualan_st_snd:read"), ctrl.lookup);
router.post("/penjualan/st", requirePermission("penjualan_st_snd:create"), ctrl.create);
router.put("/penjualan/st/:noJual", requirePermission("penjualan_st_snd:update"), ctrl.update);
router.post("/penjualan/st/:noJual/save", requirePermission("penjualan_st_snd:update"), ctrl.saveDetail);
router.delete("/penjualan/st/:noJual/label", requirePermission("penjualan_st_snd:delete"), ctrl.deleteLabel);

module.exports = router;
