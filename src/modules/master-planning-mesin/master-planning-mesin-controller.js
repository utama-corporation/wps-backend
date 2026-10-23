const svc = require("./master-planning-mesin-service");

const fail = (res, err) => res.status(err.status || 500).json({ success: false, message: err.message });

const handler = (fn, message) => async (req, res) => {
  try {
    const data = await fn(req);
    res.json({ success: true, data, ...(message ? { message } : {}) });
  } catch (err) {
    fail(res, err);
  }
};

exports.getProses = handler(() => svc.listProses());
exports.getAll = handler((req) => svc.getAll(req.query.proses));
exports.getMesin = handler((req) => svc.getMesin(req.query.proses));
exports.create = handler((req) => svc.create(req.body || {}, req.username), "Data Master Planning Mesin berhasil disimpan");
exports.update = handler((req) => svc.update(req.body?.old || {}, req.body?.new || {}, req.username), "Data Master Planning Mesin berhasil diubah");
exports.remove = handler((req) => svc.remove(req.body || {}, req.body || {}, req.username), "Data Master Planning Mesin berhasil dihapus");
