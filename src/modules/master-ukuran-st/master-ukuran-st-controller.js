const svc = require("./master-ukuran-st-service");

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
exports.getLookups = handler(() => svc.getLookups());
exports.create = handler((req) => svc.create(req.body || {}, req.username), "Data Master Ukuran ST berhasil disimpan");
exports.update = handler((req) => svc.update(req.body || {}, req.username), "Data Master Ukuran ST berhasil diubah");
exports.remove = handler((req) => svc.remove(req.body || {}, req.username), "Data Master Ukuran ST berhasil dihapus");
