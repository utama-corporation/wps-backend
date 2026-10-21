const svc = require("./master-grade-service");

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
exports.create = handler((req) => svc.create(req.body || {}, req.username), "Data Master Grade berhasil disimpan");
exports.update = handler((req) => svc.update(req.params.id, req.body || {}, req.username), "Data Master Grade berhasil diubah");
exports.remove = handler((req) => svc.remove(req.params.id, req.username), "Data Master Grade berhasil dihapus");
exports.getCategories = handler((req) => svc.getCategories(req.params.id));
exports.replaceCategories = handler((req) => svc.replaceCategories(req.params.id, req.body || {}, req.username), "Category Grade berhasil disimpan");
