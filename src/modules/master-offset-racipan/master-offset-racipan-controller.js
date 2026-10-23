const svc = require("./master-offset-racipan-service");

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
exports.getDetail = handler((req) => svc.getDetail(req.params.tgl));
exports.getJenisKayu = handler(() => svc.getJenisKayu());
exports.create = handler((req) => svc.create(req.body || {}, req.username), "Data Master Offset Racipan Hidup berhasil disimpan");
exports.update = handler((req) => svc.update(req.params.tgl, req.body || {}, req.username), "Data Master Offset Racipan Hidup berhasil diubah");
exports.remove = handler((req) => svc.remove(req.params.tgl, req.username), "Data Master Offset Racipan Hidup berhasil dihapus");
