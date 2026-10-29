const svc = require("./master-gol-pengukuran-service");

const fail = (res, err) => res.status(err.status || 500).json({ success: false, message: err.message });

/* GET /api/master/gol-pengukuran */
exports.getAll = async (_req, res) => {
  try {
    res.json({ success: true, data: await svc.getAll() });
  } catch (err) {
    fail(res, err);
  }
};

/* GET /api/master/gol-pengukuran/:id/detail */
exports.getDetail = async (req, res) => {
  try {
    res.json({ success: true, data: await svc.getDetail(req.params.id) });
  } catch (err) {
    fail(res, err);
  }
};

/* POST /api/master/gol-pengukuran */
exports.create = async (req, res) => {
  try {
    const data = await svc.create(req.body || {}, req.username);
    res.json({ success: true, data, message: "Data master Golongan Pengukuran berhasil disimpan" });
  } catch (err) {
    fail(res, err);
  }
};

/* PUT /api/master/gol-pengukuran/:id */
exports.update = async (req, res) => {
  try {
    const data = await svc.update(req.params.id, req.body || {}, req.username);
    res.json({ success: true, data, message: "Data master Golongan Pengukuran berhasil diubah" });
  } catch (err) {
    fail(res, err);
  }
};

/* PUT /api/master/gol-pengukuran/:id/status — hanya ganti Enable, detail tidak disentuh. */
exports.setEnable = async (req, res) => {
  try {
    const data = await svc.setEnable(req.params.id, req.body?.enable, req.username);
    res.json({ success: true, data, message: "Status Golongan Pengukuran berhasil diubah" });
  } catch (err) {
    fail(res, err);
  }
};

/* DELETE /api/master/gol-pengukuran/:id */
exports.remove = async (req, res) => {
  try {
    const data = await svc.remove(req.params.id, req.username);
    res.json({ success: true, data, message: "Data master Golongan Pengukuran berhasil dihapus" });
  } catch (err) {
    fail(res, err);
  }
};
