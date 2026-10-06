const fs = require("fs");
const path = require("path");

const templatePath = path.join(__dirname, "fj-produksi-report.html");

function esc(v) {
  return String(v ?? "-")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Angka gaya Indonesia: ribuan "." desimal "," (mirror DecimalFormat "#,###.##") */
function fmtNumId(v, decimals = 2) {
  const n = parseFloat(v);
  if (!Number.isFinite(n)) return "-";
  // toFixed(0) tidak menghasilkan titik desimal, jadi decRaw bisa undefined.
  const [intPart, decRaw = ""] = Math.abs(n).toFixed(decimals).split(".");
  const withThousands = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const dec = decRaw.replace(/0+$/, "");
  const sign = n < 0 ? "-" : "";
  return dec ? `${sign}${withThousands},${dec}` : `${sign}${withThousands}`;
}

function fmtTanggal(v) {
  if (!v) return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/**
 * Bangun tabel input / output.
 * Kolom Repair & Afkir tidak lagi ada di sini - keduanya sudah dipindah ke
 * tabel REPAIR dan AFKIR masing-masing.
 */
function buildTable(rows, total) {
  if (!rows || rows.length === 0) {
    return `<div class="empty">Tidak ada data</div>`;
  }

  const head = `
    <thead>
      <tr>
        <th style="width:60px;">No. Label</th>
        <th class="num">Tebal</th>
        <th class="num">Lebar</th>
        <th class="num">Panjang</th>
        <th class="num">Batang</th>
        <th class="num">Kubik</th>
      </tr>
    </thead>`;

  const body = [];
  let lastGrp = null;
  for (const r of rows) {
    if (r.Grp !== lastGrp) {
      lastGrp = r.Grp;
      body.push(`<tr><td class="grp" colspan="6">${esc(r.Grp)}</td></tr>`);
    }
    body.push(`<tr>
        <td>${esc(r.NoLabel)}</td>
        <td class="num">${esc(fmtNumId(r.Tebal, 1))}</td>
        <td class="num">${esc(fmtNumId(r.Lebar, 1))}</td>
        <td class="num">${esc(fmtNumId(r.Panjang, 1))}</td>
        <td class="num">${esc(fmtNumId(r.JmlhBatang, 0))}</td>
        <td class="num">${esc(fmtNumId(r.Kubik, 4))}</td>
      </tr>`);
  }

  const foot = `
    <tfoot>
      <tr>
        <td colspan="4">TOTAL</td>
        <td class="num">${esc(fmtNumId(total.batang, 0))}</td>
        <td class="num">${esc(fmtNumId(total.kubik, 4))}</td>
      </tr>
    </tfoot>`;

  return `<table class="grid">${head}<tbody>${body.join("\n")}</tbody>${foot}</table>`;
}

/**
 * Tabel daftar output yang berflag Repair atau Afkir.
 * Dipanggil dua kali: sekali untuk Repair, sekali untuk Afkir.
 */
function buildFlagTable(rows, total) {
  if (!rows || rows.length === 0) {
    return `<div class="empty">Tidak ada data</div>`;
  }

  const body = rows.map(
    (r) => `<tr>
        <td>${esc(r.NoLabel)}</td>
        <td class="num">${esc(fmtNumId(r.Tebal, 1))}</td>
        <td class="num">${esc(fmtNumId(r.Lebar, 1))}</td>
        <td class="num">${esc(fmtNumId(r.Panjang, 1))}</td>
        <td class="num">${esc(fmtNumId(r.JmlhBatang, 0))}</td>
        <td class="num">${esc(fmtNumId(r.Kubik, 4))}</td>
      </tr>`,
  );

  const foot = `
    <tfoot>
      <tr>
        <td colspan="4">TOTAL</td>
        <td class="num">${esc(fmtNumId(total.batang, 0))}</td>
        <td class="num">${esc(fmtNumId(total.kubik, 4))}</td>
      </tr>
    </tfoot>`;

  return `<table class="grid">
    <thead>
      <tr>
        <th style="width:58px;">No. Label</th>
        <th class="num">Tebal</th>
        <th class="num">Lebar</th>
        <th class="num">Panjang</th>
        <th class="num">Batang</th>
        <th class="num">Kubik</th>
      </tr>
    </thead>
    <tbody>${body.join("\n")}</tbody>
    ${foot}
  </table>`;
}

function fmtPercent(v) {
  if (v === null || v === undefined || !Number.isFinite(Number(v))) return "-";
  return `${fmtNumId(v, 2)} %`;
}

/**
 * @param {object} report hasil service.getProduksiReport(noProduksi)
 * @returns {string} HTML siap render ke PDF
 */
function buildFjProduksiReportHtml(report) {
  const tpl = fs.readFileSync(templatePath, "utf8");
  const h = report && report.header ? report.header : {};
  const t = report.total;

  // Scalar wajib di-escape; inputTable/outputTable/flagTable sudah HTML jadi
  // dan harus disisipkan mentah.
  const scalars = {
    noProduksi: esc(h.NoProduksi),
    tanggal: fmtTanggal(h.Tanggal),
    shift: esc(h.Shift),
    namaMesin: esc(h.NamaMesin),
    namaOperator: esc(h.NamaOperator),
    jamKerja: esc(h.JamKerja),
    jmlhAnggota: esc(h.JmlhAnggota),
    inputCount: esc(t.input.rows),
    inputBatang: fmtNumId(t.input.batang, 0),
    // Jumlah baris pada judul tabel OUTPUT - baris repair/afkir tidak dihitung
    // karena sudah punya tabel sendiri.
    outputCount: esc(t.outputClean.rows),
    outputBatang: fmtNumId(t.outputClean.batang, 0),
    repairCount: esc(t.repair.rows),
    repairBatang: fmtNumId(t.repair.batang, 0),
    afkirCount: esc(t.afkir.rows),
    afkirBatang: fmtNumId(t.afkir.batang, 0),
    // Rendemen berbasis volume (kubik), tetap memakai SELURUH output
    // (bukan hanya outputClean).
    rendemenOutput: fmtNumId(t.output.kubik, 4),
    rendemenInput: fmtNumId(t.input.kubik, 4),
    rendemenPersen: fmtPercent(t.rendemen),
  };

  const map = {
    ...scalars,
    inputTable: buildTable(report.inputs, t.input),
    outputTable: buildTable(report.cleanOutputs, t.outputClean),
    repairTable: buildFlagTable(report.repairs, t.repair),
    afkirTable: buildFlagTable(report.afkirs, t.afkir),
  };

  return tpl.replace(/\{\{(\w+)\}\}/g, (m, key) =>
    Object.prototype.hasOwnProperty.call(map, key) ? String(map[key] ?? "-") : m,
  );
}

module.exports = { buildFjProduksiReportHtml };
