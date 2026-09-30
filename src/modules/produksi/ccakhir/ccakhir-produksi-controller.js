const service = require("./ccakhir-produksi-service");

function ok(res, message, data, meta) {
  return res.status(200).json({ success: true, message, data, ...(meta || {}) });
}

function fail(res, err) {
  const status = err.status || 500;
  if (status === 500) console.error("Error produksi/ccakhir:", err);
  return res
    .status(status)
    .json({ success: false, message: status === 500 ? "Terjadi kesalahan di server" : err.message });
}

exports.getMesinList = async (req, res) => {
  try {
    const data = await service.getMesinList();
    return ok(res, "List mesin CC Akhir berhasil diambil", data);
  } catch (err) {
    return fail(res, err);
  }
};

exports.getHistory = async (req, res) => {
  try {
    const data = await service.getHistory();
    return ok(res, "Riwayat produksi CC Akhir berhasil diambil", data);
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
    const kategori = req.query.kategori || "CCA";
    const data = await service.getNextNoLabel(kategori);
    return ok(res, "NoLabel berikutnya berhasil diambil", data);
  } catch (err) {
    return fail(res, err);
  }
};

exports.getMasterOptions = async (req, res) => {
  try {
    const kategori = req.query.kategori || "CCA";
    const data = await service.getMasterOptions(kategori);
    return ok(res, "Master data berhasil diambil", data);
  } catch (err) {
    return fail(res, err);
  }
};

exports.saveHeader = async (req, res) => {
  try {
    const noProduksi = await service.saveHeader(req.body || {});
    return ok(res, "Header produksi CC Akhir berhasil disimpan", noProduksi);
  } catch (err) {
    return fail(res, err);
  }
};

exports.createLabel = async (req, res) => {
  try {
    const noLabel = await service.createLabel(req.body || {});
    return ok(res, "Label CC Akhir berhasil dibuat", noLabel);
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

exports.getHeader = async (req, res) => {
  try {
    const data = await service.getHeader(req.params.noProduksi);
    if (!data) {
      return res.status(404).json({ success: false, message: "Data header tidak ditemukan" });
    }
    return ok(res, "Header produksi CC Akhir berhasil diambil", data);
  } catch (err) {
    return fail(res, err);
  }
};

exports.updateHeader = async (req, res) => {
  try {
    const data = await service.updateHeader(req.body || {});
    return ok(res, "Header produksi CC Akhir berhasil diupdate", data);
  } catch (err) {
    return fail(res, err);
  }
};
