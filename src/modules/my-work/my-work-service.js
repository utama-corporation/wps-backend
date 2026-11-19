const { poolPromise } = require("../../core/config/db");
const dashboardSawmill = require("../dashboard-sawmill/dashboard-sawmill-service");

/* ============================================================
 * Pekerjaan Saya (My Work): kotak masuk tugas per pengguna, pola sama dengan MCS.
 * Tiap kategori hanya dihitung bila pengguna punya izinnya. Kategori yang gagal
 * dimuat tidak menggagalkan yang lain: ia dikirim dengan `error` dan count null.
 *
 * Bentuk item seragam supaya tablet bisa menampilkan dan membuka modulnya:
 *   { id, title, subtitle, date, status, severity, target, targetNo }
 *   target   = kunci modul tujuan (dipetakan tablet ke menu), mis. "nyangkut"
 *   targetNo = nomor dokumen yang dibuka, bila ada
 *   severity = "danger" | "warning" | "info"
 * ==========================================================*/

const PREVIEW_ITEMS = 5;

const can = (perms, ...any) => perms.has("*") || any.some((p) => perms.has(p));

function ymd(d) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const toYmd = (v) => {
  if (!v) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10);
  const s = String(v);
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
};

/** Label nyangkut setelah tutup harian terakhir (aturan sama dengan /api/nyangkut-list). */
async function nyangkut() {
  const pool = await poolPromise;
  const r = await pool.request().query(`
    SELECT NoNyangkut, CONVERT(varchar(10), Tgl, 23) AS Tgl
    FROM dbo.Nyangkut_h
    WHERE Tgl > (SELECT MAX(PeriodHarian) FROM dbo.MstTutupTransaksiHarian)
    ORDER BY NoNyangkut DESC
  `);
  return r.recordset.map((row) => ({
    id: row.NoNyangkut,
    title: row.NoNyangkut,
    subtitle: "Dokumen nyangkut belum selesai",
    date: row.Tgl,
    status: "Terbuka",
    severity: "warning",
    target: "nyangkut",
    targetNo: row.NoNyangkut,
  }));
}

/** Stock opname yang tanggalnya setelah tutup harian terakhir (aturan /api/no-stock-opname). */
async function stockOpname() {
  const pool = await poolPromise;
  const r = await pool.request().query(`
    SELECT NoSO, CONVERT(varchar(10), Tgl, 23) AS Tgl
    FROM dbo.StockOpname_h
    WHERE Tgl > (SELECT MAX(PeriodHarian) FROM dbo.MstTutupTransaksiHarian)
    ORDER BY NoSO DESC
  `);
  return r.recordset.map((row) => ({
    id: row.NoSO,
    title: row.NoSO,
    subtitle: "Stock opname masih berjalan",
    date: row.Tgl,
    status: "Berjalan",
    severity: "info",
    target: "stock_opname",
    targetNo: row.NoSO,
  }));
}

/**
 * Hari transaksi yang belum dikunci: dari tanggal setelah MAX(PeriodHarian) ber-Lock = 1
 * (batas yang dipakai core/utils/periode-lock.js) sampai kemarin. Satu item ringkas.
 */
async function tutupHarian(today) {
  const pool = await poolPromise;
  const r = await pool.request().query(`
    SELECT CONVERT(varchar(10), MAX(PeriodHarian), 23) AS Terakhir
    FROM dbo.MstTutupTransaksiHarian
    WHERE Lock = 1
  `);
  const terakhir = r.recordset[0]?.Terakhir || null;
  if (!terakhir) return [];
  const kemarin = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  const last = new Date(`${terakhir}T00:00:00`);
  const hari = Math.round((kemarin - last) / 86400000);
  if (hari <= 0) return [];
  return [
    {
      id: `harian-${terakhir}`,
      title: `${hari} hari belum dikunci`,
      subtitle: `Terakhir dikunci ${terakhir}`,
      date: terakhir,
      status: "Belum dikunci",
      severity: hari > 3 ? "danger" : "warning",
      target: "tutup_transaksi",
      targetNo: null,
    },
  ];
}

/** Kayu bulat dengan umur tunggu (UT) peringatan/bahaya, dari perhitungan Dashboard Sawmill. */
async function kayuBulatLama(today) {
  const rows = await dashboardSawmill.saldoKb(ymd(today));
  const items = [];
  for (const row of rows) {
    if (row.utStatus !== "peringatan" && row.utStatus !== "bahaya") continue;
    for (const kb of row.utDaftar || []) {
      items.push({
        id: kb.noKayuBulat,
        title: kb.noKayuBulat,
        subtitle: [row.jenis, kb.supplier].filter(Boolean).join(" · "),
        date: null,
        status: row.utStatus === "bahaya" ? "Bahaya" : "Peringatan",
        severity: row.utStatus === "bahaya" ? "danger" : "warning",
        target: "kayu_bulat",
        targetNo: kb.noKayuBulat,
      });
    }
  }
  return items.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "danger" ? -1 : 1));
}

/** SPK sawmill yang masih aktif padahal realisasinya sudah mencapai target. */
async function spkLewatTarget() {
  const rows = await dashboardSawmill.spkAktif();
  return rows
    .filter((s) => s.persen >= 100)
    .map((s) => ({
      id: `${s.noSpk}#${s.idProdukSpk}`,
      title: [s.noSpk, s.produk].filter(Boolean).join(" · "),
      subtitle: `${s.realisasiTon} / ${s.targetTon} TON (${s.persen}%) · tutup SPK bila selesai`,
      date: toYmd(s.tanggal),
      status: "Lewat target",
      severity: "warning",
      target: "spk",
      targetNo: s.noSpk,
    }));
}

/** Urutan tampil: yang paling mendesak dulu. */
const CATEGORIES = [
  {
    key: "kayu_bulat_lama",
    label: "Kayu bulat menunggu lama",
    allowed: (p) => can(p, "dashboard_sawmill:read", "penerimaan_kayu_bulat:read"),
    load: (ctx) => kayuBulatLama(ctx.today),
  },
  {
    key: "tutup_harian",
    label: "Transaksi harian belum dikunci",
    allowed: (p) => can(p, "tutup_transaksi:read"),
    load: (ctx) => tutupHarian(ctx.today),
  },
  {
    key: "nyangkut",
    label: "Label nyangkut",
    allowed: (p) => can(p, "nyangkut:read"),
    load: () => nyangkut(),
  },
  {
    key: "spk_lewat_target",
    label: "SPK lewat target",
    allowed: (p) => can(p, "dashboard_sawmill:read"),
    load: () => spkLewatTarget(),
  },
  {
    key: "stock_opname",
    label: "Stock opname berjalan",
    allowed: (p) => can(p, "stock_opname:read"),
    load: () => stockOpname(),
  },
];

const severityOf = (items) =>
  !items.length
    ? null
    : items.some((i) => i.severity === "danger")
    ? "danger"
    : items.some((i) => i.severity === "warning")
      ? "warning"
      : "info";

async function loadCategory(cat, ctx) {
  try {
    const items = await cat.load(ctx);
    return { key: cat.key, label: cat.label, items, error: null };
  } catch (err) {
    console.error(`Error my-work ${cat.key}:`, err);
    return { key: cat.key, label: cat.label, items: null, error: "Data belum dapat dimuat." };
  }
}

/** Ringkasan semua kategori yang boleh dilihat, dengan beberapa item teratas. */
async function getSummary({ permissions, today = new Date() }) {
  const allowed = CATEGORIES.filter((c) => c.allowed(permissions));
  const loaded = await Promise.all(allowed.map((c) => loadCategory(c, { today })));
  const categories = loaded.map((c) => ({
    key: c.key,
    label: c.label,
    count: c.items ? c.items.length : null,
    severity: c.items ? severityOf(c.items) : null,
    error: c.error,
    items: c.items ? c.items.slice(0, PREVIEW_ITEMS) : [],
  }));
  return {
    categories,
    total: categories.reduce((sum, c) => sum + (c.count || 0), 0),
    generated_at: new Date().toISOString(),
  };
}

/** Daftar lengkap satu kategori, berhalaman. Null bila kategori tidak ada/tidak diizinkan. */
async function getList({ permissions, category, page = 1, perPage = 20, today = new Date() }) {
  const cat = CATEGORIES.find((c) => c.key === category);
  if (!cat || !cat.allowed(permissions)) return null;
  const items = await cat.load({ today });
  const safePer = Math.min(Math.max(Number.parseInt(perPage, 10) || 20, 1), 100);
  const total = items.length;
  const totalPages = Math.max(Math.ceil(total / safePer), 1);
  const safePage = Math.min(Math.max(Number.parseInt(page, 10) || 1, 1), totalPages);
  return {
    data: items.slice((safePage - 1) * safePer, safePage * safePer),
    meta: { page: safePage, per_page: safePer, total, total_pages: totalPages },
  };
}

module.exports = { getSummary, getList, CATEGORIES };
