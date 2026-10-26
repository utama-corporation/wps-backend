const svc = require("./penjualan-st-service");
const { generateReportPdf } = require("../../../core/utils/pdf/report-generator");
const { buildSuratJalanST } = require("../../../core/utils/pdf/templates/penjualan-pdf/penjualan-report");

const fail = (res, err) => res.status(err.status || 500).json({ success: false, message: err.message });

/* GET /api/penjualan/st/list */
exports.getAll = async (req, res) => {
  try {
    const { search, top } = req.query;
    const data = await svc.getAll({ search, topRow: top });
    res.json({ success: true, data });
  } catch (err) {
    fail(res, err);
  }
};

/* GET /api/penjualan/st/masters */
exports.getMasters = async (_req, res) => {
  try {
    const data = await svc.getMasters();
    res.json({ success: true, data });
  } catch (err) {
    fail(res, err);
  }
};

/* GET /api/penjualan/st/detail/:noJual */
exports.getDetail = async (req, res) => {
  try {
    const data = await svc.getDetail(req.params.noJual);
    res.json({ success: true, data });
  } catch (err) {
    fail(res, err);
  }
};

/* GET /api/penjualan/st/scan-ready/:noJual */
exports.scanReady = async (req, res) => {
  try {
    const data = await svc.scanReady(req.params.noJual);
    res.json({ success: true, data });
  } catch (err) {
    fail(res, err);
  }
};

/* POST /api/penjualan/st/lookup */
exports.lookup = async (req, res) => {
  try {
    const { noJual, label } = req.body || {};
    const data = await svc.lookup(noJual, label);
    res.json({ success: data.ok, data, message: data.message || "Label valid" });
  } catch (err) {
    fail(res, err);
  }
};

/* POST /api/penjualan/st (create — nomor digenerate server) */
exports.create = async (req, res) => {
  try {
    const data = await svc.createHeader(req.body || {}, req.username);
    res.json({ success: true, data, message: "Data berhasil dibuat" });
  } catch (err) {
    fail(res, err);
  }
};

/* PUT /api/penjualan/st/:noJual */
exports.update = async (req, res) => {
  try {
    const data = await svc.updateHeader(req.params.noJual, req.body || {}, req.username);
    res.json({ success: true, data, message: "Update berhasil" });
  } catch (err) {
    fail(res, err);
  }
};

/* POST /api/penjualan/st/:noJual/save */
exports.saveDetail = async (req, res) => {
  try {
    const result = await svc.saveDetail(req.params.noJual, req.body || {}, req.username);
    res.json({ success: true, data: result, message: result.message });
  } catch (err) {
    fail(res, err);
  }
};

/* DELETE /api/penjualan/st/:noJual/label */
exports.deleteLabel = async (req, res) => {
  try {
    const label = req.query.label || req.body?.label;
    const data = await svc.deleteLabel(req.params.noJual, label, req.username);
    res.json({ success: true, data, message: "Berhasil menghapus data" });
  } catch (err) {
    fail(res, err);
  }
};

/* GET /api/penjualan/st/label-info?label= */
exports.getLabelInfo = async (req, res) => {
  try {
    const data = await svc.getLabelInfo(req.query.label);
    res.json({ success: true, data });
  } catch (err) {
    fail(res, err);
  }
};

/* GET /api/penjualan/st/:noJual/pdf — Surat Jalan ST */
exports.pdf = async (req, res) => {
  try {
    const noJual = String(req.params.noJual || "").trim();
    const rows = await svc.getInvoiceRows(noJual);
    if (!rows.length) {
      return res.status(404).json({ success: false, message: "Data penjualan ST tidak ditemukan / belum ada label ST" });
    }
    const { html, options } = buildSuratJalanST(rows, { printedBy: req.username || "" });
    const pdf = await generateReportPdf(html, options);
    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": 'inline; filename="SuratJalan_' + noJual + '.pdf"',
      "Content-Length": pdf.length,
    });
    return res.end(pdf);
  } catch (err) {
    fail(res, err);
  }
};
