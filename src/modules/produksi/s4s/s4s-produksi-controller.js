const service = require("./s4s-produksi-service");
const {
  makeProduksiReportPdf,
} = require("../produksi-report-controller");
const { REPORT_CONFIGS } = require("../produksi-report-service");

// Cetak laporan per No. Produksi memakai report microservice yang sama dengan
// aplikasi desktop (FrmProsesS4S: LblLapProduksiPerNomorProduksi), bukan PDF
// buatan sendiri. VB: "{ApiReportURL}/proses-produksi/produksi-s4s-per-nomor-produksi/pdf?no_produksi=..."
// Override host via REPORT_MICROSERVICE_URL (mis. "http://192.168.10.100:5006").
const REPORT_BASE = (process.env.REPORT_MICROSERVICE_URL || `http://${process.env.DB_SERVER}:5006`).replace(/\/+$/, "");

function ok(res, message, data, meta) {
  return res.status(200).json({ success: true, message, data, ...(meta || {}) });
}

function fail(res, err) {
  const status = err.status || 500;
  if (status === 500) console.error("Error produksi/s4s:", err);
  return res
    .status(status)
    .json({ success: false, message: status === 500 ? "Terjadi kesalahan di server" : err.message });
}

exports.getMesinList = async (req, res) => {
  try {
    const data = await service.getMesinList();
    return ok(res, "List mesin S4S berhasil diambil", data);
  } catch (err) {
    return fail(res, err);
  }
};

exports.getHistory = async (req, res) => {
  try {
    const data = await service.getHistory(req.query || {});
    return ok(res, "Riwayat produksi S4S berhasil diambil", data);
  } catch (err) {
    return fail(res, err);
  }
};

exports.getDetail = async (req, res) => {
  try {
    const data = await service.getDetail(req.params.noProduksi);
    return ok(res, "Detail produksi S4S berhasil diambil", data);
  } catch (err) {
    return fail(res, err);
  }
};

exports.getStok = async (req, res) => {
  try {
    const data = await service.getStok(req.query.tipe);
    return ok(res, "Stok label berhasil diambil", data);
  } catch (err) {
    return fail(res, err);
  }
};

exports.getStokLabels = async (req, res) => {
  try {
    const data = await service.getStokLabels(req.query.tipe, req.query.idJenis);
    return ok(res, "Daftar label stok berhasil diambil", data);
  } catch (err) {
    return fail(res, err);
  }
};

exports.updateHeader = async (req, res) => {
  try {
    const data = await service.updateHeader(req.params.noProduksi, req.body || {});
    return ok(res, "Header produksi S4S berhasil diperbarui", data);
  } catch (err) {
    return fail(res, err);
  }
};

exports.deleteHeader = async (req, res) => {
  try {
    const data = await service.deleteHeader(req.params.noProduksi);
    return ok(res, "Produksi S4S berhasil dihapus", data);
  } catch (err) {
    return fail(res, err);
  }
};

exports.gantiHeader = async (req, res) => {
  try {
    const data = await service.gantiHeader(req.params.noProduksi, req.body || {});
    return ok(res, data.createdNew
      ? `Ganti produksi berhasil — nomor baru ${data.noProduksi}`
      : "Ganti produksi berhasil", data);
  } catch (err) {
    return fail(res, err);
  }
};

exports.getNextNoProduksi = async (req, res) => {
  try {
    const data = await service.getNextNoProduksi();
    return ok(res, "NoProduksi berikutnya berhasil diambil", data);
  } catch (err) {
    return fail(res, err);
  }
};

exports.getNextNoLabel = async (req, res) => {
  try {
    const data = await service.getNextNoLabel();
    return ok(res, "NoS4S berikutnya berhasil diambil", data);
  } catch (err) {
    return fail(res, err);
  }
};

exports.getMasterOptions = async (req, res) => {
  try {
    const data = await service.getMasterOptions();
    return ok(res, "Master data berhasil diambil", data);
  } catch (err) {
    return fail(res, err);
  }
};

exports.getOperators = async (req, res) => {
  try {
    const data = await service.getOperators();
    return ok(res, "List operator berhasil diambil", data);
  } catch (err) {
    return fail(res, err);
  }
};

exports.saveHeader = async (req, res) => {
  try {
    const noProduksi = await service.saveHeader(req.body || {});
    return ok(res, "Header produksi S4S berhasil disimpan", noProduksi);
  } catch (err) {
    return fail(res, err);
  }
};

exports.createLabel = async (req, res) => {
  try {
    // IdOrgTelly diambil dari user login (req.idUsername dari verify-token).
    const noS4S = await service.createLabel({
      ...(req.body || {}),
      idUsername: req.idUsername,
    });
    return ok(res, "Label S4S berhasil dibuat", noS4S);
  } catch (err) {
    return fail(res, err);
  }
};

exports.getOrgTelly = async (req, res) => {
  try {
    const data = await service.getOrgTelly(req.idUsername);
    return ok(res, "Telly user berhasil diambil", data);
  } catch (err) {
    return fail(res, err);
  }
};

exports.simpanInput = async (req, res) => {
  try {
    const data = await service.simpanInput(req.body || {});
    return ok(res, `${data.saved} input label disimpan`, data);
  } catch (err) {
    return fail(res, err);
  }
};

exports.batalInput = async (req, res) => {
  try {
    const data = await service.batalInput(req.body || {});
    return ok(res, `${data.batal} input label dibatalkan`, data);
  } catch (err) {
    return fail(res, err);
  }
};

exports.addInput = async (req, res) => {
  try {
    const data = await service.addInput(req.body || {});
    return ok(res, "Input label berhasil ditambahkan", data);
  } catch (err) {
    return fail(res, err);
  }
};

exports.getInputList = async (req, res) => {
  try {
    const data = await service.getInputList(req.params || {});
    return ok(res, "", data);
  } catch (err) {
    return fail(res, err);
  }
}

exports.removeInput = async (req, res) => {
  try {
    const data = await service.removeInput(req.body || {});
    return ok(res, "Input label berhasil dihapus", data);
  } catch (err) {
    return fail(res, err);
  }
};

exports.addOutput = async (req, res) => {
  try {
    const data = await service.addOutput(req.body || {});
    return ok(res, "Output label berhasil ditautkan", data);
  } catch (err) {
    return fail(res, err);
  }
};

exports.removeOutput = async (req, res) => {
  try {
    const data = await service.removeOutput(req.body || {});
    return ok(res, "Output label berhasil dihapus", data);
  } catch (err) {
    return fail(res, err);
  }
};

exports.generateProduksiReportPdf = makeProduksiReportPdf(REPORT_CONFIGS.s4s);

exports.addReject = async (req, res) => {
  try {
    const data = await service.addReject(req.body || {});
    return ok(res, "Reject produksi berhasil disimpan", data);
  } catch (err) {
    return fail(res, err);
  }
};

exports.removeReject = async (req, res) => {
  try {
    const data = await service.removeReject(req.body || {});
    return ok(res, "Reject produksi berhasil dihapus", data);
  } catch (err) {
    return fail(res, err);
  }
};

// GET /laporan?noProduksi=RA.000000 → PDF Laporan Produksi S4S per No. Produksi (inline).
exports.getLaporan = async (req, res) => {
  try {
    const no = req.query.noProduksi;
    if (!no) return res.status(400).json({ success: false, message: "Nomor produksi wajib diisi" });

    // Microservice memvalidasi JWT yang sama (tablet/desktop mengirim Bearer token login).
    const upstream = await fetch(
      `${REPORT_BASE}/api/reports/proses-produksi/produksi-s4s-per-nomor-produksi/pdf?no_produksi=${encodeURIComponent(no)}`,
      { headers: { Authorization: req.headers.authorization || "", Accept: "application/pdf" } },
    );
    if (!upstream.ok) {
      let message = `Gagal membuat laporan (${upstream.status})`;
      try {
        const body = await upstream.json();
        message = body.message || body.Message || message;
      } catch {
        // body bukan JSON — pakai pesan default
      }
      return res.status(upstream.status === 404 || upstream.status === 422 ? upstream.status : 502).json({ success: false, message });
    }
    const pdf = Buffer.from(await upstream.arrayBuffer());
    const file = `laporan-produksi-s4s-${no}.pdf`.replace(/[^\w.-]/g, "_");
    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${file}"`,
      "Content-Length": pdf.length,
    });
    res.end(pdf);
  } catch (err) {
    console.error("Error laporan produksi S4S:", err);
    res.status(500).json({ success: false, message: "Gagal membuat laporan" });
  }
};
