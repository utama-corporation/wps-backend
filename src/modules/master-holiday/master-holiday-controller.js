const svc = require("./master-holiday-service");

const fail = (res, err) => res.status(err.status || 500).json({ success: false, message: err.message });

/* GET /api/master/holiday?tahun=2026 */
exports.getAll = async (req, res) => {
  try {
    res.json({ success: true, data: await svc.getAll(req.query.tahun) });
  } catch (err) {
    fail(res, err);
  }
};

/* POST /api/master/holiday */
exports.create = async (req, res) => {
  try {
    const data = await svc.create(req.body || {}, req.username);
    res.json({ success: true, data, message: "Holiday berhasil disimpan" });
  } catch (err) {
    fail(res, err);
  }
};

/* PUT /api/master/holiday/:tgl (YYYY-MM-DD) */
exports.update = async (req, res) => {
  try {
    const data = await svc.update(req.params.tgl, req.body || {}, req.username);
    res.json({ success: true, data, message: "Holiday berhasil diubah" });
  } catch (err) {
    fail(res, err);
  }
};

/* DELETE /api/master/holiday/:tgl (YYYY-MM-DD) */
exports.remove = async (req, res) => {
  try {
    const data = await svc.remove(req.params.tgl, req.username);
    res.json({ success: true, data, message: "Holiday berhasil dihapus" });
  } catch (err) {
    fail(res, err);
  }
};
