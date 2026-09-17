const labelStService = require("./label-st-service");

/**
 * GET /api/label/st/list -> list semua label ST
 */
exports.getAllLabels = async (req, res) => {
  try {
    const search = req.query.search || "";
    const topRow = req.query.top || "100";
    const data = await labelStService.getAllLabels({ search, topRow });
    return res.status(200).json({
      success: true,
      message: "List label ST berhasil diambil",
      data,
    });
  } catch (err) {
    console.error("ST List Error:", err);
    const status = err.statusCode || 500;
    return res.status(status).json({
      success: false,
      message: err.message || "Terjadi kesalahan server",
    });
  }
};

/**
 * GET /api/label/st/detail/:nost -> detail by no ST
 */
exports.getDetailByNo = async (req, res) => {
  try {
    const noST = String(req.params.nost || "").trim();
    if (!noST) {
      return res
        .status(400)
        .json({ success: false, message: "nost wajib diisi" });
    }

    const data = await labelStService.getDetailByNo(noST);
    return res.status(200).json({
      success: true,
      message: "Detail label ST berhasil diambil",
      data,
    });
  } catch (err) {
    console.error("ST Detail Error:", err);
    const status = err.statusCode || 500;
    return res.status(status).json({
      success: false,
      message: err.message || "Terjadi kesalahan server",
    });
  }
};

/**
 * GET /api/label/st/:nost/edit -> header data with IDs for editing
 */
exports.getHeaderForEdit = async (req, res) => {
  try {
    const noST = String(req.params.nost || "").trim();
    if (!noST) {
      return res
        .status(400)
        .json({ success: false, message: "nost wajib diisi" });
    }

    const data = await labelStService.getHeaderForEdit(noST);
    if (!data) {
      return res
        .status(404)
        .json({ success: false, message: "Label ST tidak ditemukan" });
    }

    return res.status(200).json({
      success: true,
      message: "Data header ST berhasil diambil",
      data,
    });
  } catch (err) {
    console.error("ST Header Edit Error:", err);
    const status = err.statusCode || 500;
    return res.status(status).json({
      success: false,
      message: err.message || "Terjadi kesalahan server",
    });
  }
};

/**
 * GET /api/label/st/:nost -> data mentah label
 */
exports.getLabelData = async (req, res) => {
  try {
    const noST = String(req.params.nost || "").trim();
    if (!noST) {
      return res
        .status(400)
        .json({ success: false, message: "nost wajib diisi" });
    }

    const header = await labelStService.getHeader(noST);
    if (!header) {
      return res
        .status(404)
        .json({ success: false, message: "Label ST tidak ditemukan" });
    }

    const detail = await labelStService.getDetail(noST);
    const stick = await labelStService.getStick(noST);

    return res.status(200).json({
      success: true,
      message: "Data label ST berhasil diambil",
      data: { header, detail, stick },
    });
  } catch (err) {
    console.error("ST Label Data Error:", err);
    const status = err.statusCode || 500;
    return res.status(status).json({
      success: false,
      message: err.message || "Terjadi kesalahan server",
    });
  }
};

/**
 * PUT /api/label/st/:nost -> update label
 */
exports.updateLabel = async (req, res) => {
  try {
    const noST = String(req.params.nost || "").trim();
    if (!noST) {
      return res
        .status(400)
        .json({ success: false, message: "nost wajib diisi" });
    }

    await labelStService.updateLabel(noST, req.body);

    if (req.body.details && Array.isArray(req.body.details)) {
      await labelStService.updateDetail(noST, req.body.details);
    }

    if (req.body.sticks && Array.isArray(req.body.sticks)) {
      await labelStService.updateStick(noST, req.body.sticks);
    }

    return res.status(200).json({
      success: true,
      message: `Label ST ${noST} berhasil diupdate`,
      data: { noST },
    });
  } catch (err) {
    console.error("ST Update Error:", err);
    const status = err.statusCode || 500;
    return res.status(status).json({
      success: false,
      message: err.message || "Terjadi kesalahan server",
    });
  }
};

/**
 * DELETE /api/label/st/:nost -> delete label
 */
exports.deleteLabel = async (req, res) => {
  try {
    const noST = String(req.params.nost || "").trim();
    if (!noST) {
      return res
        .status(400)
        .json({ success: false, message: "nost wajib diisi" });
    }

    await labelStService.deleteLabel(noST);
    return res.status(200).json({
      success: true,
      message: `Label ST ${noST} berhasil dihapus`,
      data: { noST },
    });
  } catch (err) {
    console.error("ST Delete Error:", err);
    const status = err.statusCode || 500;
    return res.status(status).json({
      success: false,
      message: err.message || "Terjadi kesalahan server",
    });
  }
};
