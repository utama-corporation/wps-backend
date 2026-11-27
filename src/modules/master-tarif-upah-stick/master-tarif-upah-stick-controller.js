const svc = require("./master-tarif-upah-stick-service");

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
exports.getJenisKayuOptions = handler(() => svc.getJenisKayuOptions());
exports.create = handler((req) => svc.create(req.body || {}, req.username), "Tarif upah stick berhasil disimpan");
exports.update = handler((req) => svc.update(req.params.id, req.body || {}, req.username), "Tarif upah stick berhasil diubah");
exports.remove = handler((req) => svc.remove(req.params.id, req.username), "Tarif upah stick berhasil dihapus");
exports.hitungUlang = handler(
  (req) => svc.hitungUlangRentang(req.body?.start_date, req.body?.end_date, { user: req.username }),
  "Snapshot upah label berhasil dihitung ulang",
);
