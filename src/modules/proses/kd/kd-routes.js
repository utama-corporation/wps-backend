const express = require("express");
const verifyToken = require("../../../core/middleware/verify-token");
const kdController = require("./kd-controller");

const router = express.Router();
router.use(express.json());

router.get("/rooms", verifyToken, kdController.getRooms);
router.get("/masters", verifyToken, kdController.getMasters);
router.get("/cari-st", verifyToken, kdController.cariST);
router.get("/header", verifyToken, kdController.getHeader);
router.get("/detail", verifyToken, kdController.getDetail);
router.put("/start", verifyToken, kdController.startRoom);
router.put("/stop", verifyToken, kdController.stopRoom);
router.post("/header", verifyToken, kdController.createHeader);
router.put("/header", verifyToken, kdController.updateHeader);
router.delete("/header", verifyToken, kdController.deleteHeader);
router.post("/detail", verifyToken, kdController.addDetail);
router.delete("/detail", verifyToken, kdController.removeDetail);
router.get("/history", verifyToken, kdController.getHistory);

module.exports = router;
