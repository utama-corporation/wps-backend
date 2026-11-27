const { sql, poolPromise } = require("../../../core/config/db");
const { badReq } = require("../../../core/utils/http-error");

/* ============================================================
 * Upah kru stick per Label ST (ST_h, migrasi V6). Satu label = satu bundle.
 *   - Bundle PANJANG bila batang ber-panjang >= 4 ft mencapai >= 10% dari total
 *     batang ber-panjang < 4 ft, selain itu PENDEK. Batang = JmlhBatang (ST_d),
 *     hanya bila satuan panjang label feet.
 *   - Tarif dari MstTarifUpahStick: jenis kayu label, tebal (mm) sama persis,
 *     BerlakuMulai terbaru <= tanggal label (DateCreate).
 *   - Upah = tarif x JumlahTingkat (diisi user di form Label ST).
 * Hasil disimpan sebagai snapshot di ST_h; bila tidak bisa dihitung,
 * alasannya disimpan di KeteranganUpahStick. Label tanpa jumlah tingkat
 * tidak mendapat upah (semua kolom hasil NULL).
 * ==========================================================*/

const UOM_FEET = 4;
const UOM_INCH = 3;
const BATAS_PANJANG_FT = 4; // kayu >= 4 ft dihitung panjang
const BATAS_PERSEN_PANJANG = 10; // >= 10% batang panjang vs batang pendek -> Bundle Panjang
const MAX_TINGKAT = 999;

const round = (n, d) => Math.round(n * 10 ** d) / 10 ** d;
const fmt = (n) => String(round(n, 2));
const pad = (n) => String(n).padStart(2, "0");

/** DateCreate dari mssql datang sebagai Date, dari form sebagai string YYYY-MM-DD. */
function tanggalIso(v) {
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return null;
    const utcMidnight =
      v.getUTCHours() === 0 &&
      v.getUTCMinutes() === 0 &&
      v.getUTCSeconds() === 0 &&
      v.getUTCMilliseconds() === 0;
    const y = utcMidnight ? v.getUTCFullYear() : v.getFullYear();
    const m = utcMidnight ? v.getUTCMonth() : v.getMonth();
    const d = utcMidnight ? v.getUTCDate() : v.getDate();
    return `${y}-${pad(m + 1)}-${pad(d)}`;
  }
  const s = String(v ?? "").trim();
  const iso = s.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  return tanggalIso(new Date(s));
}

/** jumlahTingkat dari client: undefined = tidak dikirim (biarkan), null = dikosongkan. */
function parseJumlahTingkat(data) {
  if (!data || !Object.prototype.hasOwnProperty.call(data, "jumlahTingkat")) return undefined;
  const v = data.jumlahTingkat;
  if (v === null || v === undefined || String(v).trim() === "") return null;
  const n = Number(String(v).trim());
  if (!Number.isInteger(n) || n < 1 || n > MAX_TINGKAT) {
    throw badReq(`Jumlah tingkat harus bilangan bulat 1-${MAX_TINGKAT}`);
  }
  return n;
}

/**
 * Jenis bundle & tebal tunggal dari detail label.
 * rows: { Tebal, Panjang, JmlhBatang }; satuan dari header label.
 */
function analisaDetail(rows, idUOMTebal, idUOMPanjang) {
  const feet = Number(idUOMPanjang) === UOM_FEET;
  const field = (row, ...names) => {
    for (const name of names) {
      if (row[name] !== undefined && row[name] !== null) return Number(row[name]) || 0;
    }
    return 0;
  };
  let panjangPcs = 0;
  let pendekPcs = 0;
  const tebal = new Set();
  for (const r of rows || []) {
    const pcs = field(r, "JmlhBatang", "jmlhBatang");
    const p = field(r, "Panjang", "panjang");
    if (feet && p > 0 && pcs > 0) {
      if (p >= BATAS_PANJANG_FT) panjangPcs += pcs;
      else pendekPcs += pcs;
    }
    const t = field(r, "Tebal", "tebal");
    if (t > 0 && pcs > 0) tebal.add(round(Number(idUOMTebal) === UOM_INCH ? t * 25.4 : t, 2));
  }

  // Persen dibulatkan 6 desimal agar tepat 10% tidak meleset karena float.
  const persen = pendekPcs > 0 ? round((panjangPcs / pendekPcs) * 100, 6) : null;
  const out = {
    panjangPcs,
    pendekPcs,
    persenPanjang: persen == null ? null : round(persen, 2),
    jenisBundle: null,
    tebalMm: null,
    keterangan: null,
  };
  if (panjangPcs > 0 || pendekPcs > 0) {
    out.jenisBundle = persen == null || persen >= BATAS_PERSEN_PANJANG ? "PANJANG" : "PENDEK";
  }

  const daftarTebal = [...tebal].sort((a, b) => a - b);
  if (daftarTebal.length === 1) out.tebalMm = daftarTebal[0];

  if (!feet) out.keterangan = "Satuan panjang label bukan feet";
  else if (!out.jenisBundle) out.keterangan = "Detail label belum diisi";
  else if (daftarTebal.length === 0) out.keterangan = "Tebal belum diisi";
  else if (daftarTebal.length > 1) out.keterangan = `Tebal lebih dari satu (${daftarTebal.map(fmt).join(", ")} mm)`;
  return out;
}

/** Gabungkan analisa, tarif, dan jumlah tingkat menjadi nilai yang disimpan. */
function hitungUpah(analisa, tarifRow, jumlahTingkat, konteks = {}) {
  const kosong = { jenisBundle: null, tarif: null, upah: null, keterangan: null };
  if (!jumlahTingkat) return kosong;
  const res = { ...kosong, jenisBundle: analisa.jenisBundle, keterangan: analisa.keterangan };
  if (res.keterangan) return res;
  if (!tarifRow) {
    const id = konteks.idJenisKayu != null ? `, IdJenisKayu ${konteks.idJenisKayu}` : "";
    const tgl = konteks.tanggal ? `, tgl ${tanggalIso(konteks.tanggal)}` : "";
    res.keterangan = `Tarif belum diatur untuk tebal ${fmt(analisa.tebalMm)} mm${id}${tgl}`;
    return res;
  }
  res.tarif = Number(analisa.jenisBundle === "PENDEK" ? tarifRow.TarifBundlePendek : tarifRow.TarifBundlePanjang);
  res.upah = round(res.tarif * jumlahTingkat, 2);
  return res;
}

// Skema V6 belum tentu sudah dimigrasi di semua DB; hasil positif di-cache.
let skemaSiap = false;
async function siap(request) {
  if (skemaSiap) return true;
  const r = await request.query(`
    SELECT CASE WHEN OBJECT_ID(N'dbo.MstTarifUpahStick', N'U') IS NOT NULL
                 AND COL_LENGTH(N'dbo.ST_h', N'UpahStick') IS NOT NULL
                 AND COL_LENGTH(N'dbo.ST_h', N'JumlahTingkat') IS NOT NULL
                THEN 1 ELSE 0 END AS ok
  `);
  skemaSiap = r.recordset[0]?.ok === 1;
  return skemaSiap;
}

/** Tarif berlaku terbaru untuk jenis kayu, tebal mm, dan tanggal label. */
async function cariTarif(request, idJenisKayu, analisa, tanggal) {
  if (!idJenisKayu || !analisa.tebalMm || analisa.keterangan) return null;
  const tgl = tanggalIso(tanggal);
  if (!tgl) return null;
  const t = await request
    .input("j", sql.Int, idJenisKayu)
    .input("tebal", sql.Decimal(10, 2), analisa.tebalMm)
    .input("tgl", sql.Date, tgl)
    .query(`
      SELECT TOP 1 CAST(TarifBundlePendek AS FLOAT) AS TarifBundlePendek,
                   CAST(TarifBundlePanjang AS FLOAT) AS TarifBundlePanjang
      FROM dbo.MstTarifUpahStick
      WHERE IdJenisKayu = @j AND [Enable] = 1
        AND Tebal = @tebal
        AND BerlakuMulai <= @tgl
      ORDER BY BerlakuMulai DESC, IdTarifUpahStick DESC
    `);
  return t.recordset[0] || null;
}

/**
 * Simpan JumlahTingkat (bila dikirim) lalu hitung ulang upah stick label,
 * di dalam `transaction`. Dilewati bila skema V6 belum ada, kecuali client
 * mengirim jumlah tingkat (agar tidak hilang tanpa kabar).
 */
async function simpanUpahStick(transaction, noST, jumlahTingkat) {
  if (!(await siap(new sql.Request(transaction)))) {
    if (jumlahTingkat !== undefined && jumlahTingkat !== null) {
      throw badReq("Fitur jumlah tingkat belum aktif di database (migrasi V6 belum dijalankan)");
    }
    return null;
  }

  if (jumlahTingkat !== undefined) {
    await new sql.Request(transaction)
      .input("no", sql.VarChar(50), noST)
      .input("t", sql.Int, jumlahTingkat)
      .query(`UPDATE ST_h SET JumlahTingkat = @t WHERE NoST = @no`);
  }

  const h = await new sql.Request(transaction).input("no", sql.VarChar(50), noST).query(`
    SELECT DateCreate, JumlahTingkat, IdJenisKayu, IdUOMTblLebar, IdUOMPanjang
    FROM ST_h WHERE NoST = @no
  `);
  const head = h.recordset[0];
  if (!head) return null;

  const d = await new sql.Request(transaction).input("no", sql.VarChar(50), noST).query(`
    SELECT Tebal, Panjang, JmlhBatang FROM ST_d WHERE NoST = @no
  `);
  const analisa = analisaDetail(d.recordset, head.IdUOMTblLebar, head.IdUOMPanjang);

  const tarifRow = head.JumlahTingkat
    ? await cariTarif(new sql.Request(transaction), head.IdJenisKayu, analisa, head.DateCreate || new Date())
    : null;

  const hasil = hitungUpah(analisa, tarifRow, head.JumlahTingkat, {
    idJenisKayu: head.IdJenisKayu,
    tanggal: head.DateCreate,
  });
  await new sql.Request(transaction)
    .input("no", sql.VarChar(50), noST)
    .input("jenis", sql.VarChar(10), hasil.jenisBundle)
    .input("tarif", sql.Decimal(18, 2), hasil.tarif)
    .input("upah", sql.Decimal(18, 2), hasil.upah)
    .input("ket", sql.VarChar(150), hasil.keterangan ? hasil.keterangan.slice(0, 150) : null)
    .query(`
      UPDATE ST_h SET
        JenisBundleStick = @jenis, TarifUpahStick = @tarif,
        UpahStick = @upah, KeteranganUpahStick = @ket
      WHERE NoST = @no
    `);
  return { ...hasil, jumlahTingkat: head.JumlahTingkat, persenPanjang: analisa.persenPanjang };
}

/** Hitung ulang dalam transaksi sendiri (alur ubah label yang menyimpan per bagian). */
async function hitungUlangUpahStick(noST, jumlahTingkat) {
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const out = await simpanUpahStick(transaction, noST, jumlahTingkat);
    await transaction.commit();
    return out;
  } catch (err) {
    try { await transaction.rollback(); } catch { /* ignore */ }
    throw err;
  }
}

/** Hitung upah untuk form create tanpa menyimpan apa pun. */
async function previewUpah(data) {
  const jumlahTingkat = parseJumlahTingkat(data);
  const analisa = analisaDetail(data?.details, data?.idUOMTblLebar, data?.idUOMPanjang);
  const dasar = {
    tingkat: jumlahTingkat,
    persenPanjang: analisa.persenPanjang,
    jenisBundle: analisa.jenisBundle,
  };
  if (!jumlahTingkat) {
    return {
      ...dasar,
      tarif: null,
      upah: null,
      keterangan: analisa.keterangan || "Jumlah tingkat belum diisi",
    };
  }
  const idJenisKayu = Number(data.idJenisKayu);
  if (!Number.isInteger(idJenisKayu) || idJenisKayu <= 0) {
    throw badReq("Jenis kayu wajib dipilih.");
  }
  const pool = await poolPromise;
  if (!(await siap(pool.request()))) {
    return {
      ...dasar,
      tarif: null,
      upah: null,
      keterangan: "Fitur upah stick belum aktif di database",
    };
  }
  const tarifRow = await cariTarif(pool.request(), idJenisKayu, analisa, data.dateCreate);
  return {
    ...dasar,
    ...hitungUpah(analisa, tarifRow, jumlahTingkat, {
      idJenisKayu: idJenisKayu,
      tanggal: data.dateCreate,
    }),
  };
}

/** Kolom upah stick untuk detail label; objek kosong bila skema V6 belum ada. */
async function bacaUpahStick(noST) {
  const pool = await poolPromise;
  if (!(await siap(pool.request()))) return {};
  const r = await pool.request().input("no", sql.VarChar(50), noST).query(`
    SELECT JumlahTingkat, JenisBundleStick,
           CAST(TarifUpahStick AS FLOAT) AS TarifUpahStick,
           CAST(UpahStick AS FLOAT) AS UpahStick,
           KeteranganUpahStick
    FROM ST_h WHERE NoST = @no
  `);
  return r.recordset[0] || {};
}

module.exports = {
  parseJumlahTingkat,
  tanggalIso,
  analisaDetail,
  hitungUpah,
  simpanUpahStick,
  hitungUlangUpahStick,
  previewUpah,
  bacaUpahStick,
};
