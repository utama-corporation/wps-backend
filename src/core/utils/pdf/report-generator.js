const { getBrowser } = require("./browser");

function escapeHtml(v) {
  return String(v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Puppeteer 24.x mengabaikan opsi `orientation` - hanya width/height eksplisit
// yang benar-benar menghasilkan halaman landscape. Jadi ukuran diturunkan sendiri
// dari format + orientation di sini.
const PAGE_SIZES_MM = {
  A4: { width: 210, height: 297 },
  Letter: { width: 215.9, height: 279.4 },
  Legal: { width: 215.9, height: 355.6 },
};

function resolvePageSize(options) {
  if (options.width || options.height) {
    return { width: options.width, height: options.height };
  }

  const size = PAGE_SIZES_MM[options.format || "A4"] || PAGE_SIZES_MM.A4;
  const landscape = options.orientation === "landscape";
  return {
    width: `${landscape ? size.height : size.width}mm`,
    height: `${landscape ? size.width : size.height}mm`,
  };
}

/**
 * Generate PDF untuk laporan tabular (bukan label).
 *
 * Berbeda dengan label-generator.js: tidak ada QR, tidak ada viewport dance.
 * Chromium yang menangani page break, jadi cukup andalkan CSS
 * `thead { display: table-header-group }` agar header tabel terulang
 * di setiap halaman.
 *
 * @param {string} html      - HTML siap render
 * @param {object} [options]
 * @param {string} [options.format]      - 'A4' | 'Letter' | 'Legal', default 'A4'
 * @param {string} [options.orientation] - 'portrait' | 'landscape', default 'portrait'
 * @param {string} [options.width]       - eksplisit, menang atas format/orientation
 * @param {string} [options.height]      - eksplisit, menang atas format/orientation
 * @param {number} [options.scale]       - 0.1 - 2, default 1
 * @returns {Promise<Buffer>} PDF buffer
 */
async function generateReportPdf(html, options = {}) {
  const scale = options.scale || 1;
  const printedBy = escapeHtml(options.printedBy || "-");
  const size = resolvePageSize(options);

  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    // HTML laporan sepenuhnya inline (tanpa resource eksternal), jadi tidak ada
    // yang perlu ditunggu sampai jaringan idle. "networkidle0" hanya menambah
    // penundaan dan Endurance timeout di bawah beban.
    await page.setContent(html, { waitUntil: "domcontentloaded" });

    return await page.pdf({
      width: size.width,
      height: size.height,
      scale,
      printBackground: true,
      margin: { top: "12mm", right: "10mm", bottom: "12mm", left: "10mm" },
      displayHeaderFooter: true,
      headerTemplate: "<div></div>",
      footerTemplate: `
        <div style="width:100%;font-size:9px;font-family:Arial,sans-serif;color:#555;
                    padding:0 10mm;display:flex;justify-content:space-between;align-items:center;">
          <span>Print by : ${printedBy}</span>
          <span>WPS - Laporan Produksi Finger Joint</span>
          <span>Halaman <span class="pageNumber"></span> dari <span class="totalPages"></span></span>
        </div>`,
    });
  } finally {
    await page.close();
  }
}

module.exports = { generateReportPdf };
