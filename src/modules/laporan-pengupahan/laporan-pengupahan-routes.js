const express = require("express");
const verifyToken = require("../../core/middleware/verify-token");
const attachPermissions = require("../../core/middleware/attach-permissions");
const ctrl = require("./laporan-pengupahan-controller");

const router = express.Router();
router.use(verifyToken, attachPermissions);

/* laporan:read (semua laporan) atau laporan:st:read (kategori Sawn Timber). */
router.use((req, res, next) => {
  const p = req.userPermissions;
  if (!p) {
    return res.status(500).json({ success: false, message: 'Permissions not attached' });
  }
  if (p.has('*') || p.has('laporan:read') || p.has('laporan:st:read')) return next();
  return res.status(403).json({
    success: false,
    message: 'Forbidden: insufficient permission',
    required: ['laporan:read', 'laporan:st:read'],
  });
});

router.get("/pdf", ctrl.pdf);
router.get("/", ctrl.index);

module.exports = router;
