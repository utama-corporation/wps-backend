const svc = require("./master-mesin-service");

const fail = (res, err) => res.status(err.status || 500).json({ success: false, message: err.message });

/* GET /api/master/mesin */
exports.getAll = async (_req, res) => {
  try {
    res.json({ success: true, data: await svc.getAll() });
  } catch (err) {
    fail(res, err);
  }
};

/* GET /api/master/mesin/options */
exports.getOptions = async (_req, res) => {
  try {
    res.json({ success: true, data: await svc.getOptions() });
  } catch (err) {
    fail(res, err);
  }
};

/* POST /api/master/mesin */
exports.create = async (req, res) => {
  try {
    const data = await svc.create(req.body || {}, req.username);
    res.json({ success: true, data, message: "Data master mesin berhasil disimpan" });
  } catch (err) {
    fail(res, err);
  }
};

/* PUT /api/master/mesin/:id */
exports.update = async (req, res) => {
  try {
    const data = await svc.update(req.params.id, req.body || {}, req.username);
    res.json({ success: true, data, message: "Data master mesin berhasil diubah" });
  } catch (err) {
    fail(res, err);
  }
};

/* DELETE /api/master/mesin/:id */
exports.remove = async (req, res) => {
  try {
    const data = await svc.remove(req.params.id, req.username);
    res.json({ success: true, data, message: "Data master mesin berhasil dihapus" });
  } catch (err) {
    fail(res, err);
  }
};
