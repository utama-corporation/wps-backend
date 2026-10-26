/**
 * Rumus & konstanta bersama Dashboard Sawmill (port FrmDashboardSawmill.vb).
 * Semua nilai di sini konstanta kode (bukan input user), aman disisipkan ke teks SQL.
 * Angka harus sama dengan aplikasi desktop: jangan "merapikan" Round/Floor antar blok.
 */

/** Pengukuran berat (kayu bulat RB). */
const ID_PENGUKURAN_BERAT = 5;

/** NoMeja SLP 1: produksinya dihitung dalam batang (JlhBatangRajang), bukan ton. */
const NO_MEJA_SLP_BATANG = 15;

/**
 * Daftar meja SLP per blok — SENGAJA berbeda, mengikuti desktop:
 *  - Rendemen SLP (LoadData10/Header) : 11,14,15,16,17
 *  - Rendemen Ban Saw (LoadData7/Header2): SLP hanya 11,14,15,16 (meja 17 ikut Ban Saw).
 * Pertanyaan terbuka ke tim produksi: apakah meja 17 memang begitu.
 */
const MEJA_SLP_UNTUK_SLP = [11, 14, 15, 16, 17];
const MEJA_SLP_UNTUK_BANSAW = [11, 14, 15, 16];

/** ST (sawn timber) -> ton, versi FLOOR 4 desimal per baris (blok produktivitas). Alias detail = D. */
const ST_TON_FLOOR = `
  CASE
    WHEN D.IdUOMTblLebar = 1 THEN FLOOR(D.Tebal * D.Lebar * D.Panjang * 304.8 * D.JmlhBatang / 1000000000 / 1.416 * 10000) / 10000
    WHEN D.IdUOMTblLebar = 3 THEN FLOOR(D.Tebal * D.Lebar * D.Panjang * D.JmlhBatang / 7200.8 * 10000) / 10000
  END`;

/** Predikat LIKE gabungan untuk teks NoMeja ("11, 14") — sama dengan desktop. */
const likeAny = (col, list) => list.map((n) => `${col} LIKE '%${Number(n)}%'`).join(" OR ");

/**
 * Ambang warna Umur Tunggu (UT) per jenis — dari FrmDashboardSawmill.LoadData2.
 * UT di atas `peringatan` dan di bawah `bahaya` = peringatan (oranye); UT >= `bahaya` = bahaya (merah).
 */
const AMBANG_UT = [
  { jenis: ["RAMBUNG", "JABON TG"], peringatan: 4, bahaya: 7 },
  { jenis: ["PULAI"], peringatan: 14, bahaya: 19 },
];

/** Supplier yang dikecualikan dari saldo & bahan baku (hardcode di desktop). */
const ID_SUPPLIER_DIKECUALIKAN = 7234;

module.exports = {
  ID_PENGUKURAN_BERAT,
  NO_MEJA_SLP_BATANG,
  MEJA_SLP_UNTUK_SLP,
  MEJA_SLP_UNTUK_BANSAW,
  ST_TON_FLOOR,
  AMBANG_UT,
  ID_SUPPLIER_DIKECUALIKAN,
  likeAny,
};
