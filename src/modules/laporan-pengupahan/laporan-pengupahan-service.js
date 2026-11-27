const { sql, poolPromise } = require("../../core/config/db");

/* ============================================================
 * Laporan Pengupahan kru stick Label ST.
 *   - Sumber: snapshot upah di ST_h (JumlahTingkat, JenisBundleStick,
 *     TarifUpahStick, UpahStick), bukan hitung ulang dari master tarif.
 *   - Header group: NamaStickBy. Baris: per tanggal + tebal (ST_d, dinormalisasi
 *     ke mm), menjumlahkan label pada tanggal & tebal yang sama.
 *   - Satu label = satu bundle: tingkat & upah masuk kolom pendek ATAU panjang.
 *   - Total upah = tarif x tingkat dari snapshot; grand total = semua label.
 * ==========================================================*/

const UOM_INCH = 3;
const round = (n, d) => Math.round(n * 10 ** d) / 10 ** d;
const angka = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

function tebalMm(row) {
  const tebal = angka(row.Tebal);
  return round(Number(row.IdUOMTblLebar) === UOM_INCH ? tebal * 25.4 : tebal, 2);
}

/** Satu baris label: kolom pendek/panjang saling eksklusif. */
function baris(row, no) {
  const bundle = String(row.JenisBundleStick || "").toUpperCase();
  const tingkat = angka(row.JumlahTingkat);
  const upah = round(angka(row.UpahStick), 2);
  const pendek = bundle === "PENDEK";
  const panjang = bundle === "PANJANG";
  return {
    no,
    nomor: row.NoST,
    tanggal: String(row.Tanggal || "").slice(0, 10),
    tebal: tebalMm(row),
    nama: String(row.NamaStickBy || "").trim() || "-",
    tingkatPendek: pendek ? tingkat : 0,
    upahPendek: pendek ? upah : 0,
    tingkatPanjang: panjang ? tingkat : 0,
    upahPanjang: panjang ? upah : 0,
    totalUpah: upah,
    keterangan: row.KeteranganUpahStick || null,
  };
}

function jumlah(rows) {
  return rows.reduce(
    (t, r) => ({
      tingkatPendek: t.tingkatPendek + r.tingkatPendek,
      upahPendek: round(t.upahPendek + r.upahPendek, 2),
      tingkatPanjang: t.tingkatPanjang + r.tingkatPanjang,
      upahPanjang: round(t.upahPanjang + r.upahPanjang, 2),
      totalUpah: round(t.totalUpah + r.totalUpah, 2),
    }),
    {
      tingkatPendek: 0,
      upahPendek: 0,
      tingkatPanjang: 0,
      upahPanjang: 0,
      totalUpah: 0,
    },
  );
}

/**
 * Gabungkan label satu kru menjadi satu baris per tanggal + tebal (mm):
 * tingkat & upah pendek/panjang dijumlahkan; alasan label yang belum
 * terhitung dikumpulkan (unik) untuk catatan baris.
 */
function barisTanggalTebal(labels) {
  const map = new Map();
  for (const r of labels) {
    const key = `${r.tanggal}\u0000${r.tebal}`;
    if (!map.has(key)) {
      map.set(key, { tanggal: r.tanggal, tebal: r.tebal, label: [], keterangan: [] });
    }
    const b = map.get(key);
    b.label.push(r);
    if (r.keterangan && !b.keterangan.includes(r.keterangan)) b.keterangan.push(r.keterangan);
  }
  return [...map.values()]
    .sort((a, b) => (a.tanggal < b.tanggal ? -1 : a.tanggal > b.tanggal ? 1 : a.tebal - b.tebal))
    .map((b) => ({
      tanggal: b.tanggal,
      tebal: b.tebal,
      jumlahLabel: b.label.length,
      ...jumlah(b.label),
      keterangan: b.keterangan.length ? b.keterangan.join("; ") : null,
    }));
}

/** Header group = NamaStickBy; baris = tanggal + tebal; subtotal per kru. */
function grup(labels) {
  const groups = new Map();
  for (const r of labels) {
    if (!groups.has(r.nama)) groups.set(r.nama, []);
    groups.get(r.nama).push(r);
  }
  let no = 0;
  return [...groups.entries()].map(([nama, isi]) => {
    const rows = barisTanggalTebal(isi).map((b) => ({ no: ++no, ...b }));
    return { nama, rows, total: jumlah(isi) };
  });
}

async function getLaporan(awal, akhir) {
  const pool = await poolPromise;
  const result = await pool
    .request()
    .input("awal", sql.Date, awal)
    .input("akhir", sql.Date, akhir)
    .query(`
      SELECT
        A.NoST,
        CONVERT(VARCHAR(10), A.DateCreate, 23) AS Tanggal,
        ISNULL(E.NamaStickBy, '-') AS NamaStickBy,
        D.Tebal,
        A.IdUOMTblLebar,
        A.JumlahTingkat,
        A.JenisBundleStick,
        CAST(A.TarifUpahStick AS FLOAT) AS TarifUpahStick,
        CAST(A.UpahStick AS FLOAT) AS UpahStick,
        A.KeteranganUpahStick
      FROM ST_h A
      LEFT JOIN MstStickBy E ON E.IdStickBy = A.IdStickBy
      LEFT JOIN (
        SELECT NoST, MIN(Tebal) AS Tebal FROM ST_d GROUP BY NoST
      ) D ON D.NoST = A.NoST
      WHERE A.DateCreate >= @awal AND A.DateCreate < DATEADD(DAY, 1, @akhir)
        AND A.JumlahTingkat IS NOT NULL
      ORDER BY ISNULL(E.NamaStickBy, '-'), A.DateCreate, D.Tebal, A.NoST
    `);
  const rows = (result.recordset || []).map((row, i) => baris(row, i + 1));
  return {
    awal,
    akhir,
    groups: grup(rows),
    grandTotal: jumlah(rows),
  };
}

module.exports = {
  UOM_INCH,
  tebalMm,
  baris,
  jumlah,
  grup,
  getLaporan,
};
