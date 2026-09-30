const labelBjService = require("./label-bj-service");
const { generateLabelPdf } = require("../../../core/utils/pdf/label-generator");
const {
  buildBjLabelHtml,
} = require("../../../core/utils/pdf/templates/bj-label-pdf/bj-label-pdf");

/**
 * GET /api/label/bj/:nobj/pdf
 */
exports.generatePdf = async (req, res) => {
  try {
    const NoBJ = String(req.params.nobj || "").trim();
    if (!NoBJ) {
      return res
        .status(400)
        .json({ success: false, message: "nobj wajib diisi" });
    }

    const data = await labelBjService.getLabelData(NoBJ);
    const pdfBuffer = await generateLabelPdf(
      { ...data, noLabel: data.noBJ },
      buildBjLabelHtml,
    );

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="label-bj-${NoBJ}.pdf"`,
      "Content-Length": pdfBuffer.length,
    });

    return res.end(pdfBuffer);
  } catch (err) {
    console.error("BJ PDF Error:", err);
    const status = err.statusCode || 500;
    return res.status(status).json({
      success: false,
      message: err.message || "Gagal generate PDF label BJ",
    });
  }
};

/**
 * GET /api/label/bj/:nobj -> data mentah label
 */
exports.getLabelData = async (req, res) => {
  try {
    const NoBJ = String(req.params.nobj || "").trim();
    if (!NoBJ) {
      return res
        .status(400)
        .json({ success: false, message: "nobj wajib diisi" });
    }

    const data = await labelBjService.getLabelData(NoBJ);
    return res.status(200).json({
      success: true,
      message: "Data label BJ berhasil diambil",
      data,
    });
  } catch (err) {
    console.error("BJ Label Data Error:", err);
    const status = err.statusCode || 500;
    return res.status(status).json({
      success: false,
      message: err.message || "Terjadi kesalahan server",
    });
  }
};

/**
 * GET /api/label/bj/:nobj/edit -> header data with IDs for editing
 */
exports.getHeaderForEdit = async (req, res) => {
  try {
    const NoBJ = String(req.params.nobj || "").trim();
    if (!NoBJ) {
      return res
        .status(400)
        .json({ success: false, message: "nobj wajib diisi" });
    }
    const data = await labelBjService.getHeaderForEdit(NoBJ);
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
    console.error("BJ getHeaderForEdit Error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Terjadi kesalahan server",
    });
  }
};

/**
 * GET /api/label/bj/list -> list semua label
 */
exports.getAllLabels = async (req, res) => {
  try {
    const search = req.query.search || "";
    const topRow = req.query.top || "100";
    const data = await labelBjService.getAllLabels({ search, topRow });
    return res.status(200).json({
      success: true,
      message: "List label BJ berhasil diambil",
      data,
    });
  } catch (err) {
    console.error("BJ List Error:", err);
    const status = err.statusCode || 500;
    return res.status(status).json({
      success: false,
      message: err.message || "Terjadi kesalahan server",
    });
  }
};

/**
 * GET /api/label/bj/detail/:nobj -> detail by no
 */
exports.getDetailByNo = async (req, res) => {
  try {
    const NoBJ = String(req.params.nobj || "").trim();
    if (!NoBJ) {
      return res
        .status(400)
        .json({ success: false, message: "nobj wajib diisi" });
    }
    const data = await labelBjService.getDetailByNo(NoBJ);
    return res.status(200).json({
      success: true,
      message: "Detail label BJ berhasil diambil",
      data,
    });
  } catch (err) {
    console.error("BJ Detail Error:", err);
    const status = err.statusCode || 500;
    return res.status(status).json({
      success: false,
      message: err.message || "Terjadi kesalahan server",
    });
  }
};

/**
 * PUT /api/label/bj/:nobj -> update label header + detail
 */
exports.updateLabel = async (req, res) => {
  try {
    const NoBJ = String(req.params.nobj || "").trim();
    if (!NoBJ) {
      return res
        .status(400)
        .json({ success: false, message: "nobj wajib diisi" });
    }

    await labelBjService.updateLabel(NoBJ, req.body);

    if (req.body.details && Array.isArray(req.body.details)) {
      await labelBjService.updateDetail(NoBJ, req.body.details);
    }

    return res.status(200).json({
      success: true,
      message: `Label BJ ${NoBJ} berhasil diupdate`,
      data: { noBJ: NoBJ },
    });
  } catch (err) {
    console.error("BJ Update Error:", err);
    const status = err.statusCode || 500;
    return res.status(status).json({
      success: false,
      message: err.message || "Terjadi kesalahan server",
    });
  }
};

/**
 * DELETE /api/label/bj/:nobj -> delete label
 */
exports.deleteLabel = async (req, res) => {
  try {
    const NoBJ = String(req.params.nobj || "").trim();
    if (!NoBJ) {
      return res
        .status(400)
        .json({ success: false, message: "nobj wajib diisi" });
    }

    await labelBjService.deleteLabel(NoBJ);
    return res.status(200).json({
      success: true,
      message: `Label BJ ${NoBJ} berhasil dihapus`,
      data: { noBJ: NoBJ },
    });
  } catch (err) {
    console.error("BJ Delete Error:", err);
    const status = err.statusCode || 500;
    return res.status(status).json({
      success: false,
      message: err.message || "Terjadi kesalahan server",
    });
  }
};
