const svc = require("./master-target-kayu-bulat-service");

const fail = (res, err) => res.status(err.status || 500).json({ success: false, message: err.message });

/* GET /api/master/target-kayu-bulat */
exports.getAll = async (_req, res) => {
  try {
    res.json({ success: true, data: await svc.getAll() });
  } catch (err) {
    fail(res, err);
  }
};

/* GET /api/master/target-kayu-bulat/grouping-options */
exports.getGroupingOptions = async (_req, res) => {
  try {
    res.json({ success: true, data: await svc.getGroupingOptions() });
  } catch (err) {
    fail(res, err);
  }
};

/* POST /api/master/target-kayu-bulat */
exports.create = async (req, res) => {
  try {
    const data = await svc.create(req.body || {}, req.username);
    res.json({ success: true, data, message: "Target kayu bulat berhasil disimpan" });
  } catch (err) {
    fail(res, err);
  }
};

/* PUT /api/master/target-kayu-bulat */
exports.update = async (req, res) => {
  try {
    const data = await svc.update(req.body || {}, req.username);
    res.json({ success: true, data, message: "Target kayu bulat berhasil diubah" });
  } catch (err) {
    fail(res, err);
  }
};

/* DELETE /api/master/target-kayu-bulat?id=&periode= */
exports.remove = async (req, res) => {
  try {
    const data = await svc.remove(req.query.id, req.query.periode, req.username);
    res.json({ success: true, data, message: "Target kayu bulat berhasil dihapus" });
  } catch (err) {
    fail(res, err);
  }
};
