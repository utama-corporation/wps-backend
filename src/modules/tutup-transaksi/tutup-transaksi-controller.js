const svc = require("./tutup-transaksi-service");

const fail = (res, err) => res.status(err.status || 500).json({ success: false, message: err.message });

const handler = (fn, message) => async (req, res) => {
  try {
    const data = await fn(req);
    res.json({ success: true, data, ...(message ? { message } : {}) });
  } catch (err) {
    fail(res, err);
  }
};

exports.getBulanan = handler(() => svc.getBulanan());
exports.createBulanan = handler((req) => svc.createBulanan(req.body || {}, req.username), "Periode bulanan berhasil disimpan");
exports.updateBulanan = handler((req) => svc.updateBulanan(req.params.period, req.body || {}, req.username), "Periode bulanan berhasil diubah");
exports.removeBulanan = handler((req) => svc.removeBulanan(req.params.period, req.username), "Periode bulanan berhasil dihapus");

exports.getHarian = handler(() => svc.getHarian());
exports.createHarian = handler((req) => svc.createHarian(req.body || {}, req.username), "Tanggal harian berhasil disimpan");
exports.updateHarian = handler((req) => svc.updateHarian(req.params.id, req.body || {}, req.username), "Tanggal harian berhasil diubah");
exports.removeHarian = handler((req) => svc.removeHarian(req.params.id, req.username), "Tanggal harian berhasil dihapus");
