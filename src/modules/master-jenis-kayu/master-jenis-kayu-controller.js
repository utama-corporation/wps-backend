const svc = require("./master-jenis-kayu-service");

const fail = (res, err) => res.status(err.status || 500).json({ success: false, message: err.message });

/* GET /api/master/jenis-kayu */
exports.getAll = async (_req, res) => {
  try {
    res.json({ success: true, data: await svc.getAll() });
  } catch (err) {
    fail(res, err);
  }
};

/* GET /api/master/jenis-kayu/groups */
exports.getGroups = async (_req, res) => {
  try {
    res.json({ success: true, data: await svc.getGroups() });
  } catch (err) {
    fail(res, err);
  }
};

/* POST /api/master/jenis-kayu */
exports.create = async (req, res) => {
  try {
    const data = await svc.create(req.body || {}, req.username);
    res.json({ success: true, data, message: "Data master berhasil disimpan" });
  } catch (err) {
    fail(res, err);
  }
};

/* PUT /api/master/jenis-kayu/:id */
exports.update = async (req, res) => {
  try {
    const data = await svc.update(req.params.id, req.body || {}, req.username);
    res.json({ success: true, data, message: "Data master berhasil diubah" });
  } catch (err) {
    fail(res, err);
  }
};

/* DELETE /api/master/jenis-kayu/:id */
exports.remove = async (req, res) => {
  try {
    const data = await svc.remove(req.params.id, req.username);
    res.json({ success: true, data, message: "Data master berhasil dihapus" });
  } catch (err) {
    fail(res, err);
  }
};
