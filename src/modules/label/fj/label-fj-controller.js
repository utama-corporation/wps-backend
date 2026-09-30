const labelFjService = require("./label-fj-service");
const { generateLabelPdf } = require("../../../core/utils/pdf/label-generator");
const {
  buildFjLabelHtml,
} = require("../../../core/utils/pdf/templates/fj-label-pdf/fj-label-pdf");

/**
 * GET /api/label/fj/:nofj/pdf -> PDF label
 */
exports.generatePdf = async (req, res) => {
  try {
    const NoFJ = String(req.params.nofj || "").trim();
    if (!NoFJ) {
      return res
        .status(400)
        .json({ success: false, message: "nofj wajib diisi" });
    }

    const data = await labelFjService.getLabelData(NoFJ);
    const pdfBuffer = await generateLabelPdf(
      { ...data, noLabel: data.noFJ },
      buildFjLabelHtml,
    );

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="label-fj-${NoFJ}.pdf"`,
      "Content-Length": pdfBuffer.length,
    });

    return res.end(pdfBuffer);
  } catch (err) {
    console.error("FJ PDF Error:", err);
    const status = err.statusCode || 500;
    return res.status(status).json({
      success: false,
      message: err.message || "Gagal generate PDF label FJ",
    });
  }
};

/**
 * GET /api/label/fj/list -> list semua label FJ
 */
exports.getAllLabels = async (req, res) => {
  try {
    const search = req.query.search || "";
    const topRow = req.query.top || "100";
    const data = await labelFjService.getAllLabels({ search, topRow });
    return res.status(200).json({
      success: true,
      message: "List label FJ berhasil diambil",
      data,
    });
  } catch (err) {
    console.error("FJ List Error:", err);
    const status = err.statusCode || 500;
    return res.status(status).json({
      success: false,
      message: err.message || "Terjadi kesalahan server",
    });
  }
};

/**
 * GET /api/label/fj/detail/:nofj -> detail by NoFJ
 */
exports.getDetailByNo = async (req, res) => {
  try {
    const NoFJ = String(req.params.nofj || "").trim();
    if (!NoFJ) {
      return res
        .status(400)
        .json({ success: false, message: "nofj wajib diisi" });
    }

    const data = await labelFjService.getDetailByNo(NoFJ);
    return res.status(200).json({
      success: true,
      message: "Detail label FJ berhasil diambil",
      data,
    });
  } catch (err) {
    console.error("FJ Detail Error:", err);
    const status = err.statusCode || 500;
    return res.status(status).json({
      success: false,
      message: err.message || "Terjadi kesalahan server",
    });
  }
};

/**
 * GET /api/label/fj/:nofj/edit -> header data with IDs for editing
 */
exports.getHeaderForEdit = async (req, res) => {
  try {
    const NoFJ = String(req.params.nofj || "").trim();
    if (!NoFJ) {
      return res
        .status(400)
        .json({ success: false, message: "nofj wajib diisi" });
    }

    const data = await labelFjService.getHeaderForEdit(NoFJ);
    if (!data) {
      return res
        .status(404)
        .json({ success: false, message: "Label FJ tidak ditemukan" });
    }

    return res.status(200).json({
      success: true,
      message: "Data header FJ berhasil diambil",
      data,
    });
  } catch (err) {
    console.error("FJ Header Edit Error:", err);
    const status = err.statusCode || 500;
    return res.status(status).json({
      success: false,
      message: err.message || "Terjadi kesalahan server",
    });
  }
};

/**
 * GET /api/label/fj/:nofj -> data mentah label
 */
exports.getLabelData = async (req, res) => {
  try {
    const NoFJ = String(req.params.nofj || "").trim();
    if (!NoFJ) {
      return res
        .status(400)
        .json({ success: false, message: "nofj wajib diisi" });
    }

    const data = await labelFjService.getLabelData(NoFJ);
    return res.status(200).json({
      success: true,
      message: "Data label FJ berhasil diambil",
      data,
    });
  } catch (err) {
    console.error("FJ Label Data Error:", err);
    const status = err.statusCode || 500;
    return res.status(status).json({
      success: false,
      message: err.message || "Terjadi kesalahan server",
    });
  }
};

/**
 * PUT /api/label/fj/:nofj -> update label header
 */
exports.updateLabel = async (req, res) => {
  try {
    const NoFJ = String(req.params.nofj || "").trim();
    if (!NoFJ) {
      return res
        .status(400)
        .json({ success: false, message: "nofj wajib diisi" });
    }

    await labelFjService.updateLabel(NoFJ, req.body);

    if (req.body.details && Array.isArray(req.body.details)) {
      await labelFjService.updateDetail(NoFJ, req.body.details);
    }

    return res.status(200).json({
      success: true,
      message: `Label FJ ${NoFJ} berhasil diupdate`,
      data: { noFJ: NoFJ },
    });
  } catch (err) {
    console.error("FJ Update Error:", err);
    const status = err.statusCode || 500;
    return res.status(status).json({
      success: false,
      message: err.message || "Terjadi kesalahan server",
    });
  }
};

/**
 * DELETE /api/label/fj/:nofj -> delete label
 */
exports.deleteLabel = async (req, res) => {
  try {
    const NoFJ = String(req.params.nofj || "").trim();
    if (!NoFJ) {
      return res
        .status(400)
        .json({ success: false, message: "nofj wajib diisi" });
    }

    await labelFjService.deleteLabel(NoFJ);
    return res.status(200).json({
      success: true,
      message: `Label FJ ${NoFJ} berhasil dihapus`,
      data: { noFJ: NoFJ },
    });
  } catch (err) {
    console.error("FJ Delete Error:", err);
    const status = err.statusCode || 500;
    return res.status(status).json({
      success: false,
      message: err.message || "Terjadi kesalahan server",
    });
  }
};
