// Laporan PDF "Laporan Data Koordinat" per No. SPK (padanan LapCariKoordinat desktop):
// info SPK (Tanggal / Buyer / Tujuan), tabel barang jadi SPK, dan tabel Data Tanah asal kayu.

const { sql, poolPromise } = require("../../core/config/db");
const { generateReportPdf } = require("../../core/utils/pdf/report-generator");
const svc = require("./cari-koordinat-service");

const esc = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const pad = (n) => String(n).padStart(2, "0");
const fmtTanggal = (d) => {
  if (!d) return "";
  const x = d instanceof Date ? d : new Date(d);
  return Number.isNaN(x.getTime()) ? "" : `${pad(x.getUTCDate())}/${pad(x.getUTCMonth() + 1)}/${x.getUTCFullYear()}`;
};

const BULAN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmtPeriode = (d) => {
  const x = d ? new Date(d) : null;
  return x && !Number.isNaN(x.getTime()) ? `${BULAN[x.getUTCMonth()]}-${x.getUTCFullYear()}` : "";
};

/** Angka format id-ID dengan jumlah desimal tetap; kosong bila bukan angka. */
const fmtNum = (v, digits) => {
  if (v === null || v === undefined || v === "") return "";
  const n = Number(v);
  if (!Number.isFinite(n)) return "";
  return new Intl.NumberFormat("id-ID", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);
};

async function fetchSpk(noSpk) {
  const pool = await poolPromise;
  const run = (text) => pool.request().input("no", sql.VarChar(50), noSpk).query(text);
  const [hdr, bj] = await Promise.all([
    run(`
      SELECT A.NoSPK, A.Tanggal, B.Buyer, A.Tujuan
      FROM MstSPK_h A
      LEFT JOIN MstBuyer B ON B.IdBuyer = A.IdBuyer
      WHERE A.NoSPK = @no
    `),
    run(`
      SELECT C.Jenis, B.NamaBarangJadi, A.Tebal, A.Lebar, A.Panjang, A.Bundle, A.PcsPerBundle
      FROM MstSPK_d A
      LEFT JOIN MstBarangJadi B ON B.IdBarangJadi = A.IdBarangJadi
      LEFT JOIN MstJenisKayu C ON C.IdJenisKayu = A.IdJenisKayu
      WHERE A.NoSPK = @no
      ORDER BY C.Jenis, B.NamaBarangJadi, A.Tebal, A.Lebar, A.Panjang
    `),
  ]);
  return { header: hdr.recordset[0] || null, bj: bj.recordset };
}

const CSS = `
* { box-sizing: border-box; }
body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #000; }
h1 { margin: 0 0 14mm; text-align: center; font-size: 10pt; font-weight: normal; }
.info { margin: 0 0 8mm 5mm; font-size: 9pt; border-collapse: collapse; }
.info td { padding: 1px 0; }
.info td:first-child { width: 17mm; }
.info td:nth-child(2) { width: 4mm; }
table.grid { width: 100%; border-collapse: collapse; }
table.grid th, table.grid td { border: 1px solid #000; }
table.grid thead th { font-weight: normal; text-align: center; padding: 3px 4px; }
table.grid td { padding: 1px 4px; white-space: nowrap; }
table.grid td.r { text-align: right; }
table.grid td.c { text-align: center; }
table.bj { font-size: 9.5pt; margin-bottom: 8mm; }
table.bj thead th { padding: 4px; }
.sub { margin: 0 0 1.5mm; font-size: 7.5pt; text-decoration: underline; }
table.tanah { font-size: 7.5pt; font-family: Calibri, Carlito, Arial, sans-serif; }
table.tanah td { white-space: normal; }
thead { display: table-header-group; }
tr { page-break-inside: avoid; }
`;

function buildHtml({ noSpk, header, bj, tanah }) {
  const th = (items) => `<tr>${items.map((t) => `<th>${esc(t)}</th>`).join("")}</tr>`;
  const bjRows = bj
    .map(
      (r) =>
        `<tr><td>${esc(r.Jenis)}</td><td>${esc(r.NamaBarangJadi)}</td>` +
        [r.Tebal, r.Lebar, r.Panjang, r.Bundle, r.PcsPerBundle].map((v) => `<td class="r">${fmtNum(v, 2)}</td>`).join("") +
        `</tr>`,
    )
    .join("");
  const tanahRows = tanah
    .map(
      (r) =>
        `<tr><td>${esc(r.NamaTanah)}</td><td>${esc(r.DesaKelurahan)}</td><td>${esc(r.KabupatenKota)}</td>` +
        `<td>${esc(r.Provinsi)}</td><td class="c">${esc(fmtPeriode(r.Periode))}</td>` +
        `<td class="r">${fmtNum(r.Luas, 3)}</td><td>${esc(r.Koordinat)}</td></tr>`,
    )
    .join("");

  return `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body>
<h1>Laporan Data Koordinat</h1>
<table class="info">
<tr><td>No SPK</td><td>:</td><td>${esc(noSpk)}</td></tr>
<tr><td>Tanggal</td><td>:</td><td>${esc(fmtTanggal(header.Tanggal))}</td></tr>
<tr><td>Buyer</td><td>:</td><td>${esc(header.Buyer)}</td></tr>
<tr><td>Tujuan</td><td>:</td><td>${esc(header.Tujuan)}</td></tr>
</table>
<table class="grid bj"><thead>${th(["Jenis", "NamaBarangJadi", "Tebal", "Lebar", "Panjang", "Bundle", "PcsPerBundle"])}</thead>
<tbody>${bjRows}</tbody></table>
<p class="sub">Data Tanah</p>
<table class="grid tanah"><thead>${th(["NamaTanah", "Desa / Kelurahan", "Kabupaten / Kota", "Provinsi", "Periode", "Luas", "Koordinat"])}</thead>
<tbody>${tanahRows}</tbody></table>
</body></html>`;
}

/** Buffer PDF Laporan Data Koordinat untuk satu No. SPK. */
async function buildPdf(noSpkRaw) {
  const noSpk = String(noSpkRaw ?? "").trim();
  if (!noSpk) throw Object.assign(new Error("No. SPK harus dipilih."), { status: 400 });

  const [{ header, bj }, tanah] = await Promise.all([fetchSpk(noSpk), svc.getTanah(noSpk)]);
  if (!header) throw Object.assign(new Error(`SPK ${noSpk} tidak ditemukan.`), { status: 404 });

  return generateReportPdf(buildHtml({ noSpk, header, bj, tanah }), {
    format: "A4",
    orientation: "portrait",
    margin: { top: "10mm", right: "10mm", bottom: "10mm", left: "10mm" },
    footerTemplate: "<div></div>",
  });
}

module.exports = { buildPdf };
