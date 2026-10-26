// Template PDF penjualan: Surat Jalan ST (sp_InvoiceSTSND) dan Laporan Penjualan Barang Jadi (SP_LapPenjualanBarangJadi).
// Layout mengikuti contoh cetakan Crystal (PjualST.pdf / PjualBjadi.pdf).

const BULAN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const p2 = (n) => String(n).padStart(2, "0");

function esc(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const num = (v) => Number(v) || 0;
const round4 = (v) => Math.round((num(v) + Number.EPSILON) * 10000) / 10000;

/** Angka desimal titik (m3, ton). */
const dot = (v, d = 4) => num(v).toFixed(d);
/** Angka desimal koma (tebal/lebar/panjang di cetakan Crystal ST). */
const comma = (v, d = 2) => num(v).toFixed(d).replace(".", ",");
const int = (v) => String(Math.round(num(v)));

// Kolom DATE dari mssql = tengah malam UTC -> pakai getter UTC; waktu cetak pakai waktu lokal server.
function dmy(d) {
  const x = new Date(d);
  return Number.isNaN(x.getTime()) ? "" : `${p2(x.getUTCDate())}/${p2(x.getUTCMonth() + 1)}/${x.getUTCFullYear()}`;
}
function dMonY(d, sep) {
  const x = new Date(d);
  return Number.isNaN(x.getTime()) ? "" : `${p2(x.getUTCDate())}${sep}${BULAN[x.getUTCMonth()]}${sep}${x.getUTCFullYear()}`;
}
function nowParts() {
  const n = new Date();
  return {
    date: `${p2(n.getDate())} ${BULAN[n.getMonth()]} ${n.getFullYear()}`,
    slash: `${p2(n.getDate())}/${BULAN[n.getMonth()]}/${n.getFullYear()}`,
    time: `${p2(n.getHours())}:${p2(n.getMinutes())}`,
  };
}

const BASE_CSS = `
  *{box-sizing:border-box}
  body{font-family:Arial,Helvetica,sans-serif;font-size:10px;color:#000;margin:0}
  table{border-collapse:collapse}
  .r{text-align:right}.c{text-align:center}
`;

// Footer Chromium: font-size wajib eksplisit (default 0). Class pageNumber/totalPages diisi Chromium.
function cetakFooter(by, now, extraTop = "") {
  return `
    <div style="width:100%;font-family:Arial,Helvetica,sans-serif;font-size:8px;color:#000;padding:0 10mm;">
      ${extraTop}
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-top:4px;">
        <div style="line-height:1.5">
          <div>&nbsp;Cetak : ${esc(now.date)} &nbsp;&nbsp;&nbsp; ${esc(now.time)}</div>
          <div>&nbsp;&nbsp;&nbsp;&nbsp;By : ${esc(by)}</div>
        </div>
        <div>Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>
      </div>
    </div>`;
}

/* ===================== SURAT JALAN ST ===================== */
function buildSuratJalanST(rows, { printedBy = "" } = {}) {
  const now = nowParts();
  const h = rows[0] || {};

  const sorted = [...rows].sort(
    (a, b) =>
      String(a.Jenis).localeCompare(String(b.Jenis)) ||
      String(a.NoST).localeCompare(String(b.NoST)) ||
      num(a.Tebal) - num(b.Tebal) ||
      num(a.Lebar) - num(b.Lebar) ||
      num(a.Panjang) - num(b.Panjang),
  );

  let lastDate = null;
  const body = sorted
    .map((r) => {
      const tgl = dmy(r.DateCreate);
      const showTgl = tgl !== lastDate;
      lastDate = tgl;
      return `<tr>
        <td class="bl br">${showTgl ? esc(tgl) : "&nbsp;"}</td>
        <td class="bl br">${esc(r.NoST)}</td>
        <td class="br">${esc(r.Jenis)}</td>
        <td class="br r">${comma(r.Tebal)}</td>
        <td class="br r">${comma(r.Lebar)}</td>
        <td class="br c">${esc(r.UOMTblLebar)}</td>
        <td class="br r">${comma(r.Panjang)}</td>
        <td class="br c">${esc(r.UOMPanjang)}</td>
        <td class="br r">${int(r.JmlhBatang)}</td>
        <td class="br r">${dot(r.M3)}</td>
        <td class="br r">${dot(r.Ton)}</td>
      </tr>`;
    })
    .join("");

  const totM3 = round4(sorted.reduce((s, r) => s + num(r.M3), 0));
  const totTon = round4(sorted.reduce((s, r) => s + num(r.Ton), 0));

  const html = `<!doctype html><html><head><meta charset="utf-8"><style>${BASE_CSS}
    .head{display:flex;justify-content:space-between;margin-bottom:4px}
    .head .l{width:50%}.head .rr{width:50%;padding-left:6mm}
    .kepada{font-size:10px}.buyer{font-size:17px;line-height:1.2;margin:1px 0 4px}
    .kv{display:flex;line-height:1.55}.kv .k{width:30mm}
    .top{display:flex;justify-content:space-between;align-items:flex-start}
    .judul{border:1px solid #000;font-weight:bold;font-size:16px;padding:1px 6px;width:62mm;text-align:right;margin-left:auto}
    .rule{border-top:1px solid #000;border-bottom:1px solid #000;height:3px;margin:3px 0 8px}
    table.d{width:100%;font-size:9px}
    table.d th{border:1px solid #000;font-weight:normal;padding:3px 4px;text-align:center}
    table.d td{padding:1px 4px;height:15px}
    .bl{border-left:1px solid #000}.br{border-right:1px solid #000}
    table.d tr.tot td{border:1px solid #000;height:20px;font-size:9px}
  </style></head><body>
    <div class="top">
      <div class="l" style="width:52%">
        <div class="kepada">Kepada Yth.</div>
        <div class="buyer">${esc(h.Buyer)}</div>
        <div class="kv"><span style="width:34mm">Nomor Kendaraan</span><span>: ${esc(h.NoPlat)}</span></div>
      </div>
      <div style="width:48%">
        <div class="kv" style="justify-content:space-between;margin-bottom:2px">
          <span>Medan, ${esc(now.slash)}</span><span class="judul" style="margin:0">SURAT JALAN</span>
        </div>
        <div class="kv"><span class="k">No.Surat Jalan</span><span>: ${esc(h.NoSJ)}</span></div>
        <div class="kv"><span class="k">Jenis Kendaraan</span><span>: ${esc(h.Model)}</span></div>
      </div>
    </div>
    <div class="rule"></div>
    <table class="d">
      <colgroup>
        <col style="width:12%"><col style="width:10%"><col style="width:24%"><col style="width:6%"><col style="width:6%">
        <col style="width:5%"><col style="width:7%"><col style="width:5%"><col style="width:7%"><col style="width:9%"><col style="width:9%">
      </colgroup>
      <thead><tr><th>Tanggal</th><th>NoST</th><th>Jenis Kayu</th><th>Tebal</th><th>Lebar</th><th>UOM</th><th>Panjang</th><th>UOM</th><th>Pcs</th><th>m3</th><th>Ton</th></tr></thead>
      <tbody>
        ${body}
        <tr class="tot"><td colspan="9" class="r" style="border-right:none">Jumlah :</td><td class="r">${dot(totM3)}</td><td class="r">${dot(totTon)}</td></tr>
      </tbody>
    </table>
  </body></html>`;

  const sig = (label, w) =>
    `<div style="width:${w}%"><div style="min-height:20px">${label}</div><div style="margin-top:22px;border-top:1px solid #000;width:90%"></div></div>`;
  const signatures = `
    <div style="border-top:1px solid #000;border-bottom:1px solid #000;height:3px;margin-bottom:5px"></div>
    <div style="display:flex;font-size:8px">
      ${sig("Hormat Kami,", 12)}${sig("Bagian Gudang,", 14)}${sig("Terima Kasih,", 18)}
      <div style="width:18%"><div style="min-height:20px">Diantar Oleh:<br>Supir,</div><div style="margin-top:12px;border-top:1px solid #000;width:90%"></div></div>
      <div style="width:12%"><div style="min-height:20px"><br>Kernet,</div><div style="margin-top:12px;border-top:1px solid #000;width:90%"></div></div>
      ${sig("Diterima Oleh,", 26)}
    </div>`;

  return {
    html,
    options: {
      format: "A4",
      margin: { top: "10mm", right: "10mm", bottom: "42mm", left: "10mm" },
      footerTemplate: cetakFooter(printedBy, now, signatures),
    },
  };
}

/* ===================== LAPORAN PENJUALAN BARANG JADI ===================== */
function buildPenjualanBJ(rows, { printedBy = "" } = {}) {
  const now = nowParts();
  const h = rows[0] || {};

  const sorted = [...rows].sort(
    (a, b) =>
      String(a.Jenis).localeCompare(String(b.Jenis)) ||
      String(a.NamaBarangJadi).localeCompare(String(b.NamaBarangJadi)) ||
      num(a.Tebal) - num(b.Tebal) ||
      num(a.Lebar) - num(b.Lebar) ||
      num(a.Panjang) - num(b.Panjang),
  );

  // Kelompokkan: Jenis -> Nama Barang Jadi
  const jenisMap = new Map();
  for (const r of sorted) {
    if (!jenisMap.has(r.Jenis)) jenisMap.set(r.Jenis, new Map());
    const nm = jenisMap.get(r.Jenis);
    if (!nm.has(r.NamaBarangJadi)) nm.set(r.NamaBarangJadi, []);
    nm.get(r.NamaBarangJadi).push(r);
  }

  let grand = 0;
  let blocks = "";
  for (const [jenis, namaMap] of jenisMap) {
    let no = 0;
    let totJenis = 0;
    let trs = "";
    let subs = "";
    for (const [nama, list] of namaMap) {
      list.forEach((r, i) => {
        no += 1;
        trs += `<tr>
          <td class="bl br c">${no}</td>
          <td class="br">${i === 0 ? esc(nama) : "&nbsp;"}</td>
          <td class="br r">${int(r.Tebal)}</td>
          <td class="br r">${int(r.Lebar)}</td>
          <td class="br r">${int(r.Panjang)}</td>
          <td class="br r">${int(r.JmlhBatang)}</td>
          <td class="br r">${dot(r.M3)}</td>
        </tr>`;
      });
      const sub = round4(list.reduce((s, r) => s + num(r.M3), 0));
      totJenis += sub;
      subs += `<div class="sub"><span>Jmlh /${esc(nama)} :</span><b style="font-weight:normal">${dot(sub)}</b></div>`;
    }
    totJenis = round4(totJenis);
    grand += totJenis;
    blocks += `
      <div class="jenis">Jenis Kayu &nbsp;&nbsp;&nbsp;&nbsp;: ${esc(jenis)}</div>
      <table class="d">
        <colgroup><col style="width:7%"><col style="width:34%"><col style="width:11%"><col style="width:11%"><col style="width:13%"><col style="width:11%"><col style="width:13%"></colgroup>
        <thead><tr><th>No</th><th>Nama Barang Jadi</th><th>Tebal</th><th>Lebar</th><th>Panjang</th><th>Pcs</th><th>M3</th></tr></thead>
        <tbody>${trs}<tr class="last"><td colspan="7"></td></tr></tbody>
      </table>
      ${subs}
      <div class="sub"><span>Jmlh /${esc(jenis)} :</span><b style="font-weight:normal">${dot(totJenis)}</b></div>`;
  }

  const html = `<!doctype html><html><head><meta charset="utf-8"><style>${BASE_CSS}
    .judul{width:56%;margin:0 auto 14px;text-align:center;font-size:11px;border-bottom:1px solid #000;padding-bottom:2px}
    .info{display:flex;font-size:9px;line-height:1.7;padding-left:2mm;margin-bottom:6px}
    .info .col{width:46%}.info .k{display:inline-block;width:17mm}
    .jenis{font-size:9px;margin:10px 0 3px 4mm}
    table.d{width:62%;margin-left:4mm;font-size:9px}
    table.d th{border:1px solid #000;font-weight:normal;padding:3px 4px;text-align:center}
    table.d td{padding:1px 5px;height:15px}
    .bl{border-left:1px solid #000}.br{border-right:1px solid #000}
    table.d tbody tr.last td{padding:0;height:0;line-height:0;font-size:0;border-top:1px solid #000}
    .sub{width:62%;margin-left:4mm;display:flex;justify-content:flex-end;gap:12px;font-size:9px;padding:4px 5px 0 0}
    .sub span{text-align:right}.sub b{width:16%;text-align:right}
    .grand{width:62%;margin-left:4mm;display:flex;justify-content:flex-end;gap:12px;font-size:9px;padding:6px 5px 0 0;font-weight:bold}
    .grand b{width:16%;text-align:right}
  </style></head><body>
    <div class="judul">Laporan Penjualan Barang Jadi (M3)</div>
    <div class="info">
      <div class="col"><div><span class="k">Tanggal</span>: ${esc(dMonY(h.TglJual, " "))}</div><div><span class="k">Buyer</span>: ${esc(h.Buyer)}</div></div>
      <div><span style="display:inline-block;width:13mm">NoSPK</span>: ${esc(h.NoSPK)}</div>
    </div>
    ${blocks}
    <div class="grand"><span>Grand Total :</span><b>${dot(round4(grand))}</b></div>
  </body></html>`;

  return {
    html,
    options: {
      format: "A4",
      margin: { top: "10mm", right: "10mm", bottom: "18mm", left: "10mm" },
      footerTemplate: cetakFooter(printedBy, now),
    },
  };
}

module.exports = { buildSuratJalanST, buildPenjualanBJ };
