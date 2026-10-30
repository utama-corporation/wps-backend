// Laporan PDF Penerimaan Kayu Bulat (pengganti Crystal Report aplikasi legacy):
//   int-ton / ext-ton → golongan TON (daftar log + ringkasan)
//   int-kg  / ext-kg  → golongan KG  (daftar grade + bruto/tara)
// Internal: supplier tampil "Supplier Asal ( Supplier )" bila kayu dari supplier berbeda.
// External: hanya supplier penerima, tanpa kolom keterangan / ringkasan per keterangan.
// Label supplier mengikuti KodeSupplier legacy: "<nama> <singkatan jenis>-<kategori gol> <no truk>".

const { sql, poolPromise } = require("../../core/config/db");
const { getBrowser } = require("../../core/utils/pdf/browser");

const JENIS = {
  "int-ton": { mode: "TON", external: false, title: "Laporan Penerimaan Kayu Bulat" },
  "ext-ton": { mode: "TON", external: true, title: "Laporan Penerimaan Kayu Bulat" },
  "int-kg": { mode: "KG", external: false, title: "Laporan Penerimaan Kayu Bulat KG" },
  "ext-kg": { mode: "KG", external: true, title: "Laporan Penerimaan Kayu Bulat KG" },
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
  @page ton-report { size: A4; margin: 7.5mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 10.5px; color: #111; margin: 0; }
  h1 { font-size: 15px; margin: 0 0 2px; text-align: center; letter-spacing: .3px; }
  .ton-report { page: ton-report; }
  .ton-report h1 { font-size: 12px; margin-bottom: 4px; }
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
  .ton-columns { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-top: 8px; }
  .ton-panel { min-width: 0; border: 1px solid #111; }
  table.ton-grid { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 8.1px; }
  table.ton-grid th, table.ton-grid td { border-right: 1px solid #111; border-bottom: 1px solid #111; padding: 2px 3px; white-space: nowrap; }
  table.ton-grid th:last-child, table.ton-grid td:last-child { border-right: 0; }
  table.ton-grid th { font-weight: 400; text-align: center; }
  table.ton-grid .no { width: 15%; text-align: center; }
  table.ton-grid .dim { width: 19%; text-align: right; }
  table.ton-grid .ton { width: 22%; text-align: right; }
  table.ton-grid .ket { width: 24%; }
  table.ton-grid tfoot td { border-top: 1px solid #111 !important; border-bottom: 0; font-weight: 700; }
  .ton-summary { margin: 12px 0 0 auto; width: 42%; }
  .ton-info { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 8px; }
  table.ton-info-table { width: 100%; border: 1px solid #111; border-collapse: collapse; font-size: 8.1px; }
  table.ton-info-table td { border-bottom: 1px solid #111; padding: 4px 5px; }
  table.ton-info-table tr:last-child td { border-bottom: 0; }
  table.ton-info-table td:first-child { width: 34%; }
  .r, table.grid th.r, table.sum th.r { text-align: right; } .c, table.grid th.c { text-align: center; }
  tfoot td { font-weight: 700; border-top: 2px solid #222 !important; background: #fff !important; }
  h2 { font-size: 11px; margin: 14px 0 4px; }
  table.sum { border-collapse: collapse; min-width: 55%; }
  table.sum th { background: #444; color: #fff; padding: 3px 8px; text-align: left; font-size: 10px; }
  table.sum td { padding: 3px 8px; border-bottom: 1px solid #ddd; }
  table.signatures { width: 100%; border-collapse: collapse; margin-top: 18px; table-layout: fixed; }
  table.signatures td { width: 33.333%; padding: 0 6px; text-align: center; vertical-align: top; }
  table.signatures.seven td { width: 14.2857%; padding: 0 2px; font-size: 8.5px; }
  table.signatures.seven .line { padding-top: 40px; }
  table.signatures .name { font-weight: 600; }
  table.signatures .line { padding-top: 24px; font-size: 10px; white-space: pre; }

  @page ton-report { size: A4; margin: 0; }
  body.ton-report { page: ton-report; padding: 0; font-size: 9px; }
  .tp { position: relative; width: 210mm; height: 296mm; padding: 8mm 10mm 0; page-break-after: always; overflow: hidden; }
  .tp:last-child { page-break-after: auto; }
  .tp-title { text-align: center; font-size: 12px; font-weight: 700; position: relative; }
  .tp-title .pg { position: absolute; right: 0; top: 0; font-size: 9px; font-weight: 400; }
  .tp-info { display: flex; margin: 8px 0 6px; font-size: 9px; }
  .tp-info table { border-collapse: collapse; table-layout: fixed; } .tp-info td { padding: 1px 3px; }
  .tp-info td:first-child { width: 16mm; white-space: nowrap; }
  .tp-info .il { width: 62%; } .tp-info .ir { width: 38%; }
  table.tp-grid { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 9px; }
  table.tp-grid th { font-weight: 400; text-align: center; padding: 1px 3px; border-top: 1px solid #111; border-bottom: 1px solid #111; }
  table.tp-grid td { text-align: right; padding: 0 3px; height: 4.55mm; }
  table.tp-grid .n { text-align: left; } table.tp-grid .k { text-align: left; }
  .tp-panels { display: flex; gap: 3mm; }
  .tp-panels table.tp-grid th, .tp-panels table.tp-grid td { border-right: 1px solid #111; }
  .tp-panels table.tp-grid th:last-child, .tp-panels table.tp-grid td:last-child { border-right: 0; }
  .tp-panels table.tp-grid { flex: 1; min-width: 0; border: 1px solid #111; }
  .tp-sign { margin-top: 3mm; font-size: 9px; display: flex; align-items: flex-start; gap: 4mm; }
  .tp-sign .sg { flex: 1; }
  .tp-sign table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  .tp-sign td { vertical-align: top; padding: 0 2px; }
  .tp-sum { border-collapse: collapse; } .tp-sum td { padding: 0 4px; } .tp-sum td.v { text-align: right; }
  .tp-foot { position: absolute; left: 10mm; right: 10mm; bottom: 6mm; font-size: 8.5px; }
  .tp-foot .row { display: flex; justify-content: space-between; }
  body { padding-bottom: 12mm; }
  .foot { position: fixed; left: 0; bottom: 0; width: 100%; font-size: 9px; color: #555; text-align: left; }
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

function signatureHtml(thirdLabel) {
  return `<table class="signatures"><tbody><tr>
      <td class="name">Ukur 1</td><td class="name">Diperiksa Oleh</td><td class="name">${thirdLabel}</td>
    </tr><tr>
      <td class="line">(                    )</td><td class="line">(                              )</td><td class="line">(                        )</td>
    </tr></tbody></table>`;
}

function externalSignatureHtml() {
  const labels = ["Ukur 1 ;", "Ukur 2 ;", "Tally Tulis ;", "Diperiksa Oleh ;", "QC Oleh ;", "DiInput Oleh ;", "Supir ;"];
  return `<table class="signatures seven"><tbody><tr>${labels.map((label) => `<td class="name">${label}</td>`).join("")}</tr><tr>${labels.map(() => `<td class="line">(                    )</td>`).join("")}</tr></tbody></table>`;
}

const ENG_MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const tanggalEn = (d) => {
  const x = d instanceof Date ? d : new Date(d);
  return Number.isNaN(x.getTime()) ? "-" : `${pad(x.getDate())} ${ENG_MONTH[x.getMonth()]} ${x.getFullYear()}`;
};
const dot4 = (v) => Number(v ?? 0).toFixed(4);
const dim2 = (v) => Number(v ?? 0).toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const TON_PER_PAGE = 90; // 45 baris x 2 panel, sama dengan laporan Crystal

// Laporan TON mengikuti format Crystal: judul + "Page x of y" tiap halaman, dua panel (ganjil | genap),
// tanda tangan + ringkasan hanya di halaman terakhir, footer "*//internal|external" + "Print by".
function tonReportHtml(h, supplier, rows, external, username) {
  const pages = Math.max(1, Math.ceil(rows.length / TON_PER_PAGE));
  const isAfkir = (r) => r.Ket === "AFKIR";
  const stdTon = rows.filter((r) => !isAfkir(r)).reduce((a, r) => a + Number(r.Ton || 0), 0);
  const afkirTon = rows.filter(isAfkir).reduce((a, r) => a + Number(r.Ton || 0), 0);
  const jenis = String(h.Jenis || "").toUpperCase();
  const now = new Date();
  const cetak = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

  const cell = (r) =>
    r
      ? `<td class="n">${r.NoLog}</td><td>${dim2(r.Tebal)}</td><td>${dim2(r.Lebar)}</td><td>${dim2(r.Panjang)}</td><td>${dot4(r.Ton)}</td>${external ? "" : `<td class="k">${esc(r.Ket)}</td>`}`
      : `<td></td><td></td><td></td><td></td><td></td>${external ? "" : "<td></td>"}`;
  const head = `<th>No</th><th>Tebal</th><th>Lebar</th><th>Panjang</th><th>Ton</th>${external ? "" : '<th>Keterangan</th>'}`;
  const cols = external
    ? '<col style="width:9%"><col style="width:12%"><col style="width:12%"><col style="width:12%"><col style="width:13%">'
    : '<col style="width:7%"><col style="width:9%"><col style="width:9%"><col style="width:9%"><col style="width:10%"><col style="width:8%">';
  

  const sign = external
    ? ["Ukur 1 ;", "Ukur 2 ;", "Tally Tulis ;", "Diperiksa Oleh ;", "QC Oleh ;", "", "Supir ;"]
    : ["Ukur 1 ;", "Ukur 2 ;", "Tally Tulis ;", "Diperiksa Oleh ;", "QC Oleh ;", "", ""];
  const summary =
    (() => {
        const per = new Map();
        for (const r of rows) per.set(r.Ket, (per.get(r.Ket) || 0) + Number(r.Ton || 0));
        const keys = [...per.keys()].sort((a, b) => (a === "AFKIR" ? -1 : b === "AFKIR" ? 1 : a.localeCompare(b)));
        const total = [...per.values()].reduce((a, v) => a + v, 0);
        return keys.map((k) => `<tr><td>${external ? "" : `KB ${esc(jenis)} `}${esc(k)} :</td><td class="v">${dot4(per.get(k))}</td></tr>`).join("") + `<tr><td>Total :</td><td class="v">${dot4(total)}</td></tr>`;
      })();
  const lastBlock = `<div class="tp-sign"><div class="sg"><table><tr>${sign.map((l) => `<td>${l}</td>`).join("")}</tr>
      <tr>${sign.map((l) => `<td style="padding-top:9mm">${l ? "(&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;)" : ""}</td>`).join("")}</tr></table>
      </div><table class="tp-sum" style="width:auto;flex:none">${summary}</table></div>`;

  let out = "";
  for (let p = 0; p < pages; p++) {
    const chunk = rows.slice(p * TON_PER_PAGE, (p + 1) * TON_PER_PAGE);
    let bodyL = "", bodyR = "";
    for (let i = 0; i < chunk.length; i += 2) { bodyL += `<tr>${cell(chunk[i])}</tr>`; bodyR += `<tr>${cell(chunk[i + 1])}</tr>`; }
    out += `<div class="tp">
      <div class="tp-title">Laporan Penerimaan Kayu Bulat<span class="pg">Page ${p + 1} of ${pages}</span></div>
      <div class="tp-info"><table class="il"><tr><td>Nomor</td><td>: ${esc(h.NoKayuBulat)}</td></tr><tr><td>Tanggal</td><td>: ${esc(tanggalEn(h.DateCreate))}</td></tr><tr><td>Supplier</td><td>: ${esc(supplier)}</td></tr></table>
      <table class="ir"><tr><td>Jenis Kayu</td><td>: ${esc(h.Jenis || "-")}</td></tr><tr><td>No.Plat</td><td>: ${esc(h.NoPlat || "-")}</td></tr><tr><td>No.Suket</td><td>: ${esc(h.Suket || "-")}</td></tr></table></div>
      <div class="tp-panels">${[bodyL, bodyR].map((b) => `<table class="tp-grid"><colgroup>${cols}</colgroup><thead><tr>${head}</tr></thead><tbody>${b}</tbody></table>`).join("")}</div>
      ${p === pages - 1 ? lastBlock : ""}
      <div class="tp-foot"><div class="row"><span>*//${external ? "external" : "internal"}</span><span>Page ${p + 1} of ${pages}</span></div><div>Print by ${esc(username || "-")} on ${cetak}</div></div>
    </div>`;
  }
  return out;
}

function kgBody(rows, h, internal) {
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
  const signatures = internal ? signatureHtml("DiInput Oleh") : externalSignatureHtml();
  return `<table class="grid"><thead><tr><th class="c">NO</th><th>GRADE</th><th class="r">JMLH BATANG</th><th class="r">BERAT (KG)</th></tr></thead>
    <tbody>${body}</tbody>
    <tfoot><tr><td colspan="2" class="r">TOTAL</td><td class="r">${fmt(totalBatang, 2)}</td><td class="r">${fmt(totalBerat, 4)}</td></tr></tfoot></table>
    <h2>Timbangan</h2>
    <table class="sum"><tbody>
      <tr><td>Bruto</td><td class="r">${bruto != null ? fmt(bruto, 2) : "-"}</td></tr>
      <tr><td>Tara</td><td class="r">${tara != null ? fmt(tara, 2) : "-"}</td></tr>
      <tr><td>Netto (Bruto − Tara)</td><td class="r">${bruto != null && tara != null ? fmt(bruto - tara, 2) : "-"}</td></tr>
    </tbody></table>${signatures}`;
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
  if (cfg.mode === "TON") {
    const rows = await fetchTon(no, h.IdPengukuran);
    return `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body class="ton-report">${tonReportHtml(h, supplier, rows, cfg.external, username)}</body></html>`;
  }
  const body = kgBody(await fetchKg(no), h, !cfg.external);

  const now = new Date();
  const cetak = `${fmtTanggal(now)} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body>
    <h1>${esc(cfg.title.toUpperCase())}</h1>
    ${infoHtml(h, supplier)}
    ${body}
    <div class="foot">${cfg.external ? "<div>*//external</div>" : ""}<div>Print by ${esc(username || "-")} pada ${esc(cetak)}</div></div>
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
