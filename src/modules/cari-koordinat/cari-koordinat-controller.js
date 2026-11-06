const svc = require("./cari-koordinat-service");
const report = require("./cari-koordinat-report");

const fail = (res, err) => res.status(err.status || 500).json({ success: false, message: err.message });

/* GET /api/operasional/cari-koordinat/spk */
exports.getSpkList = async (_req, res) => {
  try {
    res.json({ success: true, data: await svc.getSpkList() });
  } catch (err) {
    fail(res, err);
  }
};

/* GET /api/operasional/cari-koordinat?noSpk= */
exports.getTanah = async (req, res) => {
  try {
    res.json({ success: true, data: await svc.getTanah(req.query.noSpk) });
  } catch (err) {
    fail(res, err);
  }
};

/* GET /api/operasional/cari-koordinat/pemilik?noSpk= */
exports.getPemilik = async (req, res) => {
  try {
    res.json({ success: true, data: await svc.getPemilik(req.query.noSpk) });
  } catch (err) {
    fail(res, err);
  }
};

/* GET /api/operasional/cari-koordinat/persentase?noSpk= */
exports.getPersentase = async (req, res) => {
  try {
    res.json({ success: true, data: await svc.getPersentase(req.query.noSpk) });
  } catch (err) {
    fail(res, err);
  }
};

/* GET /api/operasional/cari-koordinat/export/csv?noSpk= */
exports.exportCsv = async (req, res) => {
  try {
    const { csv, jumlah } = await svc.buildCsv(req.query.noSpk);
    if (!jumlah) {
      return res
        .status(404)
        .json({ success: false, message: "Tidak ada tanah dengan pemilik dan koordinat valid untuk SPK ini." });
    }
    const nama = String(req.query.noSpk).trim().replace(/[^\w.-]+/g, "_");
    res.set({
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="koordinat_${nama}.csv"`,
    });
    res.send(csv);
  } catch (err) {
    fail(res, err);
  }
};

/* GET /api/operasional/cari-koordinat/pdf?noSpk= */
exports.generatePdf = async (req, res) => {
  try {
    const pdf = await report.buildPdf(req.query.noSpk);
    const nama = String(req.query.noSpk).trim().replace(/[^\w.-]+/g, "_");
    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="koordinat_${nama}.pdf"`,
      "Content-Length": pdf.length,
    });
    res.end(pdf);
  } catch (err) {
    fail(res, err);
  }
};

/* POST /api/operasional/cari-koordinat/export/geojson  { noSpk, keys: string[] } */
exports.exportGeoJson = async (req, res) => {
  try {
    const { noSpk, keys } = req.body || {};
    res.json({ success: true, data: await svc.buildGeoJson(noSpk, keys) });
  } catch (err) {
    fail(res, err);
  }
};
