const labelS4sService = require("./label-s4s-service");
const { generateLabelPdf } = require("../../../core/utils/pdf/label-generator");
const {
  buildS4sLabelHtml,
} = require("../../../core/utils/pdf/templates/s4s-label-pdf/s4s-label-pdf");

/**
 * GET /api/labels/s4s/:nos4s/pdf
 */
exports.generatePdf = async (req, res) => {
  try {
    const NoS4S = String(req.params.nos4s || "").trim();
    if (!NoS4S) {
      return res
        .status(400)
        .json({ success: false, message: "nos4s wajib diisi" });
    }

    const data = await labelS4sService.getLabelData(NoS4S);
    const pdfBuffer = await generateLabelPdf(
      { ...data, noLabel: data.noS4S },
      buildS4sLabelHtml,
    );

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="label-s4s-${NoS4S}.pdf"`,
      "Content-Length": pdfBuffer.length,
    });

    return res.end(pdfBuffer);
  } catch (err) {
    console.error("S4S PDF Error:", err);
    const status = err.statusCode || 500;
    return res.status(status).json({
      success: false,
      message: err.message || "Gagal generate PDF label S4S",
    });
  }
};

/**
 * GET /api/label/s4s/:nos4s -> data mentah label
 */
exports.getLabelData = async (req, res) => {
  try {
    const NoS4S = String(req.params.nos4s || "").trim();
    if (!NoS4S) {
      return res
        .status(400)
        .json({ success: false, message: "nos4s wajib diisi" });
    }

    const data = await labelS4sService.getLabelData(NoS4S);
    return res.status(200).json({
      success: true,
      message: "Data label S4S berhasil diambil",
      data,
    });
  } catch (err) {
    console.error("S4S Label Data Error:", err);
    const status = err.statusCode || 500;
    return res.status(status).json({
      success: false,
      message: err.message || "Terjadi kesalahan server",
    });
  }
};

/**
 * GET /api/label/s4s/:nos4s/edit -> header data with IDs for editing
 */
exports.getHeaderForEdit = async (req, res) => {
  try {
    const NoS4S = String(req.params.nos4s || "").trim();
    if (!NoS4S) {
      return res
        .status(400)
        .json({ success: false, message: "nos4s wajib diisi" });
    }

    const data = await labelS4sService.getHeaderForEdit(NoS4S);
    if (!data) {
      return res
        .status(404)
        .json({ success: false, message: "Label S4S tidak ditemukan" });
    }

    return res.status(200).json({
      success: true,
      message: "Data header S4S berhasil diambil",
      data,
    });
  } catch (err) {
    console.error("S4S Header Edit Error:", err);
    const status = err.statusCode || 500;
    return res.status(status).json({
      success: false,
      message: err.message || "Terjadi kesalahan server",
    });
  }
};

/**
 * GET /api/label/s4s/list  -> list semua label S4S
 */
exports.getAllLabels = async (req, res) => {
  try {
    const search = req.query.search || "";
    const topRow = req.query.top || "100";
    const data = await labelS4sService.getAllLabels({ search, topRow });
    return res.status(200).json({
      success: true,
      message: "List label S4S berhasil diambil",
      data,
    });
  } catch (err) {
    console.error("S4S List Error:", err);
    const status = err.statusCode || 500;
    return res.status(status).json({
      success: false,
      message: err.message || "Terjadi kesalahan server",
    });
  }
};

/**
 * GET /api/label/s4s/detail/:nos4s  -> detail by no S4S
 */
exports.getDetailByNo = async (req, res) => {
  try {
    const NoS4S = String(req.params.nos4s || "").trim();
    if (!NoS4S) {
      return res
        .status(400)
        .json({ success: false, message: "nos4s wajib diisi" });
    }

    const data = await labelS4sService.getDetailByNo(NoS4S);
    return res.status(200).json({
      success: true,
      message: "Detail label S4S berhasil diambil",
      data,
    });
  } catch (err) {
    console.error("S4S Detail Error:", err);
    const status = err.statusCode || 500;
    return res.status(status).json({
      success: false,
      message: err.message || "Terjadi kesalahan server",
    });
  }
};

/**
 * PUT /api/label/s4s/:nos4s  -> update label header
 */
exports.updateLabel = async (req, res) => {
  try {
    const NoS4S = String(req.params.nos4s || "").trim();
    if (!NoS4S) {
      return res
        .status(400)
        .json({ success: false, message: "nos4s wajib diisi" });
    }

    await labelS4sService.updateLabel(NoS4S, req.body);

    // Update detail if provided
    if (req.body.details && Array.isArray(req.body.details)) {
      await labelS4sService.updateDetail(NoS4S, req.body.details);
    }

    return res.status(200).json({
      success: true,
      message: `Label S4S ${NoS4S} berhasil diupdate`,
      data: { noS4S: NoS4S },
    });
  } catch (err) {
    console.error("S4S Update Error:", err);
    const status = err.statusCode || 500;
    return res.status(status).json({
      success: false,
      message: err.message || "Terjadi kesalahan server",
    });
  }
};

/**
 * DELETE /api/label/s4s/:nos4s  -> delete label
 */
exports.deleteLabel = async (req, res) => {
  try {
    const NoS4S = String(req.params.nos4s || "").trim();
    if (!NoS4S) {
      return res
        .status(400)
        .json({ success: false, message: "nos4s wajib diisi" });
    }

    await labelS4sService.deleteLabel(NoS4S);
    return res.status(200).json({
      success: true,
      message: `Label S4S ${NoS4S} berhasil dihapus`,
      data: { noS4S: NoS4S },
    });
  } catch (err) {
    console.error("S4S Delete Error:", err);
    const status = err.statusCode || 500;
    return res.status(status).json({
      success: false,
      message: err.message || "Terjadi kesalahan server",
    });
  }
};
