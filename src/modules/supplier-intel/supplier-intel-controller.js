const svc = require("./supplier-intel-service");

const fail = (res, err) => res.status(err.status || 500).json({ success: false, message: err.message });

/* GET /api/supplier-intel?from=&to= */
exports.getAll = async (req, res) => {
  try {
    res.json({ success: true, data: await svc.getAll({ from: req.query.from, to: req.query.to }) });
  } catch (err) {
    fail(res, err);
  }
};

/* GET /api/supplier-intel/options */
exports.getOptions = async (_req, res) => {
  try {
    res.json({ success: true, data: await svc.getOptions() });
  } catch (err) {
    fail(res, err);
  }
};

/* POST /api/supplier-intel */
exports.create = async (req, res) => {
  try {
    const data = await svc.create(req.body || {}, req.username);
    res.json({ success: true, data, message: "Data berhasil disimpan" });
  } catch (err) {
    fail(res, err);
  }
};

/* PUT /api/supplier-intel/:id */
exports.update = async (req, res) => {
  try {
    const data = await svc.update(req.params.id, req.body || {}, req.username);
    res.json({ success: true, data, message: "Data berhasil diubah" });
  } catch (err) {
    fail(res, err);
  }
};

/* DELETE /api/supplier-intel/:id */
exports.remove = async (req, res) => {
  try {
    const data = await svc.remove(req.params.id, req.username);
    res.json({ success: true, data, message: "Data berhasil dihapus" });
  } catch (err) {
    fail(res, err);
  }
};
