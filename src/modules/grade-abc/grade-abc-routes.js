const express = require("express");
const router = express.Router();
const verifyToken = require("../../core/middleware/verify-token");
const attachPermissions = require("../../core/middleware/attach-permissions");
const requirePermission = require("../../core/middleware/require-permission");
const ctrl = require("./grade-abc-controller");

router.use(express.json());
router.use(verifyToken, attachPermissions);

router.get("/grade-abc/master", requirePermission("grade_abc:read"), ctrl.getMaster);
router.get("/grade-abc/list", requirePermission("grade_abc:read"), ctrl.getAll);
router.get("/grade-abc/:no/detail", requirePermission("grade_abc:read"), ctrl.getDetail);
router.post("/grade-abc", requirePermission("grade_abc:create"), ctrl.create);
router.put("/grade-abc/:no", requirePermission("grade_abc:update"), ctrl.update);
router.delete("/grade-abc/:no", requirePermission("grade_abc:delete"), ctrl.remove);
router.post("/grade-abc/:no/detail", requirePermission("grade_abc:create"), ctrl.addDetail);
router.put("/grade-abc/:no/detail/:id", requirePermission("grade_abc:update"), ctrl.updateDetail);
router.delete("/grade-abc/:no/detail/:id", requirePermission("grade_abc:delete"), ctrl.deleteDetail);

module.exports = router;
