const svc = require("./master-grade-kb-service");

const fail = (res, err) => res.status(err.status || 500).json({ success: false, message: err.message });

/* GET /api/master/grade-kb */
exports.getAll = async (_req, res) => {
  try {
    res.json({ success: true, data: await svc.getAll() });
  } catch (err) {
    fail(res, err);
  }
};

/* POST /api/master/grade-kb */
exports.create = async (req, res) => {
  try {
    const data = await svc.create(req.body || {}, req.username);
    res.json({ success: true, data, message: "Data master grade berhasil disimpan" });
  } catch (err) {
    fail(res, err);
  }
};

/* PUT /api/master/grade-kb/:id */
exports.update = async (req, res) => {
  try {
    const data = await svc.update(req.params.id, req.body || {}, req.username);
    res.json({ success: true, data, message: "Data master grade berhasil diubah" });
  } catch (err) {
    fail(res, err);
  }
};

/* DELETE /api/master/grade-kb/:id */
exports.remove = async (req, res) => {
  try {
    const data = await svc.remove(req.params.id, req.username);
    res.json({ success: true, data, message: "Data master grade berhasil dihapus" });
  } catch (err) {
    fail(res, err);
  }
};
