// Laporan PDF Penerimaan ST - Pembelian (Ton), pengganti Crystal Report CrPenSTSawmillPembelian.
// Bagian: info header, tabel rekap Tebal x Lebar per Panjang (dari label ST yang diterima),
// tabel "bahan yang dikembalikan" (reject), dan kolom tanda tangan.

const { sql, poolPromise } = require("../../core/config/db");
const { generateReportPdf } = require("../../core/utils/pdf/report-generator");
const service = require("./penerimaan-st-pembelian-service");

const httpError = (status, message) => Object.assign(new Error(message), { status });

const esc = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const pad = (n) => String(n).padStart(2, "0");
const fmtTanggal = (d) => {
  if (!d) return "";
  const x = d instanceof Date ? d : new Date(d);
  return Number.isNaN(x.getTime()) ? "" : `${pad(x.getDate())}/${pad(x.getMonth() + 1)}/${x.getFullYear()}`;
};
const fmtWaktu = (d) => `${fmtTanggal(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

const kondisi = (v) => (v === null || v === undefined ? "" : v === true || v === 1 ? "Kering" : "Basah");
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const fmtDim = (v) => String(Math.round(num(v) * 10000) / 10000);
const fmtTon = (v) => num(v).toFixed(4);
const fmtInt = (v) => String(Math.round(num(v)));

async function fetchJenisKayu(no) {
  const pool = await poolPromise;
  const r = await pool.request().input("no", sql.VarChar(50), no).query(`
    SELECT TOP 1 k.Jenis
    FROM PenerimaanSTPembelian_d d
    INNER JOIN ST_h s ON s.NoST = d.NoST
    LEFT JOIN MstJenisKayu k ON k.IdJenisKayu = s.IdJenisKayu
    WHERE d.NoPenerimaanST = @no AND k.Jenis IS NOT NULL
    ORDER BY d.NoST
  `);
  return r.recordset[0]?.Jenis || "";
}

async function fetchDetail(no) {
  const pool = await poolPromise;
  const r = await pool.request().input("no", sql.VarChar(50), no).query(`
    SELECT s.Tebal, s.Lebar, s.Panjang, s.JmlhBatang, h.IdUOMTblLebar,
           u.UOM AS UOMTblLebar
    FROM PenerimaanSTPembelian_d d
    INNER JOIN ST_h h ON h.NoST = d.NoST
    INNER JOIN ST_d s ON s.NoST = d.NoST
    LEFT JOIN MstUOM u ON u.IdUOM = h.IdUOMTblLebar
    WHERE d.NoPenerimaanST = @no
  `);
  return r.recordset;
}

async function fetchUom() {
  const pool = await poolPromise;
  const r = await pool.request().query(`SELECT IdUOM, UOM FROM MstUOM`);
  return new Map(r.recordset.map((x) => [Number(x.IdUOM), x.UOM]));
}

/** Kelompokkan per Tebal > Lebar, kolom per Panjang; sel = { pcs, ton }. */
function buildPivot(rows) {
  const panjangSet = new Set();
  const groups = new Map(); // tebal -> Map(lebar -> { uom, cells: Map(panjang -> {pcs,ton}) })
  for (const r of rows) {
    const tebal = num(r.Tebal);
    const lebar = num(r.Lebar);
    const panjang = num(r.Panjang);
    const pcs = num(r.JmlhBatang);
    panjangSet.add(panjang);
    if (!groups.has(tebal)) groups.set(tebal, new Map());
    const byLebar = groups.get(tebal);
    if (!byLebar.has(lebar)) byLebar.set(lebar, { uom: r.UOMTblLebar || "mm", cells: new Map() });
    const cells = byLebar.get(lebar).cells;
    const c = cells.get(panjang) || { pcs: 0, ton: 0 };
    c.pcs += pcs;
    c.ton += service.hitungTon(tebal, lebar, panjang, pcs, r.IdUOMTblLebar);
    cells.set(panjang, c);
  }

  const panjangs = [...panjangSet].sort((a, b) => a - b);
  const sum = (cells) =>
    [...cells.values()].reduce((a, c) => ({ pcs: a.pcs + c.pcs, ton: a.ton + c.ton }), { pcs: 0, ton: 0 });

  const out = [];
  const colTotal = new Map(panjangs.map((p) => [p, 0]));
  let grandPcs = 0;
  let grandTon = 0;
  for (const tebal of [...groups.keys()].sort((a, b) => a - b)) {
    const byLebar = groups.get(tebal);
    const lebars = [...byLebar.keys()].sort((a, b) => a - b);
    lebars.forEach((lebar, i) => {
      const { uom, cells } = byLebar.get(lebar);
      const total = sum(cells);
      grandPcs += total.pcs;
      grandTon += total.ton;
      for (const p of panjangs) colTotal.set(p, colTotal.get(p) + (cells.get(p)?.pcs || 0));
      out.push({ tebal, rowspan: i === 0 ? lebars.length : 0, lebar, uom, cells, total });
    });
  }
  return { panjangs, rows: out, colTotal, grandPcs, grandTon };
}

function pivotHtml(p) {
  if (!p.rows.length) return "";
  const cols = p.panjangs.length;
  const head = p.panjangs.map((x) => `<th class="pj">${fmtDim(x)}</th>`).join("");
  const body = p.rows
    .map((r) => {
      const cells = p.panjangs
        .map((pj) => {
          const c = r.cells.get(pj);
          if (!c) return `<td class="pj"></td>`;
          return `<td class="pj"><span class="pcs">${fmtInt(c.pcs)}</span></td>`;
        })
        .join("");
      return `<tr>
        ${r.rowspan ? `<td class="c" rowspan="${r.rowspan}">${fmtDim(r.tebal)}</td>` : ""}
        <td class="c">${fmtDim(r.lebar)}</td><td class="c">${esc(r.uom)}</td>
        ${cells}
        <td class="r">${fmtInt(r.total.pcs)}</td><td class="r">${fmtTon(r.total.ton)}</td>
      </tr>`;
    })
    .join("");
  const totals = p.panjangs.map((pj) => `<td class="pj b"><span class="pcs">${fmtInt(p.colTotal.get(pj))}</span></td>`).join("");

  return `
    <table class="pivot">
      <thead>
        <tr class="lbl"><td colspan="3"></td><td colspan="${cols}" class="lblp">Panjang</td><td colspan="2"></td></tr>
        <tr>
          <th class="s">Tebal</th><th class="s">Lebar</th><th class="s">@</th>
          ${head}
          <th class="b">Jmlh Pcs</th><th class="b">Total</th>
        </tr>
      </thead>
      <tbody>${body}
        <tr class="tot"><td colspan="3" class="c b">Total</td>${totals}
          <td class="r b">${fmtInt(p.grandPcs)}</td><td class="r b">${fmtTon(p.grandTon)}</td></tr>
      </tbody>
    </table>`;
}

function rejectHtml(rejects, uomMap, note) {
  const text = String(note ?? "").trim();
  const noteHtml = text ? `<div class="note">Note : &nbsp;${esc(text).replace(/\r?\n/g, "<br/>")}</div>` : "";
  if (!rejects.length) return noteHtml;
  const body = rejects
    .map(
      (r, i) => `<tr>
        <td class="c">${i + 1}</td><td class="c">${fmtDim(r.Tebal)}</td><td class="c">${fmtDim(r.Lebar)}</td>
        <td class="c">${fmtDim(r.Panjang)}</td><td class="c">${fmtInt(r.JmlhBatang)}</td>
        <td class="c">${esc(uomMap.get(Number(r.IdUOMTblLebar)) || "")}</td>
        <td class="c">${esc(uomMap.get(Number(r.IdUOMPanjang)) || "")}</td>
        <td class="c">${fmtTon(r.Ton)}</td>
      </tr>`,
    )
    .join("");
  const pcs = rejects.reduce((a, r) => a + num(r.JmlhBatang), 0);
  const ton = rejects.reduce((a, r) => a + num(r.Ton), 0);
  return `
    ${noteHtml}
    <table class="reject">
      <thead><tr><th>No</th><th>Tebal</th><th>Lebar</th><th>Panjang</th><th>Pcs</th><th>UOMTblLebar</th><th>UOMPanjang</th><th>Ton</th></tr></thead>
      <tbody>${body}
        <tr class="tot"><td></td><td></td><td class="c b">Total</td><td></td><td class="c b">${fmtInt(pcs)}</td><td></td><td></td><td class="c b">${fmtTon(ton)}</td></tr>
      </tbody>
    </table>`;
}

const CSS = `
  @page { size: A4; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #000; margin: 0; }
  h1 { font-size: 15px; font-weight: 400; text-align: center; margin: 0 8mm 8px; padding-bottom: 3px; border-bottom: 1px solid #000; }
  table.info { width: 80%; border-collapse: collapse; margin: 0 0 14px; }
  table.info td { padding: 1px 3px; white-space: nowrap; vertical-align: top; }
  table.info td.k { text-align: left; padding-right: 6px; }
  table.info td.v { padding-right: 18px; }
  table.pivot { border-collapse: collapse; margin-top: 2px; width: 80%; table-layout: auto; }
  table.pivot th, table.pivot td { border: 1px solid #000; padding: 0 6px; height: 33px; font-size: 12px; }
  table.pivot tr.lbl td { border: 0; height: 18px; font-size: 11px; }
  table.pivot tr.lbl td.lblp { text-align: left; padding-left: 8px; }
  table.pivot th { font-weight: 400; text-align: center; }
  table.pivot th.s { font-size: 11px; height: 33px; }
  table.pivot th.pj, table.pivot th.b { font-weight: 700; font-size: 12px; }
  table.pivot thead tr:last-child th { border: 1px solid #000; }
  table.pivot thead tr:last-child th.s { border: 0 none; }
  table.pivot td.pj { text-align: center; }
  table.pivot th.b { width: 14%; }
  table.pivot td.c { text-align: center; }
  table.pivot td.r { text-align: right; padding-right: 10px; }
  table.pivot td.b { font-weight: 700; }
  table.pivot tr.tot td { height: 33px; }
  .note { margin-top: 10px; font-size: 11px; line-height: 1.25; }
  table.reject { border-collapse: collapse; margin: 4px 0 0 22px; font-size: 10.5px; }
  table.reject th, table.reject td { padding: 0 8px; height: 17px; }
  table.reject th { border: 1px solid #000; font-weight: 400; }
  table.reject tbody td { border-left: 1px solid #000; border-right: 1px solid #000; }
  table.reject tr.tot td { border: 0; border-top: 1px solid #000; border-bottom: 1px solid #000; height: 19px; }
  table.reject tr.tot td:first-child { border-left: 1px solid #000; }
  table.reject tr.tot td:last-child { border-right: 1px solid #000; }
  table.reject td.c { text-align: center; }
  table.reject td.b { font-weight: 700; }
  .ttd { display: flex; justify-content: flex-end; gap: 28px; margin: 72px 0 0; font-size: 11px; page-break-inside: avoid; }
  .ttd span { white-space: nowrap; }
`;

function render({ h, jenis, pivot, rejects, uomMap }) {
  const tgl = (v) => esc(fmtTanggal(v));
  return `<!doctype html><html><head><meta charset="utf-8"/><style>${CSS}</style></head><body>
    <h1>Laporan Penerimaan ST - Pembelian (Ton)</h1>
    <table class="info">
      <tr>
        <td class="k">No. Penerimaan ST</td><td class="v">: ${esc(h.NoPenerimaanST)}</td>
        <td class="k">Supplier</td><td class="v">: ${esc(h.Supplier)}</td>
        <td class="k">No. Suket</td><td class="v">: ${esc(h.Suket)}</td>
      </tr>
      <tr>
        <td class="k">Tgl Laporan</td><td class="v">: ${tgl(h.TglLaporan)}</td>
        <td class="k">No. Truk</td><td class="v">: ${esc(h.NoTruk)}</td>
        <td class="k">Jenis Kayu</td><td class="v">: ${esc(jenis)}</td>
      </tr>
      <tr>
        <td class="k">Tgl Masuk</td><td class="v">: ${tgl(h.TglMasuk)}</td>
        <td class="k">No. Plat</td><td class="v">: ${esc(h.NoPlat)}</td>
        <td class="k">Ton Surat Jalan</td><td class="v">: ${esc(h.TonSJ)}</td>
      </tr>
      <tr>
        <td class="k">Surat Tanah</td><td class="v">: ${esc(h.SuratTanah)}</td>
        <td class="k">Kondisi</td><td class="v">: ${esc(kondisi(h.IsKering))}</td>
        <td></td><td></td>
      </tr>
    </table>
    ${pivotHtml(pivot)}
    ${rejectHtml(rejects, uomMap, h.Note)}
    <div class="ttd">
      <span>Dibuat : ________________</span>
      <span>Diperiksa : ________________</span>
      <span>Diketahui : ________________</span>
    </div>
  </body></html>`;
}

/** @returns {Promise<Buffer>} PDF laporan penerimaan ST pembelian. */
async function generate(no, printedBy) {
  const h = await service.getByNo(no);
  if (!h) throw httpError(404, "Penerimaan ST tidak ditemukan");

  const [jenis, detail, rejects, uomMap] = await Promise.all([
    fetchJenisKayu(no),
    fetchDetail(no),
    service.getRejects(no),
    fetchUom(),
  ]);

  const html = render({ h, jenis, pivot: buildPivot(detail), rejects, uomMap });
  const footerTemplate = `
    <div style="width:100%;font-size:9px;font-family:Arial,sans-serif;font-style:italic;font-weight:700;
                padding:0 10mm;display:flex;justify-content:space-between;">
      <span>Print by ${esc(printedBy || "-")} on ${esc(fmtWaktu(new Date()))}</span>
      <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
    </div>`;

  return generateReportPdf(html, {
    format: "A4",
    margin: { top: "10mm", right: "10mm", bottom: "14mm", left: "10mm" },
    footerTemplate,
  });
}

module.exports = { generate };
