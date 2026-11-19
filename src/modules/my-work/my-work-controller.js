const service = require("./my-work-service");

exports.summary = async (req, res) => {
  try {
    const data = await service.getSummary({ permissions: req.userPermissions });
    res.json({ success: true, data });
  } catch (err) {
    console.error("Error my-work summary:", err);
    res.status(500).json({ success: false, message: "Terjadi kesalahan di server" });
  }
};

exports.list = async (req, res) => {
  const category = String(req.query.category || "").trim();
  if (!category) {
    return res.status(400).json({ success: false, message: "Parameter category wajib diisi." });
  }
  try {
    const result = await service.getList({
      permissions: req.userPermissions,
      category,
      page: req.query.page,
      perPage: req.query.per_page,
    });
    if (!result) {
      return res
        .status(404)
        .json({ success: false, message: "Kategori tidak ditemukan atau tidak diizinkan." });
    }
    res.json({ success: true, data: result.data, meta: result.meta });
  } catch (err) {
    console.error("Error my-work list:", err);
    res.status(500).json({ success: false, message: "Terjadi kesalahan di server" });
  }
};
