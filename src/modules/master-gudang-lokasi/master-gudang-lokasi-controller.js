const svc = require("./master-gudang-lokasi-service");

const fail = (res, err) => {
  const status = err.status || 500;
  if (status === 500) console.error("Error MasterGudangLokasi:", err);
  res.status(status).json({ success: false, message: status === 500 ? "Internal Server Error" : err.message });
};

const handler = (fn, message) => async (req, res) => {
  try {
    const data = await fn(req);
    res.json({ success: true, data, ...(message ? { message } : {}) });
  } catch (err) {
    fail(res, err);
  }
};

/* Master flat: :master = warehouse | lokasi | source-location | other-factory | surat-tanah */
exports.list = handler((req) => svc.list(req.params.master));
exports.create = handler((req) => svc.create(req.params.master, req.body || {}, req.username), "Data master berhasil disimpan");
exports.update = handler((req) => svc.update(req.params.master, req.params.id, req.body || {}, req.username), "Data master berhasil diubah");
exports.remove = handler((req) => svc.remove(req.params.master, req.params.id, req.username), "Data master berhasil dihapus");

/* Mapping ID Lokasi (PK gabungan) */
exports.mappingList = handler(() => svc.mappingList());
exports.mappingLookups = handler(() => svc.mappingLookups());
exports.mappingCreate = handler((req) => svc.mappingCreate(req.body || {}, req.username), "Data mapping berhasil disimpan");
exports.mappingUpdate = handler((req) => svc.mappingUpdate(req.params, req.body || {}, req.username), "Data mapping berhasil diubah");
exports.mappingRemove = handler((req) => svc.mappingRemove(req.params, req.username), "Data mapping berhasil dihapus");
