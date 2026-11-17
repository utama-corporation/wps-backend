const { generateReportPdf } = require("../../core/utils/pdf/report-generator");

// Laporan Stock Opname Kayu Bulat - HTML untuk report-generator (puppeteer),
// tanpa Crystal Report. Kolom: log per NoKB dengan baseline sistem beku dan
// hasil fisik (Stok Sekarang) + selisih + remark. Landscape A4.

const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]),
  );

const pad = (n) => String(n).padStart(2, "0");

function fmtTanggal(v) {
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** Waktu cetak footer -> dd/MM/yyyy HH:mm:ss. */
function fmtWaktu(d) {
  return `${fmtTanggal(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** Stok sekarang / selisih -> kosong bila belum diisi atau nol. */
function fmtNum(v) {
  if (v === null || v === undefined || v === "") return "";
  const n = Number(v);
  if (!Number.isFinite(n)) return "";
  return n.toFixed(2).replace(".", ",");
}

function fmtSelisih(n) {
  if (n === null || n === undefined || n === "") return "";
  const v = Number(n);
  if (!Number.isFinite(v) || Math.round(v * 100) === 0) return "";
  return v.toFixed(2).replace(".", ",");
}

function buildHtml({ noSO, tanggal, rows }) {
  const body = rows
    .map(
      (r, i) => `          <tr>
            <td class="c">${i + 1}</td>
            <td>${esc(r.NoKayuBulat)}</td>
            <td class="c">${fmtTanggal(r.Tanggal)}</td>
            <td>${esc(r.Supplier)}</td>
            <td class="c">${esc(r.NoTruk)}</td>
            <td>${esc(r.Jenis)}</td>
            <td class="n">${fmtNum(r.Pcs)}</td>
            <td class="n">${fmtNum(r.BlkTepakai)}</td>
            <td class="n">${fmtNum(r.Fisik)}</td>
            <td class="n">${fmtNum(r.QtyFisik)}</td>
            <td class="n">${fmtSelisih(r.Selisih)}</td>
            <td class="rmk">${esc(r.Remark || "")}</td>
          </tr>`,
    )
    .join("\n");

  const totPcs = rows.reduce((s, r) => s + (Number(r.Pcs) || 0), 0);
  const totTerpakai = rows.reduce((s, r) => s + (Number(r.BlkTepakai) || 0), 0);
  const totFisik = rows.reduce((s, r) => s + (Number(r.Fisik) || 0), 0);
  const totStok = rows.reduce((s, r) => s + (Number(r.QtyFisik) || 0), 0);
  const totSelisih = rows.reduce((s, r) => {
    const n = Number(r.Selisih);
    return s + (Number.isFinite(n) ? n : 0);
  }, 0);

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Arial, sans-serif; font-size: 7.5pt; color: #000; }
  .ru { margin: 0; text-align: center; font-size: 9pt; font-weight: 700; }
  .title { margin: 8px 0 14px; text-align: center; font-size: 9pt; }
  .meta { margin: 0 0 5mm; font-size: 8pt; }
  .meta p { margin: 0 0 8px; }
  .meta p:last-child { margin-bottom: 0; }
  table { width: 100%; border-collapse: collapse; margin: 0 0 10mm; page-break-inside: auto; }
  th, td { border: 1px solid #000; font-size: 7.5pt; vertical-align: middle; }
  th { padding: 3px 6px; font-weight: 400; text-align: center; }
  td { padding: 5px 6px; }
  .c { text-align: center; }
  .n { text-align: right; }
  tr { page-break-inside: avoid; }
  thead { display: table-header-group; }
  .tot td { font-weight: 700; }
</style>
</head>
<body>
  <p class="ru">RU</p>
  <p class="title">Laporan Stock Opname Kayu Bulat</p>
  <div class="meta">
    <p>No SO : ${esc(noSO)}</p>
    <p>Tanggal SO : ${esc(fmtTanggal(tanggal))}</p>
  </div>
  <table>
    <thead>
      <tr>
        <th style="width:4%">No</th>
        <th style="width:14%">No. Kayu Bulat</th>
        <th style="width:8%">Tanggal</th>
        <th style="width:16%">Supplier</th>
        <th style="width:7%">No Truk</th>
        <th style="width:11%">Jenis</th>
        <th style="width:6%">Pcs</th>
        <th style="width:7%">Terpakai</th>
        <th style="width:6%">Fisik</th>
        <th style="width:8%">Stok Sekarang</th>
        <th style="width:7%">Selisih</th>
        <th>Remark</th>
      </tr>
    </thead>
    <tbody>
${body}
      <tr class="tot">
        <td colspan="6">Total (${rows.length} log)</td>
        <td class="n">${fmtNum(totPcs)}</td>
        <td class="n">${fmtNum(totTerpakai)}</td>
        <td class="n">${fmtNum(totFisik)}</td>
        <td class="n">${fmtNum(totStok)}</td>
        <td class="n">${fmtSelisih(totSelisih)}</td>
        <td></td>
      </tr>
    </tbody>
  </table>
</body>
</html>`;
}

/** @returns {Promise<Buffer>} PDF laporan Stock Opname Kayu Bulat. */
async function generate({ noSO, tanggal, rows, printedBy }) {
  const html = buildHtml({ noSO, tanggal, rows });
  const footerTemplate = `
    <div style="width:100%;font-size:5pt;font-family:Arial,sans-serif;color:#000;
                padding:0 8mm;display:flex;justify-content:space-between;align-items:center;">
      <span>Print by ${esc(printedBy || "-")} on ${esc(fmtWaktu(new Date()))}</span>
      <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
    </div>`;

  return generateReportPdf(html, {
    format: "A4",
    orientation: "landscape",
    title: "Laporan Stock Opname Kayu Bulat",
    margin: { top: "10mm", right: "8mm", bottom: "12mm", left: "8mm" },
    footerTemplate,
  });
}

module.exports = { generate };
