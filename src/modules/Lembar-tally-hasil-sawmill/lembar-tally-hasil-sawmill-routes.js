const express = require("express");
const verifyToken = require("../../core/middleware/verify-token");
const lembarTallyHasilSawmillController = require("./lembar-tally-hasil-sawmill-controller");

const router = express.Router();
router.use(express.json());

router.get("/masters", verifyToken, lembarTallyHasilSawmillController.getMasters);
router.get("/kayu-bulat", verifyToken, lembarTallyHasilSawmillController.getKayuBulat);
router.get("/operator-meja", verifyToken, lembarTallyHasilSawmillController.getOperatorMeja);
router.get("/produk-spk", verifyToken, lembarTallyHasilSawmillController.getProdukSPK);
router.get("/spk-by-tebal-lebar", verifyToken, lembarTallyHasilSawmillController.getSpkByTebalLebar);
router.put("/header", verifyToken, lembarTallyHasilSawmillController.updateHeader);
router.post("/selesai", verifyToken, lembarTallyHasilSawmillController.selesai);
router.get("/header", verifyToken, lembarTallyHasilSawmillController.getByNo);
router.get("/", verifyToken, lembarTallyHasilSawmillController.getAll);
router.post("/", verifyToken, lembarTallyHasilSawmillController.create);
router.put("/", verifyToken, lembarTallyHasilSawmillController.update);
router.delete("/", verifyToken, lembarTallyHasilSawmillController.remove);

module.exports = router;