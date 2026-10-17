const service = require("./penerimaan-st-sawmill-service");

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
    return res.json({ success: true, message: "List penerimaan ST sawmill berhasil diambil", data });
  } catch (err) {
    return fail(res, err, "PenerimaanSTSawmill List Error");
  }
};

exports.getSTSawmillList = async (req, res) => {
  try {
    const data = await service.getSTSawmillList(noOf(req));
    return res.json({ success: true, message: "Daftar ST Sawmill berhasil diambil", data });
  } catch (err) {
    return fail(res, err, "PenerimaanSTSawmill Detail Error");
  }
};

exports.remove = async (req, res) => {
  try {
    const data = await service.remove(noOf(req));
    return res.json({ success: true, message: "Data berhasil dihapus", data });
  } catch (err) {
    return fail(res, err, "PenerimaanSTSawmill Delete Error");
  }
};
