const service = require("./penerimaan-st-pembelian-service");

// Cetak memakai service laporan (open-api-report). Autentikasi: token JWT user diteruskan apa adanya.
// Override via REPORT_API_ST_PEMBELIAN_URL.
const REPORT_URL =
  process.env.REPORT_API_ST_PEMBELIAN_URL ||
  "http://192.168.10.100:5006/api/reports/sawn-timber/penerimaan-st-pembelian-ton/pdf";

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
    const header = await service.getByNo(no);
    if (!header) {
      return res.status(404).json({ success: false, message: "Penerimaan ST tidak ditemukan" });
    }

    const upstream = await fetch(REPORT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/pdf",
        Authorization: req.header("Authorization") || "",
      },
      body: JSON.stringify({ NoPenerimaanST: no }),
    });
    if (!upstream.ok) {
      let message = `Gagal membuat laporan (${upstream.status})`;
      try {
        const body = await upstream.json();
        message = body.message || body.Message || message;
      } catch {
        // body bukan JSON — pakai pesan default
      }
      // 401 dari service laporan sengaja jadi 502 supaya frontend tidak mengira sesi user habis.
      const status = upstream.status === 404 || upstream.status === 422 ? upstream.status : 502;
      return res.status(status).json({ success: false, message });
    }
    const pdf = Buffer.from(await upstream.arrayBuffer());

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
