const svc = require("./nyangkut-service");

const fail = (res, err) => res.status(err.status || 500).json({ success: false, message: err.message });

/* GET /api/nyangkut/list */
exports.getAll = async (req, res) => {
  try {
    const { search, top } = req.query;
    res.json({ success: true, data: await svc.getAll({ search, topRow: top }) });
  } catch (err) {
    fail(res, err);
  }
};

/* GET /api/nyangkut/detail/:no */
exports.getDetail = async (req, res) => {
  try {
    res.json({ success: true, data: await svc.getDetail(req.params.no) });
  } catch (err) {
    fail(res, err);
  }
};

/* GET /api/nyangkut/scan-ready/:no */
exports.scanReady = async (req, res) => {
  try {
    res.json({ success: true, data: await svc.scanReady(req.params.no) });
  } catch (err) {
    fail(res, err);
  }
};

/* POST /api/nyangkut/lookup */
exports.lookup = async (req, res) => {
  try {
    const { noNyangkut, label } = req.body || {};
    const data = await svc.lookup(noNyangkut, label);
    res.json({ success: data.ok, data, message: data.message || "Label valid" });
  } catch (err) {
    fail(res, err);
  }
};

/* POST /api/nyangkut (nomor digenerate server) */
exports.create = async (req, res) => {
  try {
    const data = await svc.createHeader(req.body || {}, req.username);
    res.json({ success: true, data, message: "Data berhasil dibuat" });
  } catch (err) {
    fail(res, err);
  }
};

/* PUT /api/nyangkut/:no */
exports.update = async (req, res) => {
  try {
    const data = await svc.updateHeader(req.params.no, req.body || {}, req.username);
    res.json({ success: true, data, message: "Data berhasil diupdate" });
  } catch (err) {
    fail(res, err);
  }
};

/* DELETE /api/nyangkut/:no (cascade detail) */
exports.remove = async (req, res) => {
  try {
    const data = await svc.deleteHeader(req.params.no, req.username);
    res.json({ success: true, data, message: "Header berhasil dihapus" });
  } catch (err) {
    fail(res, err);
  }
};

/* POST /api/nyangkut/:no/save */
exports.saveDetail = async (req, res) => {
  try {
    const result = await svc.saveDetail(req.params.no, req.body || {}, req.username);
    res.json({ success: true, data: result, message: result.message });
  } catch (err) {
    fail(res, err);
  }
};

/* DELETE /api/nyangkut/:no/label?label= */
exports.deleteLabel = async (req, res) => {
  try {
    const label = req.query.label || req.body?.label;
    const data = await svc.deleteLabel(req.params.no, label, req.username);
    res.json({ success: true, data, message: "Berhasil mengeluarkan label" });
  } catch (err) {
    fail(res, err);
  }
};

/* GET /api/nyangkut/label-info?label= */
exports.getLabelInfo = async (req, res) => {
  try {
    res.json({ success: true, data: await svc.getLabelInfo(req.query.label) });
  } catch (err) {
    fail(res, err);
  }
};
