const svc = require("./bongkar-susun-service");

const fail = (res, err) => res.status(err.status || 500).json({ success: false, message: err.message });

/* GET /api/bongkar-susun/list */
exports.getAll = async (req, res) => {
  try {
    const { search, top } = req.query;
    const data = await svc.getAll({ search, topRow: top });
    res.json({ success: true, data });
  } catch (err) {
    fail(res, err);
  }
};

/* GET /api/bongkar-susun/detail/:no */
exports.getDetail = async (req, res) => {
  try {
    const data = await svc.getDetail(req.params.no);
    res.json({ success: true, data });
  } catch (err) {
    fail(res, err);
  }
};

/* GET /api/bongkar-susun/scan-ready/:no */
exports.scanReady = async (req, res) => {
  try {
    const data = await svc.scanReady(req.params.no);
    res.json({ success: true, data });
  } catch (err) {
    fail(res, err);
  }
};

/* POST /api/bongkar-susun/lookup */
exports.lookup = async (req, res) => {
  try {
    const { noBongkarSusun, label } = req.body || {};
    const data = await svc.lookup(noBongkarSusun, label);
    res.json({ success: data.ok, data, message: data.message || "Label valid" });
  } catch (err) {
    fail(res, err);
  }
};

/* POST /api/bongkar-susun (create — nomor digenerate server) */
exports.create = async (req, res) => {
  try {
    const data = await svc.createHeader(req.body || {}, req.username);
    res.json({ success: true, data, message: "Data berhasil dibuat" });
  } catch (err) {
    fail(res, err);
  }
};

/* PUT /api/bongkar-susun/:no */
exports.update = async (req, res) => {
  try {
    const data = await svc.updateHeader(req.params.no, req.body || {}, req.username);
    res.json({ success: true, data, message: "Data berhasil diupdate" });
  } catch (err) {
    fail(res, err);
  }
};

/* POST /api/bongkar-susun/:no/save */
exports.saveDetail = async (req, res) => {
  try {
    const result = await svc.saveDetail(req.params.no, req.body || {}, req.username);
    res.json({ success: true, data: result, message: result.message });
  } catch (err) {
    fail(res, err);
  }
};

/* DELETE /api/bongkar-susun/:no/label?label= */
exports.deleteLabel = async (req, res) => {
  try {
    const label = req.query.label || req.body?.label;
    const data = await svc.deleteLabel(req.params.no, label, req.username);
    res.json({ success: true, data, message: "Berhasil menghapus data" });
  } catch (err) {
    fail(res, err);
  }
};

/* GET /api/bongkar-susun/:no/history */
exports.getHistory = async (req, res) => {
  try {
    const data = await svc.getHistory(req.params.no);
    res.json({ success: true, data });
  } catch (err) {
    fail(res, err);
  }
};

/* GET /api/bongkar-susun/label-info?label= */
exports.getLabelInfo = async (req, res) => {
  try {
    const data = await svc.getLabelInfo(req.query.label);
    res.json({ success: true, data });
  } catch (err) {
    fail(res, err);
  }
};
