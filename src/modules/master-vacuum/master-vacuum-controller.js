const svc = require("./master-vacuum-service");

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
exports.create = handler((req) => svc.create(req.body || {}, req.username), "Data Master Vacuum Tube berhasil disimpan");
exports.update = handler((req) => svc.update(req.params.id, req.body || {}, req.username), "Data Master Vacuum Tube berhasil diubah");
exports.remove = handler((req) => svc.remove(req.params.id, req.username), "Data Master Vacuum Tube berhasil dihapus");
