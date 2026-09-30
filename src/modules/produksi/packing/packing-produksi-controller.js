const service = require("./packing-produksi-service");

function ok(res, message, data, meta) {
  return res.status(200).json({ success: true, message, data, ...(meta || {}) });
}

function fail(res, err) {
  const status = err.status || 500;
  if (status === 500) console.error("Error produksi/packing:", err);
  return res
    .status(status)
    .json({ success: false, message: status === 500 ? "Terjadi kesalahan di server" : err.message });
}

exports.getMesinList = async (req, res) => {
  try {
    const data = await service.getMesinList();
    return ok(res, "List mesin Packing berhasil diambil", data);
  } catch (err) {
    return fail(res, err);
  }
};

exports.getHistory = async (req, res) => {
  try {
    const data = await service.getHistory();
    return ok(res, "Riwayat produksi Packing berhasil diambil", data);
  } catch (err) {
    return fail(res, err);
  }
};

exports.getNextNoProduksi = async (req, res) => {
  try {
    const value = await service.getNextNoProduksi();
    return ok(res, "No. produksi berikutnya berhasil diambil", { NoProduksi: value });
  } catch (err) {
    return fail(res, err);
  }
};

exports.getNextNoLabel = async (req, res) => {
  try {
    const value = await service.getNextNoLabel();
    return ok(res, "No. label berikutnya berhasil diambil", { NoBJ: value });
  } catch (err) {
    return fail(res, err);
  }
};

exports.getMasterOptions = async (req, res) => {
  try {
    const data = await service.getMasterOptions();
    return ok(res, "Opsi master berhasil diambil", data);
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
    return ok(res, "Header produksi Packing berhasil diambil", data);
  } catch (err) {
    return fail(res, err);
  }
};

exports.updateHeader = async (req, res) => {
  try {
    const data = await service.updateHeader(req.body || {});
    return ok(res, "Header produksi Packing berhasil diupdate", data);
  } catch (err) {
    return fail(res, err);
  }
};

exports.saveHeader = async (req, res) => {
  try {
    const noProduksi = await service.saveHeader(req.body);
    return ok(res, "Header berhasil disimpan", { noProduksi });
  } catch (err) {
    return fail(res, err);
  }
};

exports.createLabel = async (req, res) => {
  try {
    const noBJ = await service.createLabel(req.body);
    return ok(res, "Label berhasil disimpan", { noBJ });
  } catch (err) {
    return fail(res, err);
  }
};

exports.addInput = async (req, res) => {
  try {
    const result = await service.addInput(req.body);
    return ok(res, "Input berhasil ditambahkan", result);
  } catch (err) {
    return fail(res, err);
  }
};

exports.removeInput = async (req, res) => {
  try {
    const result = await service.removeInput(req.body);
    return ok(res, "Input berhasil dihapus", result);
  } catch (err) {
    return fail(res, err);
  }
};

exports.addOutput = async (req, res) => {
  try {
    const result = await service.addOutput(req.body);
    return ok(res, "Output berhasil ditambahkan", result);
  } catch (err) {
    return fail(res, err);
  }
};

exports.removeOutput = async (req, res) => {
  try {
    const result = await service.removeOutput(req.body);
    return ok(res, "Output berhasil dihapus", result);
  } catch (err) {
    return fail(res, err);
  }
};
