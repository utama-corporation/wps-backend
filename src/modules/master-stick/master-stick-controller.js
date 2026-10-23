const svc = require("./master-stick-service");

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
exports.getGrades = handler(() => svc.getGrades());
exports.create = handler((req) => svc.create(req.body || {}, req.username), "Data Master Stick berhasil disimpan");
exports.update = handler((req) => svc.update(req.body?.old || {}, req.body?.new || {}, req.username), "Data Master Stick berhasil diubah");
exports.remove = handler((req) => svc.remove(req.body || {}, req.username), "Data Master Stick berhasil dihapus");
