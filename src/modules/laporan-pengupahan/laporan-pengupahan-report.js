const { generateReportPdf } = require("../../core/utils/pdf/report-generator");

const esc = (v) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const angka = (v) => Number(v) || 0;
const desimal = (v) => String(angka(v)).replace(".", ",");

function rupiah(v) {
  const [whole, cents] = angka(v).toFixed(2).split(".");
  return `Rp ${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${cents}`;
}

function catatan(r) {
  return r.keterangan
    ? `<tr class="catatan"><td colspan="8">${esc(r.keterangan)}</td></tr>`
    : "";
}

function barisKolom(r) {
  return `
      <tr>
        <td class="c">${r.no}</td>
        <td>${esc(r.tanggal)}</td>
        <td class="c">${desimal(r.tebal)}</td>
        <td class="r">${r.tingkatPendek || "-"}</td>
        <td class="r">${r.upahPendek ? rupiah(r.upahPendek) : "-"}</td>
        <td class="r">${r.tingkatPanjang || "-"}</td>
        <td class="r">${r.upahPanjang ? rupiah(r.upahPanjang) : "-"}</td>
        <td class="r bold">${rupiah(r.totalUpah)}</td>
      </tr>`;
}

/** Satu grup Stick By: header, baris per tanggal + tebal, dan subtotal kru. */
function blokGroup(g) {
  return `
    <tr class="group">
      <td colspan="8">${esc(g.nama)}</td>
    </tr>
    ${g.rows.map((r) => barisKolom(r) + catatan(r)).join("")}
    <tr class="subtotal">
      <td colspan="3">Subtotal ${esc(g.nama)}</td>
      <td class="r">${g.total.tingkatPendek}</td>
      <td class="r">${rupiah(g.total.upahPendek)}</td>
      <td class="r">${g.total.tingkatPanjang}</td>
      <td class="r">${rupiah(g.total.upahPanjang)}</td>
      <td class="r">${rupiah(g.total.totalUpah)}</td>
    </tr>`;
}

function buildHtml({ awal, akhir, groups = [], grandTotal }) {
  const total = grandTotal || {
    tingkatPendek: 0,
    upahPendek: 0,
    tingkatPanjang: 0,
    upahPanjang: 0,
    totalUpah: 0,
  };
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
  @page { size: A4 portrait; }
  body { font-family: Arial, sans-serif; font-size: 7pt; color: #283c33; margin: 0; }
  h1 { font-size: 13pt; color: #17382f; margin: 0 0 2mm; }
  .periode { font-size: 8pt; color: #555; margin-bottom: 3mm; }
  table { width: 100%; border-collapse: collapse; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; }
  th { background: #17382f; color: #fff; font-size: 6.5pt; padding: 1.8mm 1mm; text-align: left; }
  td { border-bottom: 1px solid #e3dfd6; padding: 1.2mm 1mm; }
  .c { text-align: center; } .r { text-align: right; } .bold { font-weight: bold; }
  .group td { background: #e7efe9; color: #17382f; font-weight: bold; padding: 2mm 1.5mm; }
  .subtotal td { background: #f5efe7; font-weight: bold; }
  .catatan td { color: #b45309; background: #fffbeb; font-size: 6.5pt; padding: 0.6mm 1mm; }
  .grand td { background: #17382f; color: #fff; font-weight: bold; font-size: 9pt; padding: 2.5mm 1.5mm; }
  .kosong { text-align: center; color: #6c746b; padding: 8mm; }
</style></head><body>
  <h1>Rekap Pengupahan Stick</h1>
  <div class="periode">Periode: ${esc(awal)} s/d ${esc(akhir)}</div>
  <table>
    <thead><tr>
      <th style="width:5%">No</th>
      <th style="width:12%">Tgl</th>
      <th style="width:7%">Tebal</th>
      <th style="width:13%">Tingkat Pendek</th>
      <th style="width:15%">Upah Pendek</th>
      <th style="width:13%">Tingkat Panjang</th>
      <th style="width:15%">Upah Panjang</th>
      <th style="width:20%">Total Upah</th>
    </tr></thead>
    <tbody>
      ${groups.length ? groups.map(blokGroup).join("") : '<tr><td class="kosong" colspan="8">Tidak ada label dengan upah pada periode ini.</td></tr>'}
      <tr class="grand">
        <td colspan="3">GRAND TOTAL</td>
        <td class="r">${total.tingkatPendek}</td>
        <td class="r">${rupiah(total.upahPendek)}</td>
        <td class="r">${total.tingkatPanjang}</td>
        <td class="r">${rupiah(total.upahPanjang)}</td>
        <td class="r">${rupiah(total.totalUpah)}</td>
      </tr>
    </tbody>
  </table>
</body></html>`;
}

async function generate({ awal, akhir, groups, grandTotal, printedBy }) {
  const html = buildHtml({ awal, akhir, groups, grandTotal });
  const footerTemplate = `
    <div style="width:100%;font-size:7pt;font-family:Arial,sans-serif;color:#555;
                padding:0 8mm;display:flex;justify-content:space-between;align-items:center;">
      <span>Print by ${esc(printedBy || "-")}</span>
      <span>WPS - Rekap Pengupahan Stick</span>
      <span>Halaman <span class="pageNumber"></span> dari <span class="totalPages"></span></span>
    </div>`;
  return generateReportPdf(html, {
    format: "A4",
    orientation: "portrait",
    title: "WPS - Rekap Pengupahan Stick",
    margin: { top: "10mm", right: "6mm", bottom: "12mm", left: "6mm" },
    footerTemplate,
    printedBy,
  });
}

module.exports = { esc, rupiah, buildHtml, generate };
