// Laporan PDF Penerimaan Kayu Bulat (pengganti Crystal Report aplikasi legacy):
//   int-ton / ext-ton → golongan TON (daftar log + ringkasan)
//   int-kg  / ext-kg  → golongan KG  (daftar grade + bruto/tara)
// Internal: supplier tampil "Supplier Asal ( Supplier )" bila kayu dari supplier berbeda.
// External: hanya supplier penerima, tanpa kolom keterangan / ringkasan per keterangan.
// Label supplier mengikuti KodeSupplier legacy: "<nama> <singkatan jenis>-<kategori gol> <no truk>".

const { sql, poolPromise } = require("../../core/config/db");
const { getBrowser } = require("../../core/utils/pdf/browser");

const JENIS = {
  "int-ton": { mode: "TON", external: false, title: "Laporan Penerimaan Kayu Bulat (Internal)" },
  "ext-ton": { mode: "TON", external: true, title: "Laporan Penerimaan Kayu Bulat (External)" },
  "int-kg": { mode: "KG", external: false, title: "Laporan Penerimaan Kayu Bulat KG (Internal)" },
  "ext-kg": { mode: "KG", external: true, title: "Laporan Penerimaan Kayu Bulat KG (External)" },
};

const httpError = (status, message) => Object.assign(new Error(message), { status });

const esc = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const fmt = (v, max = 4) =>
  v == null || v === "" || !Number.isFinite(Number(v))
    ? "-"
    : Number(v).toLocaleString("id-ID", { minimumFractionDigits: 0, maximumFractionDigits: max });
const fixed4 = (v) =>
  Number(v ?? 0).toLocaleString("id-ID", { minimumFractionDigits: 4, maximumFractionDigits: 4 });

const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const pad = (n) => String(n).padStart(2, "0");
const fmtTanggal = (d) => {
  const x = d instanceof Date ? d : new Date(d);
  return Number.isNaN(x.getTime()) ? "-" : `${pad(x.getDate())} ${BULAN[x.getMonth()]} ${x.getFullYear()}`;
};

/**
 * Keterangan per log — paritas SQL laporan legacy:
 *  gol 2  (TON, POTONG 3'')  : STD-BKG / MC-BKG / MC-MATA / MC / AFKIR / (T×L ≥ 9 ? STD : AFKIR)
 *  gol 11 (TON, POT 2 4X4)   : MC-MATA / MC / BKG / AFKIR / (T×L ≥ 16 ? STD : AFKIR)
 *  lainnya                   : flag yang aktif digabung, "STD" bila tidak ada (sama dengan editor).
 */
function ketOf(idPengukuran, r) {
  const afkir = !!r.IsAfkir, mc = !!r.IsMC, mata = !!r.IsMCMata, bkg = !!r.IsBangkang;
  const tl = Number(r.Tebal) * Number(r.Lebar);
  if (idPengukuran === 2) {
    if (!afkir && !mc && !mata && bkg) return "STD-BKG";
    if (!afkir && mc && !mata && bkg) return "MC-BKG";
    if (!afkir && !mc && mata && !bkg) return "MC-MATA";
    if (!afkir && mc && !mata && !bkg) return "MC";
    if (afkir && !mc && !mata && !bkg) return "AFKIR";
    return tl >= 9 ? "STD" : "AFKIR";
  }
  if (idPengukuran === 11) {
    if (!afkir && !mc && mata && !bkg) return "MC-MATA";
    if (!afkir && mc && !mata && !bkg) return "MC";
    if (!afkir && !mc && !mata && bkg) return "BKG";
    if (afkir && !mc && !mata && !bkg) return "AFKIR";
    return tl >= 16 ? "STD" : "AFKIR";
  }
  const parts = [];
  if (afkir) parts.push("AFKIR");
  if (mc) parts.push("MC");
  if (mata) parts.push("MC-MATA");
  if (bkg) parts.push("BANGKANG");
  return parts.length ? parts.join(", ") : "STD";
}

async function fetchData(no) {
  const pool = await poolPromise;
  const h = await pool.request().input("no", sql.VarChar, no).query(`
    SELECT A.NoKayuBulat, A.DateCreate, A.IdPengukuran, A.NoTruk, A.NoPlat, A.Suket,
           A.IdSupplierAsalKayu,
           B.NmSupplier, C.NmSupplier AS NmSupplierAsal,
           J.Jenis, J.Singkatan,
           G.GolPengukuran, G.Kategori,
           T.NamaTanah, KG.Bruto, KG.Tara
    FROM KayuBulat_h A
    LEFT JOIN MstSupplier B ON B.IdSupplier = A.IdSupplier
    LEFT JOIN MstSupplier C ON C.IdSupplier = A.IdSupplierAsalKayu
    LEFT JOIN MstJenisKayu J ON J.IdJenisKayu = A.IdJenisKayu
    LEFT JOIN MstGolPengukuran G ON G.IdPengukuran = A.IdPengukuran
    LEFT JOIN MstSuratTanah T ON T.IdTanah = A.IdTanah
    LEFT JOIN KayuBulatKG_h KG ON KG.NoKayuBulat = A.NoKayuBulat
    WHERE A.NoKayuBulat = @no
  `);
  const header = h.recordset[0];
  if (!header) throw httpError(404, "Data penerimaan tidak ditemukan");
  return header;
}

async function fetchTon(no, idPengukuran) {
  const pool = await poolPromise;
  const r = await pool.request().input("no", sql.VarChar, no).query(`
    SELECT NoLog, Tebal, Lebar, Panjang,
           FLOOR(Tebal * Lebar * Panjang / 7200.8 * 10000) / 10000 AS Ton,
           IsAfkir, IsMC, IsMCMata, IsBangkang
    FROM KayuBulat_d
    WHERE NoKayuBulat = @no
    ORDER BY NoLog ASC
  `);
  return r.recordset.map((row) => ({ ...row, Ket: ketOf(idPengukuran, row) }));
}

async function fetchKg(no) {
  const pool = await poolPromise;
  const r = await pool.request().input("no", sql.VarChar, no).query(`
    SELECT A.NoUrut, C.NamaGrade, A.JmlhBatang, A.Berat
    FROM KayuBulatKG_d A
    INNER JOIN MstGradeKB C ON C.IdGradeKB = A.IdGradeKB
    WHERE A.NoKayuBulat = @no
    ORDER BY A.NoUrut ASC
  `);
  return r.recordset;
}

function supplierLabel(h, external) {
  const nama =
    !external && h.IdSupplierAsalKayu != null && h.NmSupplierAsal
      ? `${h.NmSupplierAsal} ( ${h.NmSupplier} )`
      : h.NmSupplier || "";
  return `${nama} ${h.Singkatan || ""}-${h.Kategori || ""} ${h.NoTruk ?? ""}`.replace(/\s+/g, " ").trim();
}

const CSS = `
  @page { size: A4; margin: 14mm 12mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 10.5px; color: #111; margin: 0; }
  h1 { font-size: 15px; margin: 0 0 2px; text-align: center; letter-spacing: .3px; }
  .sub { text-align: center; font-size: 10px; color: #555; margin-bottom: 10px; }
  table.info { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
  table.info td { padding: 2px 4px; vertical-align: top; }
  table.info td.k { width: 17%; color: #444; }
  table.info td.s { width: 1%; }
  table.info td.v { font-weight: 600; width: 32%; }
  table.grid { width: 100%; border-collapse: collapse; }
  table.grid th { background: #222; color: #fff; padding: 4px 6px; text-align: left; font-size: 10px; }
  table.grid td { padding: 3px 6px; border-bottom: 1px solid #ddd; }
  table.grid tr:nth-child(even) td { background: #f6f7f8; }
  .r, table.grid th.r, table.sum th.r { text-align: right; } .c, table.grid th.c { text-align: center; }
  tfoot td { font-weight: 700; border-top: 2px solid #222 !important; background: #fff !important; }
  h2 { font-size: 11px; margin: 14px 0 4px; }
  table.sum { border-collapse: collapse; min-width: 55%; }
  table.sum th { background: #444; color: #fff; padding: 3px 8px; text-align: left; font-size: 10px; }
  table.sum td { padding: 3px 8px; border-bottom: 1px solid #ddd; }
  .foot { margin-top: 18px; font-size: 9px; color: #555; }
`;

function infoHtml(h, supplier) {
  const row = (k1, v1, k2, v2) =>
    `<tr><td class="k">${k1}</td><td class="s">:</td><td class="v">${esc(v1)}</td>` +
    `<td class="k">${k2}</td><td class="s">:</td><td class="v">${esc(v2)}</td></tr>`;
  return `<table class="info">
    ${row("No. Penerimaan", h.NoKayuBulat, "Tanggal", fmtTanggal(h.DateCreate))}
    ${row("Supplier", supplier, "Jenis Kayu", h.Jenis || "-")}
    ${row("No. Plat", h.NoPlat || "-", "No. Suket", h.Suket || "-")}
    ${row("Gol. Pengukuran", h.GolPengukuran || "-", "Surat Tanah", h.NamaTanah || "-")}
  </table>`;
}

function tonBody(rows, external) {
  const totalTon = rows.reduce((a, r) => a + Number(r.Ton || 0), 0);
  const head = external
    ? `<th class="c">NO</th><th class="r">TEBAL</th><th class="r">LEBAR</th><th class="r">PANJANG</th><th class="r">TON</th>`
    : `<th class="c">NO</th><th class="r">TEBAL</th><th class="r">LEBAR</th><th class="r">PANJANG</th><th class="r">TON</th><th>KETERANGAN</th>`;
  const body = rows
    .map(
      (r) =>
        `<tr><td class="c">${r.NoLog}</td><td class="r">${fmt(r.Tebal)}</td><td class="r">${fmt(r.Lebar)}</td>` +
        `<td class="r">${fmt(r.Panjang)}</td><td class="r">${fixed4(r.Ton)}</td>` +
        (external ? "" : `<td>${esc(r.Ket)}</td>`) +
        `</tr>`,
    )
    .join("");
  const colspan = 4;
  let html = `<table class="grid"><thead><tr>${head}</tr></thead><tbody>${body}</tbody>
    <tfoot><tr><td colspan="${colspan}" class="r">TOTAL (${rows.length} batang)</td><td class="r">${fixed4(totalTon)}</td>${external ? "" : "<td></td>"}</tr></tfoot></table>`;

  if (!external) {
    const per = new Map();
    for (const r of rows) {
      const cur = per.get(r.Ket) || { n: 0, ton: 0 };
      cur.n += 1;
      cur.ton += Number(r.Ton || 0);
      per.set(r.Ket, cur);
    }
    const sum = [...per.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `<tr><td>${esc(k)}</td><td class="r">${v.n}</td><td class="r">${fixed4(v.ton)}</td></tr>`)
      .join("");
    html += `<h2>Ringkasan per Keterangan</h2>
      <table class="sum"><thead><tr><th>KETERANGAN</th><th class="r">JMLH BATANG</th><th class="r">TON</th></tr></thead>
      <tbody>${sum}</tbody></table>`;
  }
  return html;
}

function kgBody(rows, h) {
  const totalBatang = rows.reduce((a, r) => a + Number(r.JmlhBatang || 0), 0);
  const totalBerat = rows.reduce((a, r) => a + Number(r.Berat || 0), 0);
  const bruto = h.Bruto != null ? Number(h.Bruto) : null;
  const tara = h.Tara != null ? Number(h.Tara) : null;
  const body = rows
    .map(
      (r) =>
        `<tr><td class="c">${r.NoUrut}</td><td>${esc(r.NamaGrade)}</td><td class="r">${fmt(r.JmlhBatang, 2)}</td><td class="r">${fmt(r.Berat, 4)}</td></tr>`,
    )
    .join("");
  return `<table class="grid"><thead><tr><th class="c">NO</th><th>GRADE</th><th class="r">JMLH BATANG</th><th class="r">BERAT (KG)</th></tr></thead>
    <tbody>${body}</tbody>
    <tfoot><tr><td colspan="2" class="r">TOTAL</td><td class="r">${fmt(totalBatang, 2)}</td><td class="r">${fmt(totalBerat, 4)}</td></tr></tfoot></table>
    <h2>Timbangan</h2>
    <table class="sum"><tbody>
      <tr><td>Bruto</td><td class="r">${bruto != null ? fmt(bruto, 2) : "-"}</td></tr>
      <tr><td>Tara</td><td class="r">${tara != null ? fmt(tara, 2) : "-"}</td></tr>
      <tr><td>Netto (Bruto − Tara)</td><td class="r">${bruto != null && tara != null ? fmt(bruto - tara, 2) : "-"}</td></tr>
    </tbody></table>`;
}

async function buildHtml(jenis, no, username) {
  const cfg = JENIS[jenis];
  if (!cfg) throw httpError(400, "Jenis laporan tidak dikenal");
  if (!no) throw httpError(400, "Nomor penerimaan wajib diisi");

  const h = await fetchData(no);
  const isKg = String(h.GolPengukuran || "").trim().toUpperCase() === "KG";
  if (cfg.mode === "KG" && !isKg) throw httpError(400, "Maaf, laporan ini hanya untuk penerimaan kayu bulat (KG)");
  if (cfg.mode === "TON" && isKg) throw httpError(400, "Maaf, laporan ini bukan bagian dari penerimaan kayu bulat (KG)");

  const supplier = supplierLabel(h, cfg.external);
  const body =
    cfg.mode === "KG" ? kgBody(await fetchKg(no), h) : tonBody(await fetchTon(no, h.IdPengukuran), cfg.external);

  const now = new Date();
  const cetak = `${fmtTanggal(now)} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body>
    <h1>${esc(cfg.title.toUpperCase())}</h1>
    <div class="sub">${esc(h.NoKayuBulat)}</div>
    ${infoHtml(h, supplier)}
    ${body}
    <div class="foot">Dicetak oleh ${esc(username || "-")} pada ${esc(cetak)}</div>
  </body></html>`;
}

async function generatePdf(jenis, no, username) {
  const html = await buildHtml(jenis, no, username);
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: "networkidle0" });
    return await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true });
  } finally {
    await page.close();
  }
}

module.exports = { generatePdf, buildHtml, JENIS };
