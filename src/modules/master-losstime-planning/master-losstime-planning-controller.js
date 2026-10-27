const svc = require("./master-losstime-planning-service");

const fail = (res, err) => res.status(err.status || 500).json({ success: false, message: err.message });

/* GET /api/master/losstime-planning */
exports.getAll = async (_req, res) => {
  try {
    res.json({ success: true, data: await svc.getAll() });
  } catch (err) {
    fail(res, err);
  }
};

/* GET /api/master/losstime-planning/options */
exports.getOptions = async (_req, res) => {
  try {
    res.json({ success: true, data: await svc.getOptions() });
  } catch (err) {
    fail(res, err);
  }
};

/* POST /api/master/losstime-planning */
exports.create = async (req, res) => {
  try {
    const data = await svc.create(req.body || {}, req.username);
    res.json({ success: true, data, message: "Loss time planning berhasil disimpan" });
  } catch (err) {
    fail(res, err);
  }
};

/* PUT /api/master/losstime-planning */
exports.update = async (req, res) => {
  try {
    const data = await svc.update(req.body || {}, req.username);
    res.json({ success: true, data, message: "Loss time planning berhasil diubah" });
  } catch (err) {
    fail(res, err);
  }
};

/* DELETE /api/master/losstime-planning?idMesin=&idLossTimeFactor= */
exports.remove = async (req, res) => {
  try {
    const data = await svc.remove(req.query.idMesin, req.query.idLossTimeFactor, req.username);
    res.json({ success: true, data, message: "Loss time planning berhasil dihapus" });
  } catch (err) {
    fail(res, err);
  }
};
