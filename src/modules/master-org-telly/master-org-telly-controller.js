const svc = require("./master-org-telly-service");

const fail = (res, err) => res.status(err.status || 500).json({ success: false, message: err.message });

/* GET /api/master/org-telly */
exports.getAll = async (_req, res) => {
  try {
    res.json({ success: true, data: await svc.getAll() });
  } catch (err) {
    fail(res, err);
  }
};

/* POST /api/master/org-telly */
exports.create = async (req, res) => {
  try {
    const data = await svc.create(req.body || {}, req.username);
    res.json({ success: true, data, message: "Data master orang telly berhasil disimpan" });
  } catch (err) {
    fail(res, err);
  }
};

/* PUT /api/master/org-telly/:id */
exports.update = async (req, res) => {
  try {
    const data = await svc.update(req.params.id, req.body || {}, req.username);
    res.json({ success: true, data, message: "Data master orang telly berhasil diubah" });
  } catch (err) {
    fail(res, err);
  }
};

/* DELETE /api/master/org-telly/:id */
exports.remove = async (req, res) => {
  try {
    const data = await svc.remove(req.params.id, req.username);
    res.json({ success: true, data, message: "Data master orang telly berhasil dihapus" });
  } catch (err) {
    fail(res, err);
  }
};
