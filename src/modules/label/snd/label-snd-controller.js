const labelSndService = require("./label-snd-service");
const { generateLabelPdf } = require("../../../core/utils/pdf/label-generator");
const {
  buildSndLabelHtml,
} = require("../../../core/utils/pdf/templates/snd-label-pdf/snd-label-pdf");

/**
 * GET /api/label/snd/:nosnd/pdf
 */
exports.generatePdf = async (req, res) => {
  try {
    const NoSND = String(req.params.nosnd || "").trim();
    if (!NoSND) {
      return res
        .status(400)
        .json({ success: false, message: "nosnd wajib diisi" });
    }

    const data = await labelSndService.getLabelData(NoSND);
    const pdfBuffer = await generateLabelPdf(
      { ...data, noLabel: data.noSanding },
      buildSndLabelHtml,
    );

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="label-snd-${NoSND}.pdf"`,
      "Content-Length": pdfBuffer.length,
    });

    return res.end(pdfBuffer);
  } catch (err) {
    console.error("SND PDF Error:", err);
    const status = err.statusCode || 500;
    return res.status(status).json({
      success: false,
      message: err.message || "Gagal generate PDF label SND",
    });
  }
};

/**
 * GET /api/label/snd/:nosnd -> data mentah label
 */
exports.getLabelData = async (req, res) => {
  try {
    const NoSND = String(req.params.nosnd || "").trim();
    if (!NoSND) {
      return res
        .status(400)
        .json({ success: false, message: "nosnd wajib diisi" });
    }

    const data = await labelSndService.getLabelData(NoSND);
    return res.status(200).json({
      success: true,
      message: "Data label SND berhasil diambil",
      data,
    });
  } catch (err) {
    console.error("SND Label Data Error:", err);
    const status = err.statusCode || 500;
    return res.status(status).json({
      success: false,
      message: err.message || "Terjadi kesalahan server",
    });
  }
};

/**
 * GET /api/label/snd/:nosnd/edit -> header data with IDs for editing
 */
exports.getHeaderForEdit = async (req, res) => {
  try {
    const NoSND = String(req.params.nosnd || "").trim();
    if (!NoSND) {
      return res
        .status(400)
        .json({ success: false, message: "nosnd wajib diisi" });
    }
    const data = await labelSndService.getHeaderForEdit(NoSND);
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
    console.error("SND getHeaderForEdit Error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Terjadi kesalahan server",
    });
  }
};

/**
 * GET /api/label/snd/list -> list semua label
 */
exports.getAllLabels = async (req, res) => {
  try {
    const search = req.query.search || "";
    const topRow = req.query.top || "100";
    const data = await labelSndService.getAllLabels({ search, topRow });
    return res.status(200).json({
      success: true,
      message: "List label SND berhasil diambil",
      data,
    });
  } catch (err) {
    console.error("SND List Error:", err);
    const status = err.statusCode || 500;
    return res.status(status).json({
      success: false,
      message: err.message || "Terjadi kesalahan server",
    });
  }
};

/**
 * GET /api/label/snd/detail/:nosnd -> detail by no
 */
exports.getDetailByNo = async (req, res) => {
  try {
    const NoSND = String(req.params.nosnd || "").trim();
    if (!NoSND) {
      return res
        .status(400)
        .json({ success: false, message: "nosnd wajib diisi" });
    }
    const data = await labelSndService.getDetailByNo(NoSND);
    return res.status(200).json({
      success: true,
      message: "Detail label SND berhasil diambil",
      data,
    });
  } catch (err) {
    console.error("SND Detail Error:", err);
    const status = err.statusCode || 500;
    return res.status(status).json({
      success: false,
      message: err.message || "Terjadi kesalahan server",
    });
  }
};

/**
 * PUT /api/label/snd/:nosnd -> update label header + detail
 */
exports.updateLabel = async (req, res) => {
  try {
    const NoSND = String(req.params.nosnd || "").trim();
    if (!NoSND) {
      return res
        .status(400)
        .json({ success: false, message: "nosnd wajib diisi" });
    }

    await labelSndService.updateLabel(NoSND, req.body);

    if (req.body.details && Array.isArray(req.body.details)) {
      await labelSndService.updateDetail(NoSND, req.body.details);
    }

    return res.status(200).json({
      success: true,
      message: `Label SND ${NoSND} berhasil diupdate`,
      data: { noSanding: NoSND },
    });
  } catch (err) {
    console.error("SND Update Error:", err);
    const status = err.statusCode || 500;
    return res.status(status).json({
      success: false,
      message: err.message || "Terjadi kesalahan server",
    });
  }
};

/**
 * DELETE /api/label/snd/:nosnd -> delete label
 */
exports.deleteLabel = async (req, res) => {
  try {
    const NoSND = String(req.params.nosnd || "").trim();
    if (!NoSND) {
      return res
        .status(400)
        .json({ success: false, message: "nosnd wajib diisi" });
    }

    await labelSndService.deleteLabel(NoSND);
    return res.status(200).json({
      success: true,
      message: `Label SND ${NoSND} berhasil dihapus`,
      data: { noSanding: NoSND },
    });
  } catch (err) {
    console.error("SND Delete Error:", err);
    const status = err.statusCode || 500;
    return res.status(status).json({
      success: false,
      message: err.message || "Terjadi kesalahan server",
    });
  }
};
