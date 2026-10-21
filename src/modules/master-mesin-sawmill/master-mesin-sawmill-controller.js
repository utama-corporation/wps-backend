const svc = require("./master-mesin-sawmill-service");

const fail = (res, err) => res.status(err.status || 500).json({ success: false, message: err.message });

/* GET /api/master/mesin-sawmill */
exports.getAll = async (_req, res) => {
  try {
    res.json({ success: true, data: await svc.getAll() });
  } catch (err) {
    fail(res, err);
  }
};

/* GET /api/master/mesin-sawmill/options */
exports.getOptions = async (_req, res) => {
  try {
    res.json({ success: true, data: await svc.getOptions() });
  } catch (err) {
    fail(res, err);
  }
};

/* POST /api/master/mesin-sawmill */
exports.create = async (req, res) => {
  try {
    const data = await svc.create(req.body || {}, req.username);
    res.json({ success: true, data, message: "Data master mesin sawmill berhasil disimpan" });
  } catch (err) {
    fail(res, err);
  }
};

/* PUT /api/master/mesin-sawmill/:noMeja */
exports.update = async (req, res) => {
  try {
    const data = await svc.update(req.params.noMeja, req.body || {}, req.username);
    res.json({ success: true, data, message: "Data master mesin sawmill berhasil diubah" });
  } catch (err) {
    fail(res, err);
  }
};

/* DELETE /api/master/mesin-sawmill/:noMeja */
exports.remove = async (req, res) => {
  try {
    const data = await svc.remove(req.params.noMeja, req.username);
    res.json({ success: true, data, message: "Data master mesin sawmill berhasil dihapus" });
  } catch (err) {
    fail(res, err);
  }
};
