const svc = require("./master-spk-service");

const fail = (res, err) => res.status(err.status || 500).json({ success: false, message: err.message });

const handler = (fn, message) => async (req, res) => {
  try {
    const data = await fn(req);
    res.json({ success: true, data, ...(message ? { message } : {}) });
  } catch (err) {
    fail(res, err);
  }
};

/* GET /api/master/spk */
exports.getAll = handler(() => svc.getAll());

/* GET /api/master/spk/masters */
exports.getMasters = handler(() => svc.getMasters());

/* GET /api/master/spk/:no */
exports.getByNo = async (req, res) => {
  try {
    const data = await svc.getByNo(req.params.no);
    if (!data) return res.status(404).json({ success: false, message: "SPK tidak ditemukan" });
    res.json({ success: true, data });
  } catch (err) {
    fail(res, err);
  }
};

/* POST /api/master/spk */
exports.create = handler((req) => svc.create(req.body || {}, req.username), "Data Master SPK berhasil disimpan");

/* PUT /api/master/spk/:no */
exports.update = handler((req) => svc.update(req.params.no, req.body || {}, req.username), "Data Master SPK berhasil diubah");

/* DELETE /api/master/spk/:no */
exports.remove = handler((req) => svc.remove(req.params.no, req.username), "Data Master SPK berhasil dihapus");
