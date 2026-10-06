const service = require("./finger-join-produksi-service");
const { generateReportPdf } = require("../../../core/utils/pdf/report-generator");
const {
  buildFjProduksiReportHtml,
} = require("../../../core/utils/pdf/templates/fj-produksi-report/fj-produksi-report");

async function getMesinList(req, res, next) {
  try {
    const data = await service.getMesinList();
    res.json(data);
  } catch (err) {
    next(err);
  }
}

async function getHistory(req, res, next) {
  try {
    const data = await service.getHistory();
    res.json(data);
  } catch (err) {
    next(err);
  }
}

async function getNextNoProduksi(req, res, next) {
  try {
    const value = await service.getNextNoProduksi();
    res.json({ NoProduksi: value });
  } catch (err) {
    next(err);
  }
}

async function getNextNoLabel(req, res, next) {
  try {
    const value = await service.getNextNoLabel();
    res.json({ NoFJ: value });
  } catch (err) {
    next(err);
  }
}

async function getMasterOptions(req, res, next) {
  try {
    const data = await service.getMasterOptions();
    res.json(data);
  } catch (err) {
    next(err);
  }
}

async function saveHeader(req, res, next) {
  try {
    const noProduksi = await service.saveHeader(req.body);
    res.json({ success: true, noProduksi, message: "Header tersimpan" });
  } catch (err) {
    next(err);
  }
}

async function getHeader(req, res, next) {
  try {
    const data = await service.getHeader(req.params.noProduksi);
    if (!data) {
      return res.status(404).json({ success: false, message: "Data header tidak ditemukan" });
    }
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

async function updateHeader(req, res, next) {
  try {
    await service.updateHeader(req.body);
    res.json({ success: true, message: "Header berhasil diupdate" });
  } catch (err) {
    next(err);
  }
}

async function createLabel(req, res, next) {
  try {
    const noFJ = await service.createLabel(req.body);
    res.json({ success: true, noFJ, message: "Label tersimpan" });
  } catch (err) {
    next(err);
  }
}

async function addInput(req, res, next) {
  try {
    const result = await service.addInput(req.body);
    res.json({ message: "Input ditambahkan", ...result });
  } catch (err) {
    next(err);
  }
}

async function removeInput(req, res, next) {
  try {
    const result = await service.removeInput(req.body);
    res.json({ message: "Input dihapus", ...result });
  } catch (err) {
    next(err);
  }
}

async function addOutput(req, res, next) {
  try {
    const result = await service.addOutput(req.body);
    res.json({ message: "Output ditambahkan", ...result });
  } catch (err) {
    next(err);
  }
}

async function removeOutput(req, res, next) {
  try {
    const result = await service.removeOutput(req.body);
    res.json({ message: "Output dihapus", ...result });
  } catch (err) {
    next(err);
  }
}

async function generateProduksiReportPdf(req, res, next) {
  try {
    const noProduksi = String(req.params.noProduksi || "").trim();
    if (!noProduksi) {
      return res
        .status(400)
        .json({ message: "noProduksi wajib diisi" });
    }

    const report = await service.getProduksiReport(noProduksi);

    if (!report.header) {
      return res
        .status(404)
        .json({ message: `Produksi '${noProduksi}' tidak ditemukan` });
    }

    // verifyToken sudah memasang req.username dari payload JWT, jadi nilainya
    // berasal dari user yang benar-benar login - bukan dari ?username=.
    const username = String(req.username || "").trim();
    const html = buildFjProduksiReportHtml(report);

    // Landscape supaya tabel INPUT dan OUTPUT muat berdampingan dalam 2 kolom.
    // printedBy dipakai untuk footer halaman "Print by : ...".
    const pdfBuffer = await generateReportPdf(html, {
      printedBy: username || "-",
      orientation: "landscape",
    });

    const safeNo = noProduksi.replace(/[^\w.-]/g, "_");

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="ProduksiFJ_${safeNo}.pdf"`,
      "Content-Length": pdfBuffer.length,
    });

    // Pakai res.end(), bukan res.send(): res.send() bisa men-serialize Buffer
    // jadi JSON {"0":37,"1":80,...} sehingga PDF tidak bisa dibuka.
    return res.end(pdfBuffer);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getMesinList,
  getHistory,
  getNextNoProduksi,
  getNextNoLabel,
  getMasterOptions,
  saveHeader,
  getHeader,
  updateHeader,
  createLabel,
  addInput,
  removeInput,
  addOutput,
  removeOutput,
  generateProduksiReportPdf,
};
