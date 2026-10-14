const { generateReportPdf } = require("../../core/utils/pdf/report-generator");
const {
  buildProduksiReportHtml,
} = require("../../core/utils/pdf/templates/produksi-report/produksi-report");
const { getProduksiReport } = require("./produksi-report-service");

/**
 * Buat handler `GET /report/:noProduksi/pdf` untuk satu proses produksi.
 * Semua proses memakai handler yang sama; yang membedakan cuma config-nya.
 *
 * Memakai verifyToken (dipasang di routes) supaya field "Print by" diambil dari
 * req.username hasil decode JWT, bukan dari query string yang bisa dimanipulasi.
 *
 * @param {object} config salah satu entri REPORT_CONFIGS
 */
function makeProduksiReportPdf(config) {
  return async function generateProduksiReportPdf(req, res, next) {
    try {
      const noProduksi = String(req.params.noProduksi || "").trim();
      if (!noProduksi) {
        return res
          .status(400)
          .json({ success: false, message: "noProduksi wajib diisi" });
      }

      const report = await getProduksiReport(config, noProduksi);

      if (!report.header) {
        return res
          .status(404)
          .json({
            success: false,
            message: `Produksi '${noProduksi}' tidak ditemukan`,
          });
      }

      const username = String(req.username || "").trim();
      const html = buildProduksiReportHtml(report, { subJudul: config.nama });

      // Landscape supaya tabel INPUT dan OUTPUT muat berdampingan dalam 2 kolom.
      // printedBy dipakai untuk footer halaman "Print by : ...".
      const pdfBuffer = await generateReportPdf(html, {
        printedBy: username || "-",
        orientation: "landscape",
        title: `WPS - Laporan Produksi ${config.nama}`,
      });

      const safeNo = noProduksi.replace(/[^\w.-]/g, "_");

      res.set({
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${config.filePrefix}_${safeNo}.pdf"`,
        "Content-Length": pdfBuffer.length,
      });

      // Pakai res.end(), bukan res.send(): res.send() bisa men-serialize Buffer
      // jadi JSON {"0":37,"1":80,...} sehingga PDF tidak bisa dibuka.
      return res.end(pdfBuffer);
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { makeProduksiReportPdf };