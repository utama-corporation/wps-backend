const svc = require("./master-losstime-faktor-service");

const fail = (res, err) => res.status(err.status || 500).json({ success: false, message: err.message });

/* GET /api/master/losstime-faktor */
exports.getAll = async (_req, res) => {
  try {
    res.json({ success: true, data: await svc.getAll() });
  } catch (err) {
    fail(res, err);
  }
};

/* POST /api/master/losstime-faktor */
exports.create = async (req, res) => {
  try {
    const data = await svc.create(req.body || {}, req.username);
    res.json({ success: true, data, message: "Loss time faktor berhasil disimpan" });
  } catch (err) {
    fail(res, err);
  }
};

/* PUT /api/master/losstime-faktor/:id */
exports.update = async (req, res) => {
  try {
    const data = await svc.update(req.params.id, req.body || {}, req.username);
    res.json({ success: true, data, message: "Loss time faktor berhasil diubah" });
  } catch (err) {
    fail(res, err);
  }
};

/* DELETE /api/master/losstime-faktor/:id */
exports.remove = async (req, res) => {
  try {
    const data = await svc.remove(req.params.id, req.username);
    res.json({ success: true, data, message: "Loss time faktor berhasil dihapus" });
  } catch (err) {
    fail(res, err);
  }
};
