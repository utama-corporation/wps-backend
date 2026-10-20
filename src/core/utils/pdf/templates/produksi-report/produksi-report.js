const fs = require("fs");
const path = require("path");

const templatePath = path.join(__dirname, "produksi-report.html");

function esc(v) {
  return String(v ?? "-")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Nilai kosong dari DB (NULL / '') tetap ditampilkan sebagai "-" supaya meta tidak bolong. */
function dash(v) {
  if (v === null || v === undefined) return "-";
  const s = String(v).trim();
  return s === "" ? "-" : s;
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
        <th>No. SPK</th>
      </tr>
    </thead>`;

  const body = [];
  let lastGrp = null;
  for (const r of rows) {
    if (r.Grp !== lastGrp) {
      lastGrp = r.Grp;
      body.push(`<tr><td class="grp" colspan="7">${esc(r.Grp)}</td></tr>`);
    }
    body.push(`<tr>
        <td>${esc(r.NoLabel)}</td>
        <td class="num">${esc(fmtNumId(r.Tebal, 1))}</td>
        <td class="num">${esc(fmtNumId(r.Lebar, 1))}</td>
        <td class="num">${esc(fmtNumId(r.Panjang, 1))}</td>
        <td class="num">${esc(fmtNumId(r.JmlhBatang, 0))}</td>
        <td class="num">${esc(fmtNumId(r.Kubik, 4))}</td>
        <td>${esc(dash(r.NoSPK))}</td>
      </tr>`);
  }

  const foot = `
    <tfoot>
      <tr>
        <td colspan="4">TOTAL</td>
        <td class="num">${esc(fmtNumId(total.batang, 0))}</td>
        <td class="num">${esc(fmtNumId(total.kubik, 4))}</td>
        <td></td>
      </tr>
    </tfoot>`;

  return `<table class="grid">${head}<tbody>${body.join("\n")}</tbody>${foot}</table>`;
}

/**
 * Tabel daftar REPAIR - masih berbasis label, jadi kolom No. Label & No. SPK
 * tetap ada.
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
        <td>${esc(dash(r.NoSPK))}</td>
      </tr>`,
  );

  const foot = `
    <tfoot>
      <tr>
        <td colspan="4">TOTAL</td>
        <td class="num">${esc(fmtNumId(total.batang, 0))}</td>
        <td class="num">${esc(fmtNumId(total.kubik, 4))}</td>
        <td></td>
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
        <th>No. SPK</th>
      </tr>
    </thead>
    <tbody>${body.join("\n")}</tbody>
    ${foot}
  </table>`;
}

/**
 * Tabel AFKIR - sumbernya tabel reject proses (<Proses>Produksi_Reject)
 * yang isinya murni dimensi, tanpa nomor label maupun nomor SPK.
 * Karena itu kolom No. Label dihapus dari format AFKIR.
 */
function buildAfkirTable(rows, total) {
  if (!rows || rows.length === 0) {
    return `<div class="empty">Tidak ada data</div>`;
  }

  const body = rows.map(
    (r) => `<tr>
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
        <td colspan="3">TOTAL</td>
        <td class="num">${esc(fmtNumId(total.batang, 0))}</td>
        <td class="num">${esc(fmtNumId(total.kubik, 4))}</td>
      </tr>
    </tfoot>`;

  return `<table class="grid">
    <thead>
      <tr>
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
 * Satu template untuk semua laporan produksi (S4S, Finger Join, Moulding,
 * Laminating, Cross Cut Akhir, Sanding, Barang Jadi) - yang berbeda hanya
 * sub-judul, karena bentuk tabelnya sama persis.
 *
 * @param {object} report hasil produksi-report-service.getProduksiReport()
 * @param {object} [options]
 * @param {string} [options.subJudul] - nama proses, mis. "Moulding"
 * @returns {string} HTML siap render ke PDF
 */
function buildProduksiReportHtml(report, options = {}) {
  const tpl = fs.readFileSync(templatePath, "utf8");
  const h = report && report.header ? report.header : {};
  const t = report.total;

  // Scalar wajib di-escape; inputTable/outputTable/flagTable sudah HTML jadi
  // dan harus disisipkan mentah.
  const scalars = {
    subJudul: esc(options.subJudul || "-"),
    noProduksi: esc(h.NoProduksi),
    tanggal: fmtTanggal(h.Tanggal),
    shift: esc(dash(h.Shift)),
    namaMesin: esc(h.NamaMesin),
    namaOperator: esc(h.NamaOperator),
    jamKerja: esc(dash(h.JamKerja)),
    hourMeter: esc(dash(h.HourMeter)),
    jamLembur: esc(dash(h.JamLembur)),
    jmlhAnggota: esc(dash(h.JmlhAnggota)),
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
    afkirTable: buildAfkirTable(report.afkirs, t.afkir),
  };

  return tpl.replace(/\{\{(\w+)\}\}/g, (m, key) =>
    Object.prototype.hasOwnProperty.call(map, key) ? String(map[key] ?? "-") : m,
  );
}

module.exports = { buildProduksiReportHtml };