const labelStService = require("./label-st-service");
const { generateLabelPdf } = require("../../../core/utils/pdf/label-generator");
const {
  buildStLabelHtml,
} = require("../../../core/utils/pdf/templates/st-label-pdf/st-label-pdf");

/**
 * GET /api/label/st/list -> list semua label ST
 */
exports.getAllLabels = async (req, res) => {
  try {
    const search = req.query.search || "";
    const topRow = req.query.top || "100";
    const page = req.query.page;
    const pageSize = req.query.pageSize;
    const data = await labelStService.getAllLabels({ search, topRow, page, pageSize });
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

    // Link bongkar susun: kirim noBongkarSusun untuk menautkan,
    // null/kosong untuk melepas (paritas tablet: delete + insert)
    await labelStService.replaceBongkarSusun(noST, req.body.noBongkarSusun || null);

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
    // Default telly sesuai user login (paritas tablet getTellyByIdUsername)
    data.tellyDefault = await labelStService.getTellyDefault(req.idUsername);
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


const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function fmtDdMmmYyyy(input) {
  const d = input ? new Date(input) : null;
  if (!d || Number.isNaN(d.getTime())) return "-";
  const dd = String(d.getDate()).padStart(2, "0");
  return `${dd}-${MONTHS[d.getMonth()]}-${d.getFullYear()}`;
}

function fmtMmYy(input) {
  const d = input ? new Date(input) : null;
  if (!d || Number.isNaN(d.getTime())) return "-";
  return `${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getFullYear()).slice(-2)}`;
}

// Paritas tablet: floor 4 desimal per baris, lalu total
function floor4(v) {
  return Math.floor(v * 10000) / 10000;
}

function fmt4Id(v) {
  return (Math.round(v * 10000) / 10000).toFixed(4).replace(".", ",");
}

function computeTotals(details, idUOMTblLebar) {
  const isMm = Number(idUOMTblLebar) === 1;
  let totalTon = 0;
  let totalM3 = 0;
  let totalPcs = 0;

  for (const row of details) {
    const t = Number(row.Tebal) || 0;
    const l = Number(row.Lebar) || 0;
    const p = Number(row.Panjang) || 0;
    const n = Number(row.JmlhBatang) || 0;
    totalPcs += n;

    let rowTon = isMm
      ? (t * l * p * n * 304.8 / 1000000000 / 1.416)
      : (t * l * p * n / 7200.8);
    rowTon = floor4(rowTon);
    totalTon += rowTon;
    totalM3 += rowTon * 1.416;
  }

  return { totalPcs, totalTon, totalM3 };
}

/**
 * GET /api/label/st/susun?date=yyyy-MM-dd -> list BongkarSusun per tanggal
 */
exports.getSusunList = async (req, res) => {
  try {
    const date = String(req.query.date || "").trim();
    if (!date) {
      return res.status(400).json({ success: false, message: "date wajib diisi" });
    }

    const data = await labelStService.getSusunList(date);
    return res.status(200).json({
      success: true,
      message: "List bongkar susun berhasil diambil",
      data,
    });
  } catch (err) {
    console.error("ST Susun Error:", err);
    const status = err.statusCode || 500;
    return res.status(status).json({
      success: false,
      message: err.message || "Terjadi kesalahan server",
    });
  }
};

/**
 * GET /api/label/st/by-date?date=yyyy-MM-dd -> output card per tanggal
 */
exports.getOutputByDate = async (req, res) => {
  try {
    const date = String(req.query.date || "").trim();
    if (!date) {
      return res.status(400).json({ success: false, message: "date wajib diisi" });
    }

    const data = await labelStService.getOutputByDate(date);
    return res.status(200).json({
      success: true,
      message: "Output label ST berhasil diambil",
      data,
    });
  } catch (err) {
    console.error("ST Output Error:", err);
    const status = err.statusCode || 500;
    return res.status(status).json({
      success: false,
      message: err.message || "Terjadi kesalahan server",
    });
  }
};

/**
 * PUT /api/label/st/:nost/print/reset -> reset status cetak
 */
exports.resetPrintStatus = async (req, res) => {
  try {
    const noST = String(req.params.nost || "").trim();
    if (!noST) {
      return res.status(400).json({ success: false, message: "nost wajib diisi" });
    }

    const ok = await labelStService.resetPrintStatus(noST);
    return res.status(200).json({
      success: ok,
      message: ok
        ? "Status cetak berhasil direset"
        : "Tidak ada data yang direset",
      data: { noST },
    });
  } catch (err) {
    console.error("ST ResetPrint Error:", err);
    const status = err.statusCode || 500;
    return res.status(status).json({
      success: false,
      message: err.message || "Terjadi kesalahan server",
    });
  }
};

/**
 * GET /api/label/st/:nost/pdf -> generate PDF label ST + increment print status
 */
exports.generatePdf = async (req, res) => {
  try {
    const noST = String(req.params.nost || "").trim();
    if (!noST) {
      return res.status(400).json({ success: false, message: "nost wajib diisi" });
    }

    const result = await labelStService.getPdfData(noST);
    if (!result) {
      return res.status(404).json({
        success: false,
        message: "Label ST tidak ditemukan",
      });
    }

    const { header, detail } = result;
    if (!detail || detail.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Detail masih kosong. Tambahkan minimal 1 item detail!",
      });
    }

    const totals = computeTotals(detail, header.IdUOMTblLebar);
    const uomTebal =
      Number(header.IdUOMTblLebar) === 1 ? "mm" : Number(header.IdUOMTblLebar) === 3 ? '"' : "";
    const uomPanjang = Number(header.IdUOMPanjang) === 4 ? "ft" : "";

    const tellyFull = (header.NamaOrgTelly || "-").trim();
    const tellyFirst = tellyFull.split(" ")[0] || "-";

    const pdfBuffer = await generateLabelPdf(
      {
        noLabel: header.NoST,
        noST: header.NoST,
        jenisKayu: header.JenisKayu || "-",
        tanggal: fmtDdMmmYyyy(header.DateCreate),
        mmYY: fmtMmYy(header.DateCreate),
        telly: tellyFirst,
        stickBy: header.NamaStickBy || "-",
        noSPK: header.NoSPK || "-",
        platTruk: header.NoPlat || "-",
        noKB: header.NoKayuBulat || "-",
        supplier: header.Supplier || "-",
        noTruk: header.NoTruk != null && header.NoTruk !== "" ? header.NoTruk : "-",
        detail: detail.map((r) => ({
          tebal: Number(r.Tebal) || 0,
          lebar: Number(r.Lebar) || 0,
          panjang: Number(r.Panjang) || 0,
          pcs: Number(r.JmlhBatang) || 0,
        })),
        uomTebal,
        uomPanjang,
        totalPcs: totals.totalPcs,
        totalTon: fmt4Id(totals.totalTon),
        totalM3: fmt4Id(totals.totalM3),
        remark: header.Remark || "",
        isSLP: header.IsSLP ? 1 : 0,
        hasBeenPrinted: parseInt(header.HasBeenPrinted, 10) || 0,
      },
      buildStLabelHtml,
      { width: "105mm" },
    );

    try {
      await labelStService.incrementPrintStatus(noST);
    } catch (printErr) {
      console.error("ST IncrementPrint Error:", printErr.message);
    }

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="label-st-${noST}.pdf"`,
      "Content-Length": pdfBuffer.length,
    });

    return res.end(pdfBuffer);
  } catch (err) {
    console.error("ST PDF Error:", err);
    const status = err.statusCode || 500;
    return res.status(status).json({
      success: false,
      message: err.message || "Gagal generate PDF label ST",
    });
  }
};
