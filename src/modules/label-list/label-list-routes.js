const express = require("express");
const verifyToken = require("../../core/middleware/verify-token");
const attachPermissions = require("../../core/middleware/attach-permissions");
const requirePermission = require("../../core/middleware/require-permission");
const ctrl = require("./label-list-controller");

const router = express.Router();

router.use(verifyToken, attachPermissions, requirePermission("label_list:read"));

// GET /api/label-explorer?tipe[]=&jenis[]=&grade[]=&lokasi[]=&tebal[]=&lebar[]=&panjang[]=&noLabel=&page=&pageSize=
// -> hanya label yang belum dipakai (DateUsage IS NULL)
router.get("/", ctrl.list);
router.get("/options", ctrl.options);

router.get("/templates", ctrl.listTemplates);
router.post("/templates", ctrl.createTemplate);
router.put("/templates/:id", ctrl.updateTemplate);
router.delete("/templates/:id", ctrl.removeTemplate);

module.exports = router;
