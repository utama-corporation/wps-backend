const { sql, poolPromise } = require("../../core/config/db");

/* ============================================================
 * Paritas desktop: LapCariKoordinat.vb
 * Mencari koordinat tanah (surat tanah) asal kayu untuk satu No. SPK, lewat rantai
 *   S4SProduksiOutput -> S4SProduksiInputST -> ST_h -> KayuBulat_h -> MstSuratTanah.
 * No. SPK yang dicocokkan = NoSPKTujuan bila ada, selain itu NoSPK (seperti VB).
 * Fitur: daftar tanah, export CSV, persentase ST per pemilik, export GeoJSON polygon perkiraan.
 * Hanya baca data (tanpa perubahan di database).
 * ==========================================================*/

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function requireSpk(noSpk) {
  const v = String(noSpk ?? "").trim();
  if (!v) throw httpError(400, "No. SPK harus dipilih.");
  return v;
}

/** Ekspresi No. SPK efektif pada alias S4S_h F: SPK tujuan bila ada. */
const SPK_EFEKTIF = "CASE WHEN F.NoSPKTujuan IS NULL THEN F.NoSPK ELSE F.NoSPKTujuan END";

/* ---------------- Parser (port helper VB) ---------------- */

/** "20.000,50" (id) / "20000.50" / "2 ha" -> meter persegi; 0 bila tidak terbaca. */
function parseLuasM2(raw) {
  if (raw === null || raw === undefined) return 0;
  let s = String(raw).trim();
  if (!s) return 0;
  const isHa = /ha/i.test(s);
  s = s.replace(/m2|m²|ha/gi, "").trim();
  if (!s) return 0;

  let n;
  if (s.includes(",") && s.includes(".")) {
    // pemisah desimal = yang muncul terakhir
    n = s.lastIndexOf(",") > s.lastIndexOf(".")
      ? Number(s.replace(/\./g, "").replace(",", "."))
      : Number(s.replace(/,/g, ""));
  } else if (s.includes(",")) {
    n = Number(s.replace(",", ".")); // koma desimal (id-ID), sama seperti VB
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    n = Number(s.replace(/\./g, "")); // titik ribuan: 20.000
  } else {
    n = Number(s);
  }
  if (!Number.isFinite(n) || n < 0) return 0;
  return isHa ? n * 10000 : n;
}

/** "lat, lon" -> {lat, lon}; null bila tidak valid (WGS84). */
function parseKoordinat(raw) {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).replace(/[()°\t]/g, "").trim();
  if (!s) return null;
  const parts = s.split(",");
  if (parts.length !== 2) return null;
  const lat = Number(parts[0].trim());
  const lon = Number(parts[1].trim());
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return { lat, lon };
}

const BULAN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function formatPeriode(d) {
  if (!d) return "";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "";
  return `${BULAN[dt.getUTCMonth()]}-${dt.getUTCFullYear()}`;
}

/* ---------------- Query ---------------- */

async function getSpkList() {
  const pool = await poolPromise;
  const rs = await pool.request().query(`SELECT NoSPK FROM dbo.MstSPK_h ORDER BY NoSPK ASC`);
  return rs.recordset.map((r) => r.NoSPK);
}

/** Daftar tanah untuk satu SPK (grid utama form VB). */
async function getTanah(noSpkRaw) {
  const noSpk = requireSpk(noSpkRaw);
  const pool = await poolPromise;
  const rs = await pool
    .request()
    .input("spk", sql.VarChar(50), noSpk)
    .query(`
      SELECT G.NamaTanah, G.NamaPemilik, G.DesaKelurahan, G.KabupatenKota, G.Provinsi,
             DATEFROMPARTS(YEAR(E.DateCreate), MONTH(E.DateCreate), 1) AS Periode,
             ${SPK_EFEKTIF} AS NoSPK, G.NoSuratTanah, G.Luas, G.Koordinat
      FROM dbo.S4SProduksiOutput A
      LEFT JOIN dbo.S4SProduksiInputST B ON B.NoProduksi = A.NoProduksi
      LEFT JOIN dbo.S4SProduksi_h C ON C.NoProduksi = A.NoProduksi
      LEFT JOIN dbo.ST_h D ON D.NoST = B.NoST
      LEFT JOIN dbo.KayuBulat_h E ON E.NoKayuBulat = D.NoKayuBulat
      LEFT JOIN dbo.S4S_h F ON F.NoS4S = A.NoS4S
      LEFT JOIN dbo.MstSuratTanah G ON G.IdTanah = E.IdTanah
      WHERE ${SPK_EFEKTIF} = @spk AND G.NamaTanah IS NOT NULL
      GROUP BY G.NamaTanah, G.NamaPemilik, G.DesaKelurahan, G.KabupatenKota, G.Provinsi,
               DATEFROMPARTS(YEAR(E.DateCreate), MONTH(E.DateCreate), 1), ${SPK_EFEKTIF},
               G.NoSuratTanah, G.Luas, G.Koordinat
      
               union all


	    SELECT G.NamaTanah, G.NamaPemilik, G.DesaKelurahan, G.KabupatenKota, G.Provinsi,
             DATEFROMPARTS(YEAR(H.TglLaporan), MONTH(H.TglLaporan), 1) AS Periode,
             ${SPK_EFEKTIF} as NoSPK, G.NoSuratTanah, G.Luas, G.Koordinat
      FROM dbo.S4SProduksiOutput A
      LEFT JOIN dbo.S4SProduksiInputST B ON B.NoProduksi = A.NoProduksi
      LEFT JOIN dbo.S4SProduksi_h C ON C.NoProduksi = A.NoProduksi
      LEFT JOIN dbo.ST_h D ON D.NoST = B.NoST
      INNER JOIN PenerimaanSTPembelian_d E ON E.NoST = D.NoST
      INNER JOIN PenerimaanSTPembelian_h H ON H.NoPenerimaanST = E.NoPenerimaanST
      LEFT JOIN dbo.S4S_h F ON F.NoS4S = A.NoS4S
      LEFT JOIN dbo.MstSuratTanah G ON G.IdTanah = H.IdTanah
      WHERE ${SPK_EFEKTIF} = @spk AND G.NamaTanah IS NOT NULL
      GROUP BY G.NamaTanah, G.NamaPemilik, G.DesaKelurahan, G.KabupatenKota, G.Provinsi,
               DATEFROMPARTS(YEAR(H.TglLaporan), MONTH(H.TglLaporan), 1), ${SPK_EFEKTIF},
               G.NoSuratTanah, G.Luas, G.Koordinat


      ORDER BY G.NamaPemilik ASC, G.NamaTanah ASC
    `);
  return rs.recordset;
}

/** Persentase volume ST per tanah / pemilik (GetDataGeoJson di VB). */
async function getPemilik(noSpkRaw) {
  const noSpk = requireSpk(noSpkRaw);
  const pool = await poolPromise;
  const rs = await pool
    .request()
    .input("spk", sql.VarChar(50), noSpk)
    .query(`
      ;WITH X AS (
        SELECT F.Koordinat, A.NoSPK, F.NamaPemilik, F.NamaTanah, F.DesaKelurahan, F.KabupatenKota,
               F.NoSuratTanah, F.Luas, F.Provinsi,
          CASE
            WHEN (A.IdUOMTblLebar = 1 AND A.IdUOMPanjang = 4) THEN
              ROUND((C.Tebal*C.Lebar*C.Panjang*C.JmlhBatang*215.2542/100000)/10000, 4, 1)
            WHEN (A.IdUOMTblLebar = 3 AND A.IdUOMPanjang = 4) THEN
              ROUND((C.Tebal*C.Lebar*C.Panjang*C.JmlhBatang/7200.8*10000)/10000, 4, 1)
            ELSE NULL
          END AS Nilai
        FROM dbo.ST_h A
        INNER JOIN dbo.ST_d C ON C.NoST = A.NoST
        INNER JOIN dbo.KayuBulat_h D ON D.NoKayuBulat = A.NoKayuBulat
        LEFT JOIN dbo.MstSuratTanah F ON F.IdTanah = D.IdTanah
        WHERE A.NoSPKTujuan = @spk OR A.NoSPK = @spk

        UNION ALL

        SELECT L.Koordinat, ${SPK_EFEKTIF} AS NoSPK, L.NamaPemilik, L.NamaTanah,
               L.DesaKelurahan, L.KabupatenKota, L.NoSuratTanah, L.Luas, L.Provinsi,
          CASE
            WHEN (ST.IdUOMTblLebar = 1 AND ST.IdUOMPanjang = 4) THEN
              ROUND((SD.Tebal*SD.Lebar*SD.Panjang*SD.JmlhBatang*215.2542/100000)/10000, 4, 1)
            WHEN (ST.IdUOMTblLebar = 3 AND ST.IdUOMPanjang = 4) THEN
              ROUND((SD.Tebal*SD.Lebar*SD.Panjang*SD.JmlhBatang/7200.8*10000)/10000, 4, 1)
            ELSE NULL
          END AS Nilai
        FROM dbo.S4SProduksiOutput O
        LEFT JOIN dbo.S4SProduksiInputST I ON I.NoProduksi = O.NoProduksi
        LEFT JOIN dbo.S4S_h F ON F.NoS4S = O.NoS4S
        LEFT JOIN dbo.ST_h ST ON ST.NoST = I.NoST
        INNER JOIN dbo.ST_d SD ON SD.NoST = ST.NoST
        INNER JOIN PenerimaanSTPembelian_d PD ON PD.NoST = ST.NoST
        INNER JOIN PenerimaanSTPembelian_h PH ON PH.NoPenerimaanST = PD.NoPenerimaanST
        LEFT JOIN dbo.MstSuratTanah L ON L.IdTanah = PH.IdTanah
        WHERE ${SPK_EFEKTIF} = @spk AND L.NamaTanah IS NOT NULL
      )
      SELECT NamaTanah, NamaPemilik, DesaKelurahan, KabupatenKota, Provinsi, NoSPK, NoSuratTanah, Luas, Koordinat,
             SUM(Nilai) AS Total,
             100.0 * SUM(Nilai) / NULLIF(SUM(SUM(Nilai)) OVER (), 0) AS Persen
      FROM X
      GROUP BY NamaTanah, NamaPemilik, DesaKelurahan, KabupatenKota, Provinsi, NoSPK, NoSuratTanah, Luas, Koordinat
      ORDER BY Persen DESC
    `);
  return mergeByTanah(rs.recordset);
}

/**
 * Query di atas mengelompokkan juga per NoSPK ST, jadi satu tanah bisa muncul lebih dari sekali
 * (mis. ST bernomor SPK berbeda tetapi tujuannya sama). Gabungkan per tanah supaya pilihan pemilik
 * unik dan export GeoJSON tidak memuat polygon kembar; Total & Persen dijumlahkan.
 */
function mergeByTanah(records) {
  const map = new Map();
  for (const r of records) {
    const key = pemilikKey(r);
    const cur = map.get(key);
    if (!cur) {
      map.set(key, { ...r, Key: key, _spk: new Set(r.NoSPK ? [r.NoSPK] : []) });
      continue;
    }
    if (r.Total !== null && r.Total !== undefined) cur.Total = (cur.Total ?? 0) + Number(r.Total);
    if (r.Persen !== null && r.Persen !== undefined) cur.Persen = (cur.Persen ?? 0) + Number(r.Persen);
    if (r.NoSPK) cur._spk.add(r.NoSPK);
  }
  return [...map.values()]
    .map(({ _spk, ...row }) => ({ ...row, NoSPK: [..._spk].join(", ") }))
    .sort((a, b) => (b.Persen ?? -1) - (a.Persen ?? -1));
}

/** Kunci stabil satu baris pemilik (dipakai untuk memilih baris yang diexport). */
function pemilikKey(r) {
  return [r.NoSuratTanah, r.NamaTanah, r.NamaPemilik, r.Koordinat].map((v) => String(v ?? "").trim()).join("||");
}

/** Persentase ST per jenis kayu dan pemilik (laporan "Persentase (ST)" di VB). */
async function getPersentase(noSpkRaw) {
  const noSpk = requireSpk(noSpkRaw);
  const pool = await poolPromise;
  const rs = await pool
    .request()
    .input("spk", sql.VarChar(50), noSpk)
    .query(`
      ;WITH X AS (
        SELECT * FROM (
          SELECT B.Jenis, F.Koordinat,
                 CASE WHEN A.NoSPKTujuan IS NULL THEN A.NoSPK ELSE A.NoSPKTujuan END AS NoSPK,
                 H.Buyer, G.Tujuan, F.NamaPemilik, YEAR(D.DateCreate) AS Tahun,
            CASE
              WHEN (A.IdUOMTblLebar = 1 AND A.IdUOMPanjang = 4) THEN
                ROUND((C.Tebal*C.Lebar*C.Panjang*C.JmlhBatang*215.2542/100000)/10000, 4, 1)
              WHEN (A.IdUOMTblLebar = 3 AND A.IdUOMPanjang = 4) THEN
                ROUND((C.Tebal*C.Lebar*C.Panjang*C.JmlhBatang/7200.8*10000)/10000, 4, 1)
              ELSE NULL
            END AS Nilai
          FROM dbo.ST_h A
          INNER JOIN dbo.MstJenisKayu B ON B.IdJenisKayu = A.IdJenisKayu
          INNER JOIN dbo.ST_d C ON C.NoST = A.NoST
          INNER JOIN dbo.KayuBulat_h D ON D.NoKayuBulat = A.NoKayuBulat
          LEFT JOIN dbo.MstSuratTanah F ON F.IdTanah = D.IdTanah
          LEFT JOIN dbo.MstSPK_h G ON G.NoSPK = A.NoSPK
          LEFT JOIN dbo.MstBuyer H ON H.IdBuyer = G.IdBuyer
          UNION ALL
          SELECT JK.Jenis, L.Koordinat,
                 ${SPK_EFEKTIF} AS NoSPK,
                 Buyer.Buyer, SPK.Tujuan, L.NamaPemilik, YEAR(PH.TglLaporan) AS Tahun,
            CASE
              WHEN (ST.IdUOMTblLebar = 1 AND ST.IdUOMPanjang = 4) THEN
                ROUND((SD.Tebal*SD.Lebar*SD.Panjang*SD.JmlhBatang*215.2542/100000)/10000, 4, 1)
              WHEN (ST.IdUOMTblLebar = 3 AND ST.IdUOMPanjang = 4) THEN
                ROUND((SD.Tebal*SD.Lebar*SD.Panjang*SD.JmlhBatang/7200.8*10000)/10000, 4, 1)
              ELSE NULL
            END AS Nilai
          FROM dbo.S4SProduksiOutput O
          LEFT JOIN dbo.S4SProduksiInputST I ON I.NoProduksi = O.NoProduksi
          LEFT JOIN dbo.S4S_h F ON F.NoS4S = O.NoS4S
          LEFT JOIN dbo.ST_h ST ON ST.NoST = I.NoST
          INNER JOIN dbo.ST_d SD ON SD.NoST = ST.NoST
          INNER JOIN dbo.MstJenisKayu JK ON JK.IdJenisKayu = ST.IdJenisKayu
          INNER JOIN PenerimaanSTPembelian_d PD ON PD.NoST = ST.NoST
          INNER JOIN PenerimaanSTPembelian_h PH ON PH.NoPenerimaanST = PD.NoPenerimaanST
          LEFT JOIN dbo.MstSuratTanah L ON L.IdTanah = PH.IdTanah
          LEFT JOIN dbo.MstSPK_h SPK ON SPK.NoSPK = ${SPK_EFEKTIF}
          LEFT JOIN dbo.MstBuyer Buyer ON Buyer.IdBuyer = SPK.IdBuyer
          WHERE ${SPK_EFEKTIF} = @spk AND L.NamaTanah IS NOT NULL
        ) A
        WHERE A.NoSPK = @spk
      )
      SELECT Jenis, SUM(Nilai) AS Total,
             100.0 * SUM(Nilai) / NULLIF(SUM(SUM(Nilai)) OVER (), 0) AS Persen,
             Koordinat, NoSPK, Buyer, Tujuan, NamaPemilik, Tahun
      FROM X
      GROUP BY Jenis, Koordinat, NoSPK, Buyer, Tujuan, NamaPemilik, Tahun
      ORDER BY Persen DESC
    `);
  return rs.recordset;
}

/* ---------------- Export CSV ---------------- */

function csvCell(v) {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * CSV format buyer (kolom sama dengan VB): NO, PRODUCER_NAME, PERIODE, COUNTRY, PRODUCTION_PLACE,
 * AREA (ha), LATITUDE, LONGITUDE. Hanya tanah yang punya pemilik & koordinat terbaca.
 */
async function buildCsv(noSpkRaw) {
  const rows = await getTanah(noSpkRaw);
  const out = [];
  for (const r of rows) {
    const k = parseKoordinat(r.Koordinat);
    if (!r.NamaPemilik || !k) continue;
    out.push({
      producer: String(r.NamaPemilik).trim(),
      periode: formatPeriode(r.Periode),
      place: r.Provinsi ?? "",
      areaHa: Math.round((parseLuasM2(r.Luas) / 10000) * 10000) / 10000,
      lat: k.lat,
      lon: k.lon,
    });
  }
  out.sort((a, b) => a.producer.localeCompare(b.producer, "id"));
  const lines = [["NO", "PRODUCER_NAME", "PERIODE", "COUNTRY", "PRODUCTION_PLACE", "AREA (ha)", "LATITUDE", "LONGITUDE"].join(",")];
  out.forEach((o, i) => {
    lines.push(
      [i + 1, o.producer, o.periode, "IDN", o.place, o.areaHa, o.lat, o.lon].map(csvCell).join(","),
    );
  });
  return { csv: lines.join("\r\n") + "\r\n", jumlah: out.length };
}

/* ---------------- Export GeoJSON (polygon perkiraan) ---------------- */

/** Seed stabil dari teks (port GetStableSeed VB) -> bentuk polygon tetap untuk tanah yang sama. */
function stableSeed(text) {
  const t = String(text ?? "").trim() ? String(text) : "DEFAULT_SEED";
  let hash = 17;
  for (let i = 0; i < t.length; i++) hash = (hash * 31 + t.charCodeAt(i)) % 2147483647;
  return hash <= 0 ? 123456 : hash;
}

/** PRNG deterministik (mulberry32). Hasil bentuk berbeda dari System.Random VB, tetapi stabil per tanah. */
function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const r6 = (n) => Math.round(n * 1e6) / 1e6;

/** Polygon tertutup 8 titik (+1 penutup) berpusat di (lon, lat) dengan luas mendekati luasM2 (port VB). */
function polygonByArea(lon, lat, luasM2, seedText, points = 8) {
  const luas = luasM2 > 0 ? luasM2 : 10000;
  const cosLat = Math.cos((lat * Math.PI) / 180);
  if (Math.abs(cosLat) < 1e-6) throw httpError(400, "Latitude tidak valid untuk membuat polygon.");
  const mLat = 111320;
  const mLon = 111320 * cosLat;

  const rnd = makeRng(stableSeed(seedText));
  const baseRadius = Math.sqrt(luas / Math.PI);
  const startAngle = rnd() * 2 * Math.PI;

  const local = [];
  for (let i = 0; i < points; i++) {
    const baseAngle = startAngle + (2 * Math.PI * i) / points;
    const radiusFactor = 0.9 + rnd() * 0.2;
    const angleJitter = (rnd() - 0.5) * 0.12;
    const r = baseRadius * radiusFactor;
    const angle = baseAngle + angleJitter;
    local.push([Math.cos(angle) * r, Math.sin(angle) * r]);
  }

  let area = 0;
  for (let i = 0; i < local.length; i++) {
    const j = (i + 1) % local.length;
    area += local[i][0] * local[j][1] - local[j][0] * local[i][1];
  }
  area = Math.abs(area / 2);
  if (area <= 0) throw httpError(500, "Gagal menghitung luas polygon.");

  const scale = Math.sqrt(luas / area);
  const ring = local.map(([x, y]) => [r6(lon + (x * scale) / mLon), r6(lat + (y * scale) / mLat)]);
  ring.push([...ring[0]]);
  return ring;
}

function polygonSeed(row, lon, lat, luasM2) {
  const koor = `${lon.toFixed(6)},${lat.toFixed(6)}`;
  const luasKey = (Math.round(luasM2 * 100) / 100).toFixed(2);
  const surat = String(row.NoSuratTanah ?? "").trim();
  if (surat) return `SURAT|${surat}|KOOR|${koor}|LUAS|${luasKey}`;
  return `TANAH|${String(row.NamaTanah ?? "").trim()}|PEMILIK|${String(row.NamaPemilik ?? "").trim()}|KOOR|${koor}|LUAS|${luasKey}`;
}

/**
 * GeoJSON (FeatureCollection polygon) untuk pemilik terpilih. Polygon dibuat dari SATU titik koordinat dan
 * luas tanah, BUKAN batas tanah hasil pengukuran; hal itu dinyatakan eksplisit di properti tiap fitur.
 */
async function buildGeoJson(noSpkRaw, keys) {
  const noSpk = requireSpk(noSpkRaw);
  if (!Array.isArray(keys) || keys.length === 0) throw httpError(400, "Pilih minimal satu pemilik untuk diexport.");
  const wanted = new Set(keys.map(String));
  const rows = (await getPemilik(noSpk)).filter((r) => wanted.has(r.Key));
  if (!rows.length) throw httpError(404, "Data pemilik terpilih tidak ditemukan.");

  const features = [];
  let skip = 0;
  for (const row of rows) {
    const k = parseKoordinat(row.Koordinat);
    if (!k) {
      skip++;
      continue;
    }
    let luasM2 = parseLuasM2(row.Luas);
    if (luasM2 <= 0) luasM2 = 10000;
    const ring = polygonByArea(k.lon, k.lat, luasM2, polygonSeed(row, k.lon, k.lat, luasM2));

    features.push({
      type: "Feature",
      properties: {
        nama_tanah: row.NamaTanah ?? "",
        nama_pemilik: row.NamaPemilik ?? "",
        desa_kelurahan: row.DesaKelurahan ?? "",
        kabupaten_kota: row.KabupatenKota ?? "",
        provinsi: row.Provinsi ?? "",
        no_spk: row.NoSPK ?? "",
        no_surat_tanah: row.NoSuratTanah ?? "",
        luas_m2: Math.round(luasM2 * 100) / 100,
        luas_ha: r6(luasM2 / 10000),
        coordinate_reference_system: "EPSG:4326 - WGS84",
        coordinate_order: "Longitude, Latitude",
        polygon_approximated: true,
        geometry_method: "Polygon 8 titik dibuat otomatis dari 1 titik koordinat dengan luas mengikuti data Luas",
        keterangan_polygon: "Bukan batas tanah hasil pengukuran. Titik pusat dan luas berasal dari data surat tanah.",
      },
      geometry: { type: "Polygon", coordinates: [ring] },
    });
  }
  if (!features.length) throw httpError(400, "Tidak ada koordinat valid untuk dibuat GeoJSON.");

  return {
    geojson: { type: "FeatureCollection", name: `Koordinat_${noSpk}`, features },
    diproses: features.length,
    dilewati: skip,
  };
}

module.exports = { getSpkList, getTanah, getPemilik, getPersentase, buildCsv, buildGeoJson };
