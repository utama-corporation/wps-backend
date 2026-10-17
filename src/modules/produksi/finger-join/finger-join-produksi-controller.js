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

async function getMesinList(req, res) {
  try {
    const data = await service.getMesinList();
    return ok(res, "List mesin Finger Join berhasil diambil", data);
  } catch (err) {
    return fail(res, err);
  }
}

async function getHistory(req, res) {
  try {
    const data = await service.getHistory();
    return ok(res, "Riwayat produksi Finger Join berhasil diambil", data);
  } catch (err) {
    return fail(res, err);
  }
}

async function getNextNoProduksi(req, res) {
  try {
    const data = await service.getNextNoProduksi();
    return ok(res, "NoProduksi berikutnya berhasil diambil", data);
  } catch (err) {
    return fail(res, err);
  }
}

async function getNextNoLabel(req, res) {
  try {
    const data = await service.getNextNoLabel();
    return ok(res, "NoFJ berikutnya berhasil diambil", data);
  } catch (err) {
    return fail(res, err);
  }
}

async function getMasterOptions(req, res) {
  try {
    const data = await service.getMasterOptions();
    return ok(res, "Master data berhasil diambil", data);
  } catch (err) {
    return fail(res, err);
  }
}

async function saveHeader(req, res) {
  try {
    const data = await service.saveHeader(req.body || {});
    return ok(res, "Header produksi Finger Join berhasil disimpan", data);
  } catch (err) {
    return fail(res, err);
  }
}

async function getHeader(req, res) {
  try {
    const data = await service.getHeader(req.params.noProduksi);
    if (!data) {
      return res.status(404).json({ success: false, message: "Data header tidak ditemukan" });
    }
    return ok(res, "Header berhasil diambil", data);
  } catch (err) {
    return fail(res, err);
  }
}

async function updateHeader(req, res) {
  try {
    const data = await service.updateHeader(req.body || {});
    return ok(res, "Header berhasil diupdate", data);
  } catch (err) {
    return fail(res, err);
  }
}

async function createLabel(req, res) {
  try {
    const data = await service.createLabel(req.body || {});
    return ok(res, "Label berhasil dibuat", data);
  } catch (err) {
    return fail(res, err);
  }
}

async function addInput(req, res) {
  try {
    const data = await service.addInput(req.body || {});
    return ok(res, "Input ditambahkan", data);
  } catch (err) {
    return fail(res, err);
  }
}

async function removeInput(req, res) {
  try {
    const data = await service.removeInput(req.body || {});
    return ok(res, "Input dihapus", data);
  } catch (err) {
    return fail(res, err);
  }
}

async function addOutput(req, res) {
  try {
    const data = await service.addOutput(req.body || {});
    return ok(res, "Output ditambahkan", data);
  } catch (err) {
    return fail(res, err);
  }
}

async function removeOutput(req, res) {
  try {
    const data = await service.removeOutput(req.body || {});
    return ok(res, "Output dihapus", data);
  } catch (err) {
    return fail(res, err);
  }
}

// Laporan produksi FJ sekarang memakai handler generik yang sama dengan proses
// lain (lihat ../produksi-report-controller.js).
const generateProduksiReportPdf = makeProduksiReportPdf(
  REPORT_CONFIGS["finger-join"],
);

module.exports = {
  getMesinList,
  getHistory,
  getNextNoProduksi,
  getNextNoLabel,
  getMasterOptions,
  saveHeader,
  getHeader,
  updateHeader,
  createLabel,
  addInput,
  removeInput,
  addOutput,
  removeOutput,
  generateProduksiReportPdf,
};
