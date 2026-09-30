const labelLmtService = require("./label-lmt-service");
const { generateLabelPdf } = require("../../../core/utils/pdf/label-generator");
const {
  buildLmtLabelHtml,
} = require("../../../core/utils/pdf/templates/lmt-label-pdf/lmt-label-pdf");

/**
 * GET /api/label/lmt/:nolmt/pdf
 */
exports.generatePdf = async (req, res) => {
  try {
    const NoLmt = String(req.params.nolmt || "").trim();
    if (!NoLmt) {
      return res
        .status(400)
        .json({ success: false, message: "nolmt wajib diisi" });
    }

    const data = await labelLmtService.getLabelData(NoLmt);

    const pdfBuffer = await generateLabelPdf(
      { ...data, noLabel: data.noLmt },
      buildLmtLabelHtml,
    );

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="label-lmt-${NoLmt}.pdf"`,
      "Content-Length": pdfBuffer.length,
    });

    return res.end(pdfBuffer);
  } catch (err) {
    console.error("Lmt PDF Error:", err);
    const status = err.statusCode || 500;
    return res.status(status).json({
      success: false,
      message: err.message || "Gagal generate PDF label Lmt",
    });
  }
};

/**
 * GET /api/label/lmt/list
 */
exports.getAllLabels = async (req, res) => {
  try {
    const { search, topRow } = req.query;
    const data = await labelLmtService.getAllLabels({ search, topRow });
    return res.status(200).json({
      success: true,
      message: "Data label Laminating berhasil diambil",
      data,
    });
  } catch (err) {
    console.error("Lmt getAllLabels Error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Terjadi kesalahan server",
    });
  }
};

/**
 * GET /api/label/lmt/detail/:nolmt
 */
exports.getDetailByNo = async (req, res) => {
  try {
    const noLmt = String(req.params.nolmt || "").trim();
    if (!noLmt) {
      return res
        .status(400)
        .json({ success: false, message: "nolmt wajib diisi" });
    }
    const data = await labelLmtService.getDetailByNo(noLmt);
    return res.status(200).json({
      success: true,
      message: "Detail label berhasil diambil",
      data,
    });
  } catch (err) {
    console.error("Lmt getDetailByNo Error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Terjadi kesalahan server",
    });
  }
};

/**
 * GET /api/label/lmt/:nolmt/edit
 */
exports.getHeaderForEdit = async (req, res) => {
  try {
    const noLmt = String(req.params.nolmt || "").trim();
    if (!noLmt) {
      return res
        .status(400)
        .json({ success: false, message: "nolmt wajib diisi" });
    }
    const data = await labelLmtService.getHeaderForEdit(noLmt);
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
    console.error("Lmt getHeaderForEdit Error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Terjadi kesalahan server",
    });
  }
};

/**
 * GET /api/label/lmt/:nolmt  -> data mentah label (debug/preview).
 */
exports.getLabelData = async (req, res) => {
  try {
    const NoLmt = String(req.params.nolmt || "").trim();
    if (!NoLmt) {
      return res
        .status(400)
        .json({ success: false, message: "nolmt wajib diisi" });
    }

    const data = await labelLmtService.getLabelData(NoLmt);
    return res.status(200).json({
      success: true,
      message: "Data label Lmt berhasil diambil",
      data,
    });
  } catch (err) {
    console.error("Lmt Label Data Error:", err);
    const status = err.statusCode || 500;
    return res.status(status).json({
      success: false,
      message: err.message || "Terjadi kesalahan server",
    });
  }
};

/**
 * PUT /api/label/lmt/:nolmt
 */
exports.updateLabel = async (req, res) => {
  try {
    const noLmt = String(req.params.nolmt || "").trim();
    if (!noLmt) {
      return res
        .status(400)
        .json({ success: false, message: "nolmt wajib diisi" });
    }
    const { details, ...headerData } = req.body;

    await labelLmtService.updateLabel(noLmt, headerData);
    if (Array.isArray(details)) {
      await labelLmtService.updateDetail(noLmt, details);
    }

    return res.status(200).json({
      success: true,
      message: "Label Laminating berhasil diupdate",
      data: { noLmt },
    });
  } catch (err) {
    console.error("Lmt updateLabel Error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Gagal update label Laminating",
    });
  }
};

/**
 * DELETE /api/label/lmt/:nolmt
 */
exports.deleteLabel = async (req, res) => {
  try {
    const noLmt = String(req.params.nolmt || "").trim();
    if (!noLmt) {
      return res
        .status(400)
        .json({ success: false, message: "nolmt wajib diisi" });
    }
    await labelLmtService.deleteLabel(noLmt);
    return res.status(200).json({
      success: true,
      message: "Label Laminating berhasil dihapus",
      data: { noLmt },
    });
  } catch (err) {
    console.error("Lmt deleteLabel Error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Gagal menghapus label Laminating",
    });
  }
};
