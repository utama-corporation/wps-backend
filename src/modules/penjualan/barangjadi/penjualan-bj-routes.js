const express = require("express");
const router = express.Router();
const verifyToken = require("../../../core/middleware/verify-token");
const attachPermissions = require("../../../core/middleware/attach-permissions");
const ctrl = require("./penjualan-bj-controller");

router.use(express.json());
router.use(verifyToken, attachPermissions);

router.get("/penjualan/bj/list",           ctrl.getAll);
router.get("/penjualan/bj/detail/:noBJJual", ctrl.getDetail);
router.get("/penjualan/bj/generate-no",    ctrl.generateNo);
router.get("/penjualan/bj/spk-list",       ctrl.getSpkList);
router.get("/penjualan/bj/lookup-bj/:noBJ", ctrl.lookupBJ);
router.post("/penjualan/bj/scan",          ctrl.scanBJ);
router.post("/penjualan/bj",               ctrl.createBJJual);
router.put("/penjualan/bj/:noBJJual",      ctrl.updateBJJual);
router.delete("/penjualan/bj/:noBJJual",   ctrl.deleteBJJual);

module.exports = router;
