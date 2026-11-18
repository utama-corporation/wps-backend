const { generateReportPdf } = require("../../core/utils/pdf/report-generator");

// Laporan Stock Opname Racipan Detail - HTML untuk report-generator (puppeteer),
// tanpa Crystal Report. Kolom: baseline saldo racipan beku saat SO dibuat vs
// hasil fisik (batang) + selisih + remark. Landscape A4.

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

/** Angka dimensi/desimal: tanpa trailing zero, kosong bila nol. */
function fmtDim(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n === 0) return n === 0 ? "0" : "";
  return String(parseFloat(n.toFixed(4)));
}

/** m³ -> tanpa trailing zero, kosong bila nol; negatif tetap tampil. */
function fmtM3(v) {
  if (v === null || v === undefined || v === "") return "";
  const n = Number(v);
  if (!Number.isFinite(n)) return "";
  return String(parseFloat(n.toFixed(4)));
}

/** Batang (bilangan bulat) -> tampil apa adanya; negatif tampil. */
function fmtBtg(v) {
  if (v === null || v === undefined || v === "") return "";
  const n = Number(v);
  if (!Number.isFinite(n)) return "";
  return String(Math.trunc(n));
}

function buildHtml({ noSO, tanggal, rows }) {
  const body = rows
    .map(
      (r, i) => `          <tr>
            <td class="c">${i + 1}</td>
            <td>${esc(r.Jenis)}</td>
            <td class="n">${fmtDim(r.Tebal)}</td>
            <td class="n">${fmtDim(r.Lebar)}</td>
            <td class="n">${fmtDim(r.Panjang)}</td>
            <td class="n">${fmtM3(r.Akhir)}</td>
            <td class="n">${fmtBtg(r.AkhirJlhBtg)}</td>
            <td class="n">${fmtBtg(r.QtyFisik)}</td>
            <td class="n">${fmtBtg(r.Selisih)}</td>
            <td class="rmk">${esc(r.Remark || "")}</td>
          </tr>`,
    )
    .join("\n");

  const totM3 = rows.reduce((s, r) => s + (Number(r.Akhir) || 0), 0);
  const totSistem = rows.reduce((s, r) => s + (Number(r.AkhirJlhBtg) || 0), 0);
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
  <p class="title">Laporan Stock Opname Racipan Detail</p>
  <div class="meta">
    <p>No SO : ${esc(noSO)}</p>
    <p>Tanggal SO : ${esc(fmtTanggal(tanggal))}</p>
  </div>
  <table>
    <thead>
      <tr>
        <th style="width:4%">No</th>
        <th style="width:22%">Jenis</th>
        <th style="width:7%">Tebal (mm)</th>
        <th style="width:7%">Lebar (mm)</th>
        <th style="width:7%">Panjang (ft)</th>
        <th style="width:10%">Akhir (m&sup3;)</th>
        <th style="width:8%">Sistem (Btg)</th>
        <th style="width:9%">Stok Sekarang (Btg)</th>
        <th style="width:8%">Selisih (Btg)</th>
        <th>Remark</th>
      </tr>
    </thead>
    <tbody>
${body}
      <tr class="tot">
        <td colspan="5">Total (${rows.length} baris)</td>
        <td class="n">${fmtM3(totM3)}</td>
        <td class="n">${fmtBtg(totSistem)}</td>
        <td class="n">${fmtBtg(totStok)}</td>
        <td class="n">${fmtBtg(totSelisih)}</td>
        <td></td>
      </tr>
    </tbody>
  </table>
</body>
</html>`;
}

/** @returns {Promise<Buffer>} PDF laporan Stock Opname Racipan Detail. */
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
    title: "Laporan Stock Opname Racipan Detail",
    margin: { top: "10mm", right: "8mm", bottom: "12mm", left: "8mm" },
    footerTemplate,
  });
}

module.exports = { generate };
