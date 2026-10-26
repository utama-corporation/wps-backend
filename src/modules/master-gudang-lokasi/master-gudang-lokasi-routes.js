const express = require("express");
const router = express.Router();
const verifyToken = require("../../core/middleware/verify-token");
const attachPermissions = require("../../core/middleware/attach-permissions");
const requirePermission = require("../../core/middleware/require-permission");
const ctrl = require("./master-gudang-lokasi-controller");

router.use(express.json());
router.use(verifyToken, attachPermissions);

/* Permission: datamaster_<master>:create | read | update | delete (lihat permissions.sql) */
const PERM = {
  warehouse: "datamaster_warehouse",
  lokasi: "datamaster_lokasi",
  "source-location": "datamaster_sourcelocation",
  "other-factory": "datamaster_otherfactory",
  "surat-tanah": "datamaster_surattanah",
};
const MAPPING = "datamaster_mappingidlokasi";

/* Mapping ID Lokasi didaftarkan lebih dulu agar tidak tertangkap route :master */
router.get("/mapping-id-lokasi", requirePermission(`${MAPPING}:read`), ctrl.mappingList);
router.get("/mapping-id-lokasi/lookups", requirePermission(`${MAPPING}:read`), ctrl.mappingLookups);
router.post("/mapping-id-lokasi", requirePermission(`${MAPPING}:create`), ctrl.mappingCreate);
router.put("/mapping-id-lokasi/:IdBagian/:IdJenisKayu/:IdGrade", requirePermission(`${MAPPING}:update`), ctrl.mappingUpdate);
router.delete("/mapping-id-lokasi/:IdBagian/:IdJenisKayu/:IdGrade", requirePermission(`${MAPPING}:delete`), ctrl.mappingRemove);

for (const [master, perm] of Object.entries(PERM)) {
  router.get(`/${master}`, requirePermission(`${perm}:read`), (req, _res, next) => {
    req.params.master = master;
    next();
  }, ctrl.list);
  router.post(`/${master}`, requirePermission(`${perm}:create`), (req, _res, next) => {
    req.params.master = master;
    next();
  }, ctrl.create);
  router.put(`/${master}/:id`, requirePermission(`${perm}:update`), (req, _res, next) => {
    req.params.master = master;
    next();
  }, ctrl.update);
  router.delete(`/${master}/:id`, requirePermission(`${perm}:delete`), (req, _res, next) => {
    req.params.master = master;
    next();
  }, ctrl.remove);
}

module.exports = router;
