const { sql, poolPromise } = require("../../core/config/db");
const sawmill = require("../dashboard-sawmill/dashboard-sawmill-service");
const { ST_TON_FLOOR, ID_SUPPLIER_DIKECUALIKAN } = require("../dashboard-sawmill/dashboard-sawmill-sql");

/* ============================================================
 * Dashboard utama tablet (analytics), pola sama dengan dashboard MCS:
 * kartu domain dengan angka utama + delta terhadap periode sebelumnya,
 * tren harian, dan aging. Semua dihitung di server dan di-cache singkat.
 *
 * Periode = `range` hari terakhir s.d. KEMARIN (hari lengkap), periode
 * pembanding = `range` hari sebelum itu. Angka "hari ini" hanya pelengkap.
 * Angka keadaan (saldo, KD) tidak diberi delta.
 *
 * Cache per (domain, range) karena isinya sama untuk semua pengguna; izin
 * disaring saat menyusun respons, jadi data tanpa izin tidak pernah dikirim.
 * ==========================================================*/

const RANGES = [7, 14, 30, 90];
const CACHE_MS = 3 * 60 * 1000;
const PHU = [
  { key: "s4s", label: "S4S", table: "S4SProduksi_h", perm: "proses_s4s:read" },
  { key: "fj", label: "Finger Joint", table: "FJProduksi_h", perm: "proses_fj:read" },
  { key: "moulding", label: "Moulding", table: "MouldingProduksi_h", perm: "proses_mld:read" },
];
const PHI = [
  { key: "laminating", label: "Laminating", table: "LaminatingProduksi_h", perm: "proses_lmt:read" },
  { key: "ccakhir", label: "Cross Cut Akhir", table: "CCAkhirProduksi_h", perm: "proses_cca:read" },
  { key: "sanding", label: "Sanding", table: "SandingProduksi_h", perm: "proses_snd:read" },
  { key: "packing", label: "Packing", table: "PackingProduksi_h", perm: "proses_bj:read" },
];

const can = (perms, ...any) => perms.has("*") || any.some((p) => perms.has(p));

const ymd = (d) => {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** Batas periode berjalan dan pembanding untuk `range` hari s.d. kemarin. */
function periods(range, today = new Date()) {
  const to = addDays(today, -1);
  const from = addDays(to, -(range - 1));
  const prevTo = addDays(from, -1);
  const prevFrom = addDays(prevTo, -(range - 1));
  return {
    today: ymd(today),
    from: ymd(from),
    to: ymd(to),
    prevFrom: ymd(prevFrom),
    prevTo: ymd(prevTo),
  };
}

/** Persen perubahan; null bila pembanding nol/kosong (tidak bermakna). */
function pct(cur, prev) {
  const c = Number(cur) || 0;
  const p = Number(prev) || 0;
  if (!p) return null;
  return Math.round(((c - p) / p) * 1000) / 10;
}

const delta = (value, unit) =>
  value === null || value === undefined
    ? null
    : { value, unit, direction: value > 0 ? "up" : value < 0 ? "down" : "flat" };

const round = (v, n = 2) => {
  const f = 10 ** n;
  return Math.round((Number(v) || 0) * f) / f;
};

async function request(params) {
  const pool = await poolPromise;
  const r = pool.request();
  for (const [k, v] of Object.entries(params)) r.input(k, sql.VarChar(10), v);
  return r;
}

/* ---------------- sumber data mentah (di-cache) ---------------- */

/** Jumlah dokumen produksi per proses: periode, pembanding, dan hari ini. */
async function produksiCounts(p) {
  const all = [...PHU, ...PHI];
  const r = await request({ f: p.from, t: p.to, pf: p.prevFrom, pt: p.prevTo, d: p.today });
  const parts = all.map(
    (x) => `
      SELECT '${x.key}' AS k,
        SUM(CASE WHEN Tanggal BETWEEN CAST(@f AS DATE) AND CAST(@t AS DATE) THEN 1 ELSE 0 END) AS cur,
        SUM(CASE WHEN Tanggal BETWEEN CAST(@pf AS DATE) AND CAST(@pt AS DATE) THEN 1 ELSE 0 END) AS prev,
        SUM(CASE WHEN Tanggal = CAST(@d AS DATE) THEN 1 ELSE 0 END) AS today
      FROM dbo.${x.table}
      WHERE Tanggal BETWEEN CAST(@pf AS DATE) AND CAST(@d AS DATE)`,
  );
  const res = await r.query(parts.join(" UNION ALL "));
  const out = {};
  for (const row of res.recordset) {
    out[row.k] = { cur: Number(row.cur) || 0, prev: Number(row.prev) || 0, today: Number(row.today) || 0 };
  }
  return out;
}

/** Jumlah dokumen penjualan ST dan BJ: periode dan pembanding. */
async function penjualanCounts(p) {
  const r = await request({ f: p.from, t: p.to, pf: p.prevFrom, pt: p.prevTo });
  const q = (k, table) => `
    SELECT '${k}' AS k,
      SUM(CASE WHEN TglJual BETWEEN CAST(@f AS DATE) AND CAST(@t AS DATE) THEN 1 ELSE 0 END) AS cur,
      SUM(CASE WHEN TglJual BETWEEN CAST(@pf AS DATE) AND CAST(@pt AS DATE) THEN 1 ELSE 0 END) AS prev
    FROM dbo.${table}
    WHERE TglJual BETWEEN CAST(@pf AS DATE) AND CAST(@t AS DATE)`;
  const res = await r.query(`${q("st", "Penjualan_h")} UNION ALL ${q("bj", "BJJual_h")}`);
  const out = { st: { cur: 0, prev: 0 }, bj: { cur: 0, prev: 0 } };
  for (const row of res.recordset) out[row.k] = { cur: Number(row.cur) || 0, prev: Number(row.prev) || 0 };
  return out;
}

/** Rumus ton bahan baku sama dengan Dashboard Sawmill (LoadData), tanpa supplier dikecualikan. */
const BB_TON = `
  CASE WHEN E.Singkatan = 'RB' THEN FLOOR(D.Berat) / 1000
       ELSE FLOOR(B.Tebal * B.Lebar * B.Panjang * 1.38873458504611) / 10000 END`;

/** Kayu bulat masuk: truk dan ton, periode dan pembanding; saldo hari ini. */
async function kayuBulat(p) {
  const r = await request({ f: p.from, t: p.to, pf: p.prevFrom, pt: p.prevTo });
  const res = await r.query(`
    SELECT
      COUNT(DISTINCT CASE WHEN A.DateCreate BETWEEN CAST(@f AS DATE) AND CAST(@t AS DATE) THEN A.NoKayuBulat END) AS trukCur,
      COUNT(DISTINCT CASE WHEN A.DateCreate BETWEEN CAST(@pf AS DATE) AND CAST(@pt AS DATE) THEN A.NoKayuBulat END) AS trukPrev,
      SUM(CASE WHEN A.DateCreate BETWEEN CAST(@f AS DATE) AND CAST(@t AS DATE) THEN ${BB_TON} ELSE 0 END) AS tonCur,
      SUM(CASE WHEN A.DateCreate BETWEEN CAST(@pf AS DATE) AND CAST(@pt AS DATE) THEN ${BB_TON} ELSE 0 END) AS tonPrev
    FROM KayuBulat_h A
    LEFT JOIN KayuBulat_d B ON B.NoKayuBulat = A.NoKayuBulat
    LEFT JOIN KayuBulatKG_d D ON D.NoKayuBulat = A.NoKayuBulat
    LEFT JOIN MstJenisKayu E ON E.IdJenisKayu = A.IdJenisKayu
    WHERE A.DateCreate BETWEEN CAST(@pf AS DATE) AND CAST(@t AS DATE)
      AND A.IdSupplier != ${ID_SUPPLIER_DIKECUALIKAN}
  `);
  const row = res.recordset[0] || {};
  const saldo = await sawmill.saldoKb(p.today);
  return {
    trukCur: Number(row.trukCur) || 0,
    trukPrev: Number(row.trukPrev) || 0,
    tonCur: round(row.tonCur),
    tonPrev: round(row.tonPrev),
    saldo: round(saldo.reduce((s, x) => s + (Number(x.saldoAwal) || 0), 0)),
  };
}

/** Rendemen Bansaw periode dan pembanding (rumus Dashboard Sawmill). */
async function rendemen(p) {
  const [cur, prev] = await Promise.all([
    sawmill.rendemen("BANSAW", p.from, p.to),
    sawmill.rendemen("BANSAW", p.prevFrom, p.prevTo),
  ]);
  return { cur, prev };
}

/** Status ruang KD per kemarin (keadaan, tanpa delta). */
async function kd(p) {
  const rows = await sawmill.kd(p.to);
  const kosong = rows.filter((r) => r.lastValue === "[KOSONG]");
  const terlama = kosong.sort((a, b) => (Number(b.totalHari) || 0) - (Number(a.totalHari) || 0))[0];
  return {
    terisi: rows.length - kosong.length,
    total: rows.length,
    kosongTerlama: terlama ? { ruang: terlama.ruang, hari: Number(terlama.totalHari) || 0 } : null,
  };
}

/** Tren harian: bahan baku masuk vs sawn timber dihasilkan (ton). */
async function trend(p) {
  const r = await request({ f: p.from, t: p.to });
  const res = await r.query(`
    DECLARE @from DATE = CAST(@f AS DATE);
    DECLARE @to DATE = CAST(@t AS DATE);
    WITH Hari AS (
      SELECT @from AS Tgl UNION ALL SELECT DATEADD(DAY, 1, Tgl) FROM Hari WHERE Tgl < @to
    ),
    BB AS (
      SELECT A.DateCreate AS Tgl, SUM(${BB_TON}) AS Ton
      FROM KayuBulat_h A
      LEFT JOIN KayuBulat_d B ON B.NoKayuBulat = A.NoKayuBulat
      LEFT JOIN KayuBulatKG_d D ON D.NoKayuBulat = A.NoKayuBulat
      LEFT JOIN MstJenisKayu E ON E.IdJenisKayu = A.IdJenisKayu
      WHERE A.DateCreate BETWEEN @from AND @to AND A.IdSupplier != ${ID_SUPPLIER_DIKECUALIKAN}
      GROUP BY A.DateCreate
    ),
    ST AS (
      SELECT H.TglSawmill AS Tgl, SUM(${ST_TON_FLOOR}) AS Ton
      FROM STSawmill_h H
      INNER JOIN STSawmill_d D ON D.NoSTSawmill = H.NoSTSawmill
      WHERE H.TglSawmill BETWEEN @from AND @to
      GROUP BY H.TglSawmill
    )
    SELECT CONVERT(varchar(10), Hari.Tgl, 23) AS date,
           ISNULL(BB.Ton, 0) AS bb_ton, ISNULL(ST.Ton, 0) AS st_ton
    FROM Hari
    LEFT JOIN BB ON BB.Tgl = Hari.Tgl
    LEFT JOIN ST ON ST.Tgl = Hari.Tgl
    ORDER BY Hari.Tgl
    OPTION (MAXRECURSION 400)
  `);
  return res.recordset.map((x) => ({ date: x.date, bb_ton: round(x.bb_ton), st_ton: round(x.st_ton) }));
}

const BUCKETS = `
  CASE WHEN Umur <= 3 THEN '0-3' WHEN Umur <= 7 THEN '4-7' WHEN Umur <= 14 THEN '8-14' ELSE '>14' END`;
const BUCKET_ORDER = ["0-3", "4-7", "8-14", ">14"];

function bucketRows(rows) {
  const map = Object.fromEntries(rows.map((r) => [r.Bucket, Number(r.Jumlah) || 0]));
  return BUCKET_ORDER.map((b) => ({ bucket: b, count: map[b] || 0 }));
}

/** Umur dokumen nyangkut yang masih terbuka (setelah tutup harian terakhir). */
async function agingNyangkut(p) {
  const r = await request({ d: p.today });
  const res = await r.query(`
    SELECT ${BUCKETS} AS Bucket, COUNT(1) AS Jumlah
    FROM (
      SELECT DATEDIFF(DAY, Tgl, CAST(@d AS DATE)) AS Umur
      FROM dbo.Nyangkut_h
      WHERE Tgl > (SELECT MAX(PeriodHarian) FROM dbo.MstTutupTransaksiHarian)
    ) X
    GROUP BY ${BUCKETS}
  `);
  return bucketRows(res.recordset);
}

/** Umur kayu bulat aktif (belum dipakai) sejak diterima. */
async function agingKayuBulat(p) {
  const r = await request({ d: p.today });
  const res = await r.query(`
    SELECT ${BUCKETS} AS Bucket, COUNT(1) AS Jumlah
    FROM (
      SELECT DATEDIFF(DAY, DateCreate, CAST(@d AS DATE)) AS Umur
      FROM dbo.KayuBulat_h
      WHERE DateUsage IS NULL AND DateCreate IS NOT NULL
        AND IdSupplier != ${ID_SUPPLIER_DIKECUALIKAN}
    ) X
    GROUP BY ${BUCKETS}
  `);
  return bucketRows(res.recordset);
}

const SOURCES = {
  produksi: produksiCounts,
  penjualan: penjualanCounts,
  kayuBulat,
  rendemen,
  kd,
  trend,
  agingNyangkut,
  agingKayuBulat,
};

/* ---------------- cache ---------------- */

const cache = new Map();

function cached(name, range, p, now = Date.now()) {
  const key = `${name}:${range}:${p.today}`;
  const hit = cache.get(key);
  if (hit && now - hit.at < CACHE_MS) return hit.promise;
  const promise = SOURCES[name](p);
  cache.set(key, { at: now, promise });
  promise.catch(() => cache.delete(key));
  return promise;
}

function clearCache() {
  cache.clear();
}

/** Jalankan satu sumber; galat menjadi null + dicatat, tidak menggagalkan yang lain. */
async function safe(name, range, p) {
  try {
    return { data: await cached(name, range, p) };
  } catch (err) {
    console.error(`Error dashboard home ${name}:`, err);
    return { data: null, error: "Data belum dapat dimuat." };
  }
}

/* ---------------- penyusun respons ---------------- */

function produksiDomain(key, label, list, perms, raw, menu) {
  const allowed = list.filter((x) => can(perms, x.perm));
  if (!allowed.length) return null;
  if (!raw.data) return { key, label, error: raw.error, detail: menu };
  const sum = (f) => allowed.reduce((s, x) => s + (raw.data[x.key]?.[f] || 0), 0);
  return {
    key,
    label,
    primary: { label: "Dokumen produksi", value: sum("cur"), unit: "dokumen" },
    delta: delta(pct(sum("cur"), sum("prev")), "pct"),
    secondary: [
      { label: "Hari ini", value: sum("today"), unit: "dokumen" },
      { label: allowed.map((x) => x.label).join(" · "), value: allowed.map((x) => raw.data[x.key]?.cur || 0).join(" · "), unit: "" },
    ],
    detail: menu,
  };
}

async function getHome({ permissions, range, today = new Date() }) {
  const p = periods(range, today);
  const canSawmill = can(permissions, "dashboard_sawmill:read");
  const canKb = can(permissions, "penerimaan_kayu_bulat:read", "dashboard_sawmill:read");
  const canProduksi = [...PHU, ...PHI].some((x) => can(permissions, x.perm));
  const canSt = can(permissions, "penjualan_st_snd:read");
  const canBj = can(permissions, "penjualan_bj:read");
  const canNyangkut = can(permissions, "nyangkut:read");

  const need = {
    rendemen: canSawmill,
    kayuBulat: canKb,
    produksi: canProduksi,
    penjualan: canSt || canBj,
    kd: canSawmill,
    trend: canKb,
    agingNyangkut: canNyangkut,
    agingKayuBulat: canKb,
  };
  const names = Object.keys(need).filter((n) => need[n]);
  const results = Object.fromEntries(
    await Promise.all(names.map(async (n) => [n, await safe(n, range, p)])),
  );

  const domains = [];
  if (need.rendemen) {
    const r = results.rendemen;
    domains.push(
      r.data
        ? {
            key: "sawmill",
            label: "Sawmill",
            primary: { label: "Rendemen Bansaw", value: round(r.data.cur.persen), unit: "%" },
            delta:
              r.data.prev && Number(r.data.prev.kbTon)
                ? delta(round(r.data.cur.persen - r.data.prev.persen, 1), "pts")
                : null,
            secondary: [
              { label: "Kayu bulat diolah", value: round(r.data.cur.kbTon), unit: "TON" },
              { label: "Sawn timber dihasilkan", value: round(r.data.cur.stTon), unit: "TON" },
            ],
            detail: "dashboard_sawmill",
          }
        : { key: "sawmill", label: "Sawmill", error: r.error, detail: "dashboard_sawmill" },
    );
  }
  if (need.kayuBulat) {
    const k = results.kayuBulat;
    domains.push(
      k.data
        ? {
            key: "kayu_bulat",
            label: "Kayu Bulat",
            primary: { label: "Bahan baku masuk", value: k.data.tonCur, unit: "TON" },
            delta: delta(pct(k.data.tonCur, k.data.tonPrev), "pct"),
            secondary: [
              { label: "Truk masuk", value: k.data.trukCur, unit: "truk" },
              { label: "Saldo hari ini", value: k.data.saldo, unit: "TON" },
            ],
            detail: "kayu_bulat",
          }
        : { key: "kayu_bulat", label: "Kayu Bulat", error: k.error, detail: "kayu_bulat" },
    );
  }
  if (need.produksi) {
    for (const d of [
      produksiDomain("produksi_phu", "Produksi PHU", PHU, permissions, results.produksi, "produksi_phu"),
      produksiDomain("produksi_phi", "Produksi PHI", PHI, permissions, results.produksi, "produksi_phi"),
    ]) {
      if (d) domains.push(d);
    }
  }
  if (need.penjualan) {
    const j = results.penjualan;
    if (!j.data) {
      domains.push({ key: "penjualan", label: "Penjualan", error: j.error, detail: "penjualan" });
    } else {
      const parts = [canSt && ["ST & WIP", j.data.st], canBj && ["Barang Jadi", j.data.bj]].filter(Boolean);
      const cur = parts.reduce((s, [, v]) => s + v.cur, 0);
      const prev = parts.reduce((s, [, v]) => s + v.prev, 0);
      domains.push({
        key: "penjualan",
        label: "Penjualan",
        primary: { label: "Dokumen kirim", value: cur, unit: "dokumen" },
        delta: delta(pct(cur, prev), "pct"),
        secondary: parts.map(([label, v]) => ({ label, value: v.cur, unit: "dokumen" })),
        detail: "penjualan",
      });
    }
  }
  if (need.kd) {
    const k = results.kd;
    domains.push(
      k.data
        ? {
            key: "kd",
            label: "KD",
            primary: { label: "Ruang KD terisi", value: `${k.data.terisi} / ${k.data.total}`, unit: "" },
            delta: null,
            secondary: [
              {
                label: "Kosong terlama",
                value: k.data.kosongTerlama ? `${k.data.kosongTerlama.ruang} · ${k.data.kosongTerlama.hari} hari` : "-",
                unit: "",
              },
              { label: "Per", value: p.to, unit: "" },
            ],
            detail: "kd",
          }
        : { key: "kd", label: "KD", error: k.error, detail: "kd" },
    );
  }

  const aging = [];
  if (need.agingNyangkut) {
    const a = results.agingNyangkut;
    aging.push({ key: "nyangkut", label: "Label nyangkut", unit: "dokumen", buckets: a.data, error: a.error || null });
  }
  if (need.agingKayuBulat) {
    const a = results.agingKayuBulat;
    aging.push({ key: "kayu_bulat", label: "Kayu bulat belum diolah", unit: "truk", buckets: a.data, error: a.error || null });
  }

  return {
    range_days: range,
    from: p.from,
    to: p.to,
    prev_from: p.prevFrom,
    prev_to: p.prevTo,
    generated_at: new Date().toISOString(),
    domains,
    trend: need.trend ? results.trend.data : null,
    trend_error: need.trend ? results.trend.error || null : null,
    aging,
  };
}

module.exports = { getHome, periods, pct, RANGES, clearCache };
