const svc = require("./master-spk-reserve-service");

const fail = (res, err) => res.status(err.status || 500).json({ success: false, message: err.message });

const handler = (fn, message) => async (req, res) => {
  try {
    const data = await fn(req);
    res.json({ success: true, data, ...(message ? { message } : {}) });
  } catch (err) {
    fail(res, err);
  }
};

exports.getAll = handler(() => svc.getAll());
exports.getMasters = handler(() => svc.getMasters());

exports.getById = async (req, res) => {
  try {
    const data = await svc.getById(req.params.id);
    if (!data) return res.status(404).json({ success: false, message: "Reserve For SPK tidak ditemukan" });
    res.json({ success: true, data });
  } catch (err) {
    fail(res, err);
  }
};

exports.create = handler((req) => svc.create(req.body || {}, req.username), "Data berhasil disimpan");
exports.update = handler((req) => svc.update(req.params.id, req.body || {}, req.username), "Data berhasil diubah");
exports.remove = handler((req) => svc.remove(req.params.id, req.username), "Data berhasil dihapus");
