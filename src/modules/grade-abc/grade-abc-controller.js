const svc = require("./grade-abc-service");

const fail = (res, err) => res.status(err.status || 500).json({ success: false, message: err.message });

/* GET /api/grade-abc/master */
exports.getMaster = async (req, res) => {
  try {
    res.json({ success: true, data: await svc.getMaster() });
  } catch (err) {
    fail(res, err);
  }
};

/* GET /api/grade-abc/list */
exports.getAll = async (req, res) => {
  try {
    const { search, top } = req.query;
    res.json({ success: true, data: await svc.getAll({ search, topRow: top }) });
  } catch (err) {
    fail(res, err);
  }
};

/* GET /api/grade-abc/:no/detail */
exports.getDetail = async (req, res) => {
  try {
    res.json({ success: true, data: await svc.getDetail(req.params.no) });
  } catch (err) {
    fail(res, err);
  }
};

/* POST /api/grade-abc (nomor digenerate server) */
exports.create = async (req, res) => {
  try {
    const data = await svc.createHeader(req.body || {}, req.username);
    res.json({ success: true, data, message: "Header berhasil dibuat" });
  } catch (err) {
    fail(res, err);
  }
};

/* PUT /api/grade-abc/:no */
exports.update = async (req, res) => {
  try {
    const data = await svc.updateHeader(req.params.no, req.body || {}, req.username);
    res.json({ success: true, data, message: "Header berhasil diubah" });
  } catch (err) {
    fail(res, err);
  }
};

/* DELETE /api/grade-abc/:no (cascade detail) */
exports.remove = async (req, res) => {
  try {
    const data = await svc.deleteHeader(req.params.no, req.username);
    res.json({ success: true, data, message: "Data berhasil dihapus" });
  } catch (err) {
    fail(res, err);
  }
};

/* POST /api/grade-abc/:no/detail */
exports.addDetail = async (req, res) => {
  try {
    const data = await svc.addDetail(req.params.no, req.body || {}, req.username);
    res.json({ success: true, data, message: "Detail berhasil ditambahkan" });
  } catch (err) {
    fail(res, err);
  }
};

/* PUT /api/grade-abc/:no/detail/:id */
exports.updateDetail = async (req, res) => {
  try {
    const data = await svc.updateDetail(req.params.no, req.params.id, req.body || {}, req.username);
    res.json({ success: true, data, message: "Detail berhasil diubah" });
  } catch (err) {
    fail(res, err);
  }
};

/* DELETE /api/grade-abc/:no/detail/:id */
exports.deleteDetail = async (req, res) => {
  try {
    const data = await svc.deleteDetail(req.params.no, req.params.id, req.username);
    res.json({ success: true, data, message: "Detail berhasil dihapus" });
  } catch (err) {
    fail(res, err);
  }
};
