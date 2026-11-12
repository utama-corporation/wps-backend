const { generateReportPdf } = require("../../core/utils/pdf/report-generator");

// Laporan Stock Opname (Ascend / spare part) - HTML untuk report-generator
// (puppeteer), tanpa Crystal Report. Tampilan mengikuti laporan legacy:
// "RU" + judul di tengah, No SO / Tanggal SO di kiri, satu tabel per Family
// dengan kolom No | Family | Item Name | Ascend | Fisik | Total | Remark,
// angka format koma-desimal (673,00), footer "Print by ... Page x of y".

const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]),
  );

const pad = (n) => String(n).padStart(2, "0");

/** 673 -> "673,00"; null/kosong -> "" (selaras laporan legacy). */
function fmtNum(v) {
  if (v === null || v === undefined || v === "") return "";
  const n = Number(v);
  if (!Number.isFinite(n)) return "";
  return n.toFixed(2).replace(".", ",");
}

/** Tanggal SO -> dd/MM/yyyy. */
function fmtTanggal(v) {
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** Waktu cetak footer -> dd/MM/yyyy HH:mm:ss. */
function fmtWaktu(d) {
  return `${fmtTanggal(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** Total = selisih (fisik - (sistem + pemakaian)); kosong bila 0/belum diisi. */
function fmtTotal(selisih) {
  const n = Number(selisih);
  if (!Number.isFinite(n) || Math.round(n * 100) === 0) return "";
  return fmtNum(n);
}

function buildHtml({ noSO, tanggal, rows }) {
  // Data sudah ORDER BY FamilyName - kelompokkan family berturut-turut.
  const groups = [];
  for (const r of rows) {
    const family = r.FamilyName || "";
    const last = groups[groups.length - 1];
    if (last && last.family === family) last.rows.push(r);
    else groups.push({ family, rows: [r] });
  }

  const tables = groups
    .map((g) => {
      const body = g.rows
        .map(
          (r, i) => `          <tr>
            <td class="c">${i + 1}</td>
            <td class="fam">${esc(g.family)}</td>
            <td class="nm">${esc(r.ItemName)}</td>
            <td class="n">${fmtNum(r.Pcs)}</td>
            <td class="n">${fmtNum(r.QtyFisik)}</td>
            <td class="n">${fmtTotal(r.Selisih)}</td>
            <td class="rmk">${esc(r.UsageRemark || "")}</td>
          </tr>`,
        )
        .join("\n");
      return `        <table>
          <thead>
            <tr>
              <th class="c">No</th>
              <th class="fam">Family</th>
              <th class="nm">Item Name</th>
              <th class="n">Ascend</th>
              <th class="n">Fisik</th>
              <th class="n">Total</th>
              <th class="rmk">Remark</th>
            </tr>
          </thead>
          <tbody>
${body}
          </tbody>
        </table>`;
    })
    .join("\n");

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
  td { padding: 6px 6px; }
  .c { width: 6.5%; text-align: center; }
  .fam { width: 21%; }
  .nm { width: 40%; }
  .n { width: 7.8%; text-align: right; }
  .rmk { width: 9%; }
  tr { page-break-inside: avoid; }
</style>
</head>
<body>
  <p class="ru">RU</p>
  <p class="title">Laporan Stock Opname (Ascend)</p>
  <div class="meta">
    <p>No SO : ${esc(noSO)}</p>
    <p>Tanggal SO : ${esc(fmtTanggal(tanggal))}</p>
  </div>
${tables}
</body>
</html>`;
}

/** @returns {Promise<Buffer>} PDF laporan Stock Opname Ascend. */
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
    title: "Laporan Stock Opname (Ascend)",
    margin: { top: "10mm", right: "8mm", bottom: "12mm", left: "8mm" },
    footerTemplate,
  });
}

module.exports = { generate };
