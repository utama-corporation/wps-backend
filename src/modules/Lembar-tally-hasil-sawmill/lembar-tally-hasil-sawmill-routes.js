const express = require("express");
const verifyToken = require("../../core/middleware/verify-token");
const attachPermissions = require("../../core/middleware/attach-permissions");
const requirePermission = require("../../core/middleware/require-permission");
const lembarTallyHasilSawmillController = require("./lembar-tally-hasil-sawmill-controller");

const router = express.Router();
router.use(express.json());
router.use(verifyToken, attachPermissions);

const READ = requirePermission("lembar_tally_sawmill:read");
const CREATE = requirePermission("lembar_tally_sawmill:create");
const UPDATE = requirePermission("lembar_tally_sawmill:update");
const DELETE = requirePermission("lembar_tally_sawmill:delete");

router.get("/masters", READ, lembarTallyHasilSawmillController.getMasters);
router.get("/meja", READ, lembarTallyHasilSawmillController.getMeja);
router.get("/riwayat", READ, lembarTallyHasilSawmillController.getRiwayat);
router.get("/laporan", READ, lembarTallyHasilSawmillController.getLaporan);
router.get("/kayu-bulat", READ, lembarTallyHasilSawmillController.getKayuBulat);
router.get("/operator-meja", READ, lembarTallyHasilSawmillController.getOperatorMeja);
router.get("/produk-spk", READ, lembarTallyHasilSawmillController.getProdukSPK);
router.get("/spk-by-tebal-lebar", READ, lembarTallyHasilSawmillController.getSpkByTebalLebar);
router.put("/header", UPDATE, lembarTallyHasilSawmillController.updateHeader);
router.post("/selesai", UPDATE, lembarTallyHasilSawmillController.selesai);
router.get("/header", READ, lembarTallyHasilSawmillController.getByNo);
router.get("/", READ, lembarTallyHasilSawmillController.getAll);
router.post("/", CREATE, lembarTallyHasilSawmillController.create);
router.put("/", UPDATE, lembarTallyHasilSawmillController.update);
router.delete("/", DELETE, lembarTallyHasilSawmillController.remove);

module.exports = router;
