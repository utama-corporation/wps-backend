const labelCcaService = require("./label-cca-service");
const { generateLabelPdf } = require("../../../core/utils/pdf/label-generator");
const {
  buildCcaLabelHtml,
} = require("../../../core/utils/pdf/templates/cca-label-pdf/cca-label-pdf");

/**
 * GET /api/label/cca/:nocca/pdf
 */
exports.generatePdf = async (req, res) => {
  try {
    const NoCCA = String(req.params.nocca || "").trim();
    if (!NoCCA) {
      return res
        .status(400)
        .json({ success: false, message: "nocca wajib diisi" });
    }

    const data = await labelCcaService.getLabelData(NoCCA);

    const pdfBuffer = await generateLabelPdf(
      { ...data, noLabel: data.noCCA },
      buildCcaLabelHtml,
    );

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="label-cca-${NoCCA}.pdf"`,
      "Content-Length": pdfBuffer.length,
    });

    return res.end(pdfBuffer);
  } catch (err) {
    console.error("CCA PDF Error:", err);
    const status = err.statusCode || 500;
    return res.status(status).json({
      success: false,
      message: err.message || "Gagal generate PDF label CCA",
    });
  }
};

/**
 * GET /api/label/cca/list
 */
exports.getAllLabels = async (req, res) => {
  try {
    const { search, topRow } = req.query;
    const data = await labelCcaService.getAllLabels({ search, topRow });
    return res.status(200).json({
      success: true,
      message: "Data label CC Akhir berhasil diambil",
      data,
    });
  } catch (err) {
    console.error("CCA getAllLabels Error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Terjadi kesalahan server",
    });
  }
};

/**
 * GET /api/label/cca/detail/:nocca
 */
exports.getDetailByNo = async (req, res) => {
  try {
    const noCCA = String(req.params.nocca || "").trim();
    if (!noCCA) {
      return res
        .status(400)
        .json({ success: false, message: "nocca wajib diisi" });
    }
    const data = await labelCcaService.getDetailByNo(noCCA);
    return res.status(200).json({
      success: true,
      message: "Detail label berhasil diambil",
      data,
    });
  } catch (err) {
    console.error("CCA getDetailByNo Error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Terjadi kesalahan server",
    });
  }
};

/**
 * GET /api/label/cca/:nocca/edit
 */
exports.getHeaderForEdit = async (req, res) => {
  try {
    const noCCA = String(req.params.nocca || "").trim();
    if (!noCCA) {
      return res
        .status(400)
        .json({ success: false, message: "nocca wajib diisi" });
    }
    const data = await labelCcaService.getHeaderForEdit(noCCA);
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
    console.error("CCA getHeaderForEdit Error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Terjadi kesalahan server",
    });
  }
};

/**
 * GET /api/label/cca/:nocca  -> data mentah label (debug/preview).
 */
exports.getLabelData = async (req, res) => {
  try {
    const NoCCA = String(req.params.nocca || "").trim();
    if (!NoCCA) {
      return res
        .status(400)
        .json({ success: false, message: "nocca wajib diisi" });
    }

    const data = await labelCcaService.getLabelData(NoCCA);
    return res.status(200).json({
      success: true,
      message: "Data label CCA berhasil diambil",
      data,
    });
  } catch (err) {
    console.error("CCA Label Data Error:", err);
    const status = err.statusCode || 500;
    return res.status(status).json({
      success: false,
      message: err.message || "Terjadi kesalahan server",
    });
  }
};

/**
 * PUT /api/label/cca/:nocca
 */
exports.updateLabel = async (req, res) => {
  try {
    const noCCA = String(req.params.nocca || "").trim();
    if (!noCCA) {
      return res
        .status(400)
        .json({ success: false, message: "nocca wajib diisi" });
    }
    const { details, ...headerData } = req.body;

    await labelCcaService.updateLabel(noCCA, headerData);
    if (Array.isArray(details)) {
      await labelCcaService.updateDetail(noCCA, details);
    }

    return res.status(200).json({
      success: true,
      message: "Label CC Akhir berhasil diupdate",
      data: { noCCA },
    });
  } catch (err) {
    console.error("CCA updateLabel Error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Gagal update label CC Akhir",
    });
  }
};

/**
 * DELETE /api/label/cca/:nocca
 */
exports.deleteLabel = async (req, res) => {
  try {
    const noCCA = String(req.params.nocca || "").trim();
    if (!noCCA) {
      return res
        .status(400)
        .json({ success: false, message: "nocca wajib diisi" });
    }
    await labelCcaService.deleteLabel(noCCA);
    return res.status(200).json({
      success: true,
      message: "Label CC Akhir berhasil dihapus",
      data: { noCCA },
    });
  } catch (err) {
    console.error("CCA deleteLabel Error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Gagal menghapus label CC Akhir",
    });
  }
};
