const svc = require("./master-other-supplier-service");

const fail = (res, err) => res.status(err.status || 500).json({ success: false, message: err.message });

/* GET /api/master/other-supplier */
exports.getAll = async (_req, res) => {
  try {
    res.json({ success: true, data: await svc.getAll() });
  } catch (err) {
    fail(res, err);
  }
};

/* POST /api/master/other-supplier */
exports.create = async (req, res) => {
  try {
    const data = await svc.create(req.body || {}, req.username);
    res.json({ success: true, data, message: "Data master other supplier berhasil disimpan" });
  } catch (err) {
    fail(res, err);
  }
};

/* PUT /api/master/other-supplier/:id */
exports.update = async (req, res) => {
  try {
    const data = await svc.update(req.params.id, req.body || {}, req.username);
    res.json({ success: true, data, message: "Data master other supplier berhasil diubah" });
  } catch (err) {
    fail(res, err);
  }
};

/* DELETE /api/master/other-supplier/:id */
exports.remove = async (req, res) => {
  try {
    const data = await svc.remove(req.params.id, req.username);
    res.json({ success: true, data, message: "Data master other supplier berhasil dihapus" });
  } catch (err) {
    fail(res, err);
  }
};
