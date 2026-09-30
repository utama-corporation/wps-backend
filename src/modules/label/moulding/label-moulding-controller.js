const labelMouldingService = require("./label-moulding-service");
const { generateLabelPdf } = require("../../../core/utils/pdf/label-generator");
const {
  buildMouldingLabelHtml,
} = require("../../../core/utils/pdf/templates/moulding-label-pdf/moulding-label-pdf");

/**
 * GET /api/label/moulding/:nomoulding/pdf
 */
exports.generatePdf = async (req, res) => {
  try {
    const NoMoulding = String(req.params.nomoulding || "").trim();
    if (!NoMoulding) {
      return res
        .status(400)
        .json({ success: false, message: "nomoulding wajib diisi" });
    }

    const data = await labelMouldingService.getLabelData(NoMoulding);

    const pdfBuffer = await generateLabelPdf(
      { ...data, noLabel: data.noMoulding },
      buildMouldingLabelHtml,
    );

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="label-moulding-${NoMoulding}.pdf"`,
      "Content-Length": pdfBuffer.length,
    });

    return res.end(pdfBuffer);
  } catch (err) {
    console.error("Moulding PDF Error:", err);
    const status = err.statusCode || 500;
    return res.status(status).json({
      success: false,
      message: err.message || "Gagal generate PDF label Moulding",
    });
  }
};

/**
 * GET /api/label/moulding/list
 */
exports.getAllLabels = async (req, res) => {
  try {
    const { search, topRow } = req.query;
    const data = await labelMouldingService.getAllLabels({ search, topRow });
    return res.status(200).json({
      success: true,
      message: "Data label Moulding berhasil diambil",
      data,
    });
  } catch (err) {
    console.error("Moulding getAllLabels Error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Terjadi kesalahan server",
    });
  }
};

/**
 * GET /api/label/moulding/detail/:nomoulding
 */
exports.getDetailByNo = async (req, res) => {
  try {
    const noMoulding = String(req.params.nomoulding || "").trim();
    if (!noMoulding) {
      return res
        .status(400)
        .json({ success: false, message: "nomoulding wajib diisi" });
    }
    const data = await labelMouldingService.getDetailByNo(noMoulding);
    return res.status(200).json({
      success: true,
      message: "Detail label berhasil diambil",
      data,
    });
  } catch (err) {
    console.error("Moulding getDetailByNo Error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Terjadi kesalahan server",
    });
  }
};

/**
 * GET /api/label/moulding/:nomoulding/edit
 */
exports.getHeaderForEdit = async (req, res) => {
  try {
    const noMoulding = String(req.params.nomoulding || "").trim();
    if (!noMoulding) {
      return res
        .status(400)
        .json({ success: false, message: "nomoulding wajib diisi" });
    }
    const data = await labelMouldingService.getHeaderForEdit(noMoulding);
    if (!data) {
      return res
        .status(404)
        .json({ success: false, message: "Label tidak ditemukan" });
    }
    return res.status(200).json({
      success: true,
      message: "Header label berhasil diambil",
      data,
    });
  } catch (err) {
    console.error("Moulding getHeaderForEdit Error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Terjadi kesalahan server",
    });
  }
};

/**
 * GET /api/label/moulding/:nomoulding  -> data mentah label (debug / preview non-PDF).
 */
exports.getLabelData = async (req, res) => {
  try {
    const NoMoulding = String(req.params.nomoulding || "").trim();
    if (!NoMoulding) {
      return res
        .status(400)
        .json({ success: false, message: "nomoulding wajib diisi" });
    }

    const data = await labelMouldingService.getLabelData(NoMoulding);
    return res.status(200).json({
      success: true,
      message: "Data label Moulding berhasil diambil",
      data,
    });
  } catch (err) {
    console.error("Moulding Label Data Error:", err);
    const status = err.statusCode || 500;
    return res.status(status).json({
      success: false,
      message: err.message || "Terjadi kesalahan server",
    });
  }
};

/**
 * PUT /api/label/moulding/:nomoulding
 */
exports.updateLabel = async (req, res) => {
  try {
    const noMoulding = String(req.params.nomoulding || "").trim();
    if (!noMoulding) {
      return res
        .status(400)
        .json({ success: false, message: "nomoulding wajib diisi" });
    }
    const { details, ...headerData } = req.body;

    await labelMouldingService.updateLabel(noMoulding, headerData);
    if (Array.isArray(details)) {
      await labelMouldingService.updateDetail(noMoulding, details);
    }

    return res.status(200).json({
      success: true,
      message: "Label Moulding berhasil diupdate",
      data: { noMoulding },
    });
  } catch (err) {
    console.error("Moulding updateLabel Error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Gagal update label Moulding",
    });
  }
};

/**
 * DELETE /api/label/moulding/:nomoulding
 */
exports.deleteLabel = async (req, res) => {
  try {
    const noMoulding = String(req.params.nomoulding || "").trim();
    if (!noMoulding) {
      return res
        .status(400)
        .json({ success: false, message: "nomoulding wajib diisi" });
    }
    await labelMouldingService.deleteLabel(noMoulding);
    return res.status(200).json({
      success: true,
      message: "Label Moulding berhasil dihapus",
      data: { noMoulding },
    });
  } catch (err) {
    console.error("Moulding deleteLabel Error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Gagal menghapus label Moulding",
    });
  }
};
