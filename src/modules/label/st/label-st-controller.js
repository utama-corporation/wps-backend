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
      await labelStService.updateStick(noST, req.body.sticks, req.body.idStickBy || null);
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

/**
 * GET /api/label/st/generate-no -> auto-generate NoST
 */
exports.generateNoST = async (req, res) => {
  try {
    const noST = await labelStService.generateNoST();
    return res.status(200).json({
      success: true,
      message: "NoST berhasil digenerate",
      data: { noST },
    });
  } catch (err) {
    console.error("ST GenerateNo Error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Terjadi kesalahan server",
    });
  }
};

/**
 * GET /api/label/st/lookup-nokb/:nokb -> lookup from KayuBulat_h
 */
exports.lookupNoKB = async (req, res) => {
  try {
    const noKB = String(req.params.nokb || "").trim();
    if (!noKB) {
      return res
        .status(400)
        .json({ success: false, message: "nokb wajib diisi" });
    }

    const data = await labelStService.lookupNoKB(noKB);
    if (!data) {
      return res.status(404).json({
        success: false,
        message: "NoKB tidak ditemukan di KayuBulat_h",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Lookup NoKB berhasil",
      data,
    });
  } catch (err) {
    console.error("ST LookupNoKB Error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Terjadi kesalahan server",
    });
  }
};

/**
 * POST /api/label/st -> create new label ST
 */
exports.createLabel = async (req, res) => {
  try {
    const data = req.body;
    if (!data.noST) {
      return res
        .status(400)
        .json({ success: false, message: "noST wajib diisi" });
    }

    const result = await labelStService.createLabel(data);
    return res.status(201).json({
      success: true,
      message: `Label ST ${result.noST} berhasil dibuat`,
      data: result,
    });
  } catch (err) {
    console.error("ST Create Error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Terjadi kesalahan server",
    });
  }
};

/**
 * GET /api/label/st/masters -> all combo data
 */
exports.getMasters = async (req, res) => {
  try {
    const data = await labelStService.getMasters();
    return res.status(200).json({
      success: true,
      message: "Masters berhasil diambil",
      data,
    });
  } catch (err) {
    console.error("ST Masters Error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Terjadi kesalahan server",
    });
  }
};
