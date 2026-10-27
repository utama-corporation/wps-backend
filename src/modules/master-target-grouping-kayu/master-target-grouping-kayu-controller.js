const svc = require("./master-target-grouping-kayu-service");

const fail = (res, err) => res.status(err.status || 500).json({ success: false, message: err.message });

/* GET /api/master/target-grouping-kayu */
exports.getAll = async (_req, res) => {
  try {
    res.json({ success: true, data: await svc.getAll() });
  } catch (err) {
    fail(res, err);
  }
};

/* GET /api/master/target-grouping-kayu/group-options */
exports.getGroupOptions = async (_req, res) => {
  try {
    res.json({ success: true, data: await svc.getGroupOptions() });
  } catch (err) {
    fail(res, err);
  }
};

/* GET /api/master/target-grouping-kayu/:id */
exports.getDetail = async (req, res) => {
  try {
    res.json({ success: true, data: await svc.getDetail(req.params.id) });
  } catch (err) {
    fail(res, err);
  }
};

/* POST /api/master/target-grouping-kayu */
exports.create = async (req, res) => {
  try {
    const data = await svc.create(req.body || {}, req.username);
    res.json({ success: true, data, message: "Target grouping kayu berhasil disimpan" });
  } catch (err) {
    fail(res, err);
  }
};

/* PUT /api/master/target-grouping-kayu/:id */
exports.update = async (req, res) => {
  try {
    const data = await svc.update(req.params.id, req.body || {}, req.username);
    res.json({ success: true, data, message: "Target grouping kayu berhasil diubah" });
  } catch (err) {
    fail(res, err);
  }
};

/* DELETE /api/master/target-grouping-kayu/:id */
exports.remove = async (req, res) => {
  try {
    const data = await svc.remove(req.params.id, req.username);
    res.json({ success: true, data, message: "Target grouping kayu berhasil dihapus" });
  } catch (err) {
    fail(res, err);
  }
};
