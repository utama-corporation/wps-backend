const service = require("./penerimaan-st-upah-service");

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
