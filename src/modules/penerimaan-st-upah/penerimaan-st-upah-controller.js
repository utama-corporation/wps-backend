const service = require("./penerimaan-st-upah-service");

// Cetak memakai service laporan (open-api-report). Autentikasi: token JWT user diteruskan apa adanya.
// Pola sama dengan proxy lain ke service ini: GET dengan query (?NoUpah=<no>).
// Override host via REPORT_API_ST_UPAH_URL.
const REPORT_URL =
  process.env.REPORT_API_ST_UPAH_URL ||
  "http://192.168.10.100:5006/api/reports/sawn-timber/penerimaan-st-upah/pdf";

const fail = (res, err, label) => {
  console.error(`${label}:`, err);
  return res.status(err.statusCode || 500).json({
    success: false,
    message: err.message || "Terjadi kesalahan server",
  });
};

const noOf = (req) => String(req.params.no || "").trim();

exports.getAll = async (req, res) => {
  try {
    const data = await service.getAll({ search: req.query.search });
    return res.json({ success: true, message: "List penerimaan ST upah berhasil diambil", data });
  } catch (err) {
    return fail(res, err, "PenerimaanSTUpah List Error");
  }
};

exports.getMasters = async (_req, res) => {
  try {
    const customer = await service.getCustomers();
    return res.json({ success: true, message: "Masters berhasil diambil", data: { customer } });
  } catch (err) {
    return fail(res, err, "PenerimaanSTUpah Masters Error");
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
    return fail(res, err, "PenerimaanSTUpah Get Error");
  }
};

exports.getLabels = async (req, res) => {
  try {
    const data = await service.getLabels(noOf(req));
    return res.json({ success: true, message: "Label ST berhasil diambil", data });
  } catch (err) {
    return fail(res, err, "PenerimaanSTUpah Labels Error");
  }
};

exports.create = async (req, res) => {
  try {
    const data = await service.create(req.body || {});
    return res.status(201).json({
      success: true,
      message: `Berhasil disimpan dengan No. Upah ${data.noPenerimaanST}`,
      data,
    });
  } catch (err) {
    return fail(res, err, "PenerimaanSTUpah Create Error");
  }
};

exports.update = async (req, res) => {
  try {
    const data = await service.update(noOf(req), req.body || {});
    return res.json({ success: true, message: `Penerimaan ST ${data.noPenerimaanST} berhasil diupdate`, data });
  } catch (err) {
    return fail(res, err, "PenerimaanSTUpah Update Error");
  }
};

exports.remove = async (req, res) => {
  try {
    const data = await service.remove(noOf(req));
    return res.json({ success: true, message: `Penerimaan ST ${data.noPenerimaanST} berhasil dihapus`, data });
  } catch (err) {
    return fail(res, err, "PenerimaanSTUpah Delete Error");
  }
};

exports.generatePdf = async (req, res) => {
  try {
    const no = noOf(req);
    const header = await service.getByNo(no);
    if (!header) {
      return res.status(404).json({ success: false, message: "Penerimaan ST tidak ditemukan" });
    }

    const upstream = await fetch(
      `${REPORT_URL}?NoUpah=${encodeURIComponent(no)}`,
      {
        headers: {
          Accept: "application/pdf",
          Authorization: req.header("Authorization") || "",
        },
      },
    );
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
      "Content-Disposition": `inline; filename="ST Upah_${no}.pdf"`,
      "Content-Length": pdf.length,
    });
    return res.end(pdf);
  } catch (err) {
    return fail(res, err, "PenerimaanSTUpah PDF Error");
  }
};
