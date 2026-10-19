const service = require("./finger-join-produksi-service");
const {
  makeProduksiReportPdf,
} = require("../produksi-report-controller");
const { REPORT_CONFIGS } = require("../produksi-report-service");

function ok(res, message, data, meta) {
  return res.status(200).json({ success: true, message, data, ...(meta || {}) });
}

function fail(res, err) {
  const status = err.status || 500;
  if (status === 500) console.error("Error produksi/finger-join:", err);
  return res
    .status(status)
    .json({ success: false, message: status === 500 ? "Terjadi kesalahan di server" : err.message });
}

exports.getMesinList = async (req, res) => {
  try {
    const data = await service.getMesinList();
    return ok(res, "List mesin Finger Join berhasil diambil", data);
  } catch (err) {
    return fail(res, err);
  }
};

exports.getHistory = async (req, res) => {
  try {
    const data = await service.getHistory(req.query || {});
    return ok(res, "Riwayat produksi Finger Join berhasil diambil", data);
  } catch (err) {
    return fail(res, err);
  }
};

exports.getDetail = async (req, res) => {
  try {
    const data = await service.getDetail(req.params.noProduksi);
    return ok(res, "Detail produksi Finger Join berhasil diambil", data);
  } catch (err) {
    return fail(res, err);
  }
};

exports.getHeader = async (req, res) => {
  try {
    const data = await service.getHeader(req.params.noProduksi);
    return ok(res, "Header produksi Finger Join berhasil diambil", data);
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
    return ok(res, "NoFJ berikutnya berhasil diambil", data);
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
    return ok(res, "Header produksi Finger Join berhasil disimpan", noProduksi);
  } catch (err) {
    return fail(res, err);
  }
};

exports.updateHeader = async (req, res) => {
  try {
    const data = await service.updateHeader(req.params.noProduksi, req.body || {});
    return ok(res, "Header produksi Finger Join berhasil diperbarui", data);
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

exports.deleteHeader = async (req, res) => {
  try {
    const data = await service.deleteHeader(req.params.noProduksi);
    return ok(res, "Produksi Finger Join berhasil dihapus", data);
  } catch (err) {
    return fail(res, err);
  }
};

exports.createLabel = async (req, res) => {
  try {
    // IdOrgTelly diambil dari user login (req.idUsername dari verify-token).
    const noFJ = await service.createLabel({
      ...(req.body || {}),
      idUsername: req.idUsername,
    });
    return ok(res, "Label Finger Join berhasil dibuat", noFJ);
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

// Laporan produksi FJ memakai handler generik yang sama dengan proses lain
// (lihat ../produksi-report-controller.js).
exports.generateProduksiReportPdf = makeProduksiReportPdf(
  REPORT_CONFIGS["finger-join"],
);
