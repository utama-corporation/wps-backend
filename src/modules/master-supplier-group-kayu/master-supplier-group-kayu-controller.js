const svc = require("./master-supplier-group-kayu-service");

const fail = (res, err) => res.status(err.status || 500).json({ success: false, message: err.message });

/* GET /api/master/supplier-group-kayu */
exports.getAll = async (_req, res) => {
  try {
    res.json({ success: true, data: await svc.getAll() });
  } catch (err) {
    fail(res, err);
  }
};

/* GET /api/master/supplier-group-kayu/options */
exports.getOptions = async (_req, res) => {
  try {
    res.json({ success: true, data: await svc.getOptions() });
  } catch (err) {
    fail(res, err);
  }
};

/* POST /api/master/supplier-group-kayu */
exports.create = async (req, res) => {
  try {
    const data = await svc.create(req.body || {}, req.username);
    res.json({ success: true, data, message: "Data berhasil disimpan" });
  } catch (err) {
    fail(res, err);
  }
};

/* PUT /api/master/supplier-group-kayu/:idSupplier/:idGroup */
exports.update = async (req, res) => {
  try {
    const data = await svc.update(req.params.idSupplier, req.params.idGroup, req.body || {}, req.username);
    res.json({ success: true, data, message: "Data berhasil diubah" });
  } catch (err) {
    fail(res, err);
  }
};

/* DELETE /api/master/supplier-group-kayu/:idSupplier/:idGroup */
exports.remove = async (req, res) => {
  try {
    const data = await svc.remove(req.params.idSupplier, req.params.idGroup, req.username);
    res.json({ success: true, data, message: "Data berhasil dihapus" });
  } catch (err) {
    fail(res, err);
  }
};
