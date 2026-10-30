const service = require("./penerimaan-st-pembelian-service");
const report = require("./penerimaan-st-pembelian-report");

const fail = (res, err, label) => {
  console.error(`${label}:`, err);
  return res.status(err.statusCode || err.status || 500).json({
    success: false,
    message: err.message || "Terjadi kesalahan server",
  });
};

const noOf = (req) => String(req.params.no || "").trim();

exports.getAll = async (req, res) => {
  try {
    const data = await service.getAll({ search: req.query.search });
    return res.json({ success: true, message: "List penerimaan ST berhasil diambil", data });
  } catch (err) {
    return fail(res, err, "PenerimaanSTPembelian List Error");
  }
};

exports.getMasters = async (req, res) => {
  try {
    const [supplier, surat_tanah] = await Promise.all([service.getSuppliers(), service.getSuratTanah()]);
    return res.json({ success: true, message: "Masters berhasil diambil", data: { supplier, surat_tanah } });
  } catch (err) {
    return fail(res, err, "PenerimaanSTPembelian Masters Error");
  }
};

exports.getByNo = async (req, res) => {
  try {
    const data = await service.getByNo(noOf(req));
    if (!data) {
      return res.status(404).json({ success: false, message: "Penerimaan ST tidak ditemukan" });
    }
    return res.json({ success: true, message: "Penerimaan ST berhasil diambil", data });
  } catch (err) {
    return fail(res, err, "PenerimaanSTPembelian Get Error");
  }
};

exports.getLabels = async (req, res) => {
  try {
    const data = await service.getLabels(noOf(req));
    return res.json({ success: true, message: "Label ST berhasil diambil", data });
  } catch (err) {
    return fail(res, err, "PenerimaanSTPembelian Labels Error");
  }
};

exports.getRejects = async (req, res) => {
  try {
    const data = await service.getRejects(noOf(req));
    return res.json({ success: true, message: "Data reject berhasil diambil", data });
  } catch (err) {
    return fail(res, err, "PenerimaanSTPembelian Rejects Error");
  }
};

exports.create = async (req, res) => {
  try {
    const data = await service.create(req.body || {});
    return res.status(201).json({
      success: true,
      message: `Berhasil disimpan dengan No.Penerimaan ST ${data.noPenerimaanST}`,
      data,
    });
  } catch (err) {
    return fail(res, err, "PenerimaanSTPembelian Create Error");
  }
};

exports.update = async (req, res) => {
  try {
    const data = await service.update(noOf(req), req.body || {});
    return res.json({ success: true, message: `Penerimaan ST ${data.noPenerimaanST} berhasil diupdate`, data });
  } catch (err) {
    return fail(res, err, "PenerimaanSTPembelian Update Error");
  }
};

exports.remove = async (req, res) => {
  try {
    const data = await service.remove(noOf(req));
    return res.json({ success: true, message: `Penerimaan ST ${data.noPenerimaanST} berhasil dihapus`, data });
  } catch (err) {
    return fail(res, err, "PenerimaanSTPembelian Delete Error");
  }
};

exports.addReject = async (req, res) => {
  try {
    const data = await service.addReject(noOf(req), req.body || {});
    return res.status(201).json({ success: true, message: "Reject berhasil ditambahkan!", data });
  } catch (err) {
    return fail(res, err, "PenerimaanSTPembelian AddReject Error");
  }
};

exports.generatePdf = async (req, res) => {
  try {
    const no = noOf(req);
    const pdf = await report.generate(no, req.username);

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="ST Pembelian_${no}.pdf"`,
      "Content-Length": pdf.length,
    });
    return res.end(pdf);
  } catch (err) {
    return fail(res, err, "PenerimaanSTPembelian PDF Error");
  }
};
