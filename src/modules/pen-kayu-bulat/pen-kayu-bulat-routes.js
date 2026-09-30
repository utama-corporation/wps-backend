const express = require("express");
const verifyToken = require("../../core/middleware/verify-token");
const penKayuBulatController = require("./pen-kayu-bulat-controller");

const router = express.Router();
router.use(express.json());

router.get("/next-no", verifyToken, penKayuBulatController.getNextNo);
router.get("/masters", verifyToken, penKayuBulatController.getMasters);
router.get("/header", verifyToken, penKayuBulatController.getHeader);
router.get("/detail", verifyToken, penKayuBulatController.getDetail);
router.get("/", verifyToken, penKayuBulatController.getAll);
router.post("/", verifyToken, penKayuBulatController.create);
router.put("/", verifyToken, penKayuBulatController.update);
router.delete("/", verifyToken, penKayuBulatController.remove);

module.exports = router;
