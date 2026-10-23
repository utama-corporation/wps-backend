const express = require("express");
const router = express.Router();
const verifyToken = require("../../core/middleware/verify-token");
const attachPermissions = require("../../core/middleware/attach-permissions");
const requirePermission = require("../../core/middleware/require-permission");
const ctrl = require("./cari-koordinat-controller");

router.use(express.json());
router.use(verifyToken, attachPermissions);

/* Permission (NoPermission di MstUserGroupPermission):
 *   cari_koordinat:read    -> melihat daftar tanah, pemilik, dan persentase
 *   cari_koordinat:export  -> mengunduh CSV / GeoJSON  (lihat permissions.sql) */
router.get("/spk", requirePermission("cari_koordinat:read"), ctrl.getSpkList);
router.get("/", requirePermission("cari_koordinat:read"), ctrl.getTanah);
router.get("/pemilik", requirePermission("cari_koordinat:read"), ctrl.getPemilik);
router.get("/persentase", requirePermission("cari_koordinat:read"), ctrl.getPersentase);
router.get("/export/csv", requirePermission("cari_koordinat:export"), ctrl.exportCsv);
router.post("/export/geojson", requirePermission("cari_koordinat:export"), ctrl.exportGeoJson);

module.exports = router;
