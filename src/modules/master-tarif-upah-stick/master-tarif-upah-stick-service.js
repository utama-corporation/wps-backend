const { sql, poolPromise } = require("../../core/config/db");
const { hitungUlangUpahStick } = require("../label/st/upah-stick");
const { cekPeriodeTerbuka } = require("../../core/utils/periode-lock");

/* ============================================================
 * Master Tarif Upah Stick (MstTarifUpahStick, migrasi V6).
 * Tarif per jenis kayu & tebal (mm), dua kolom:
 *   TarifBundlePanjang - dipakai bila batang >= 4 ft mencapai >= 10% dari total
 *                        batang ber-panjang < 4 ft
 *   TarifBundlePendek  - selain itu
 * Upah per Label ST = tarif x JumlahTingkat (lihat label/st/upah-stick.js).
 * Tarif lama tetap disimpan; yang berlaku = BerlakuMulai terbaru <= tanggal tally.
 * ==========================================================*/

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

async function audit(transaction, user, aktivitas) {
  const r = new sql.Request(transaction);
  r.input("nip", sql.VarChar(50), user || "admin");
  r.input("aktivitas", sql.VarChar(500), aktivitas);
  await r.query(`INSERT INTO Riwayat ([Nip], [Tgl], [Aktivitas]) VALUES (@nip, GETDATE(), @aktivitas)`);
}

function num(v) {
  if (v === null || v === undefined || String(v).trim() === "") return NaN;
  return Number(String(v).replace(",", "."));
}

function toDate(v) {
  const s = String(v ?? "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s ? null : s;
}

function enabled(v) {
  if (v === undefined || v === null || v === "") return true;
  return v === true || v === 1 || v === "1" || String(v).toLowerCase() === "true";
}

function validate(data) {
  const idJenisKayu = Number(data.idJenisKayu);
  if (!Number.isInteger(idJenisKayu) || idJenisKayu <= 0) throw httpError(400, "Jenis kayu harus dipilih.");
  const tebal = Math.round(num(data.tebal) * 100) / 100;
  if (!Number.isFinite(tebal) || tebal <= 0) throw httpError(400, "Tebal harus lebih dari 0.");
  const tarifBundlePendek = num(data.tarifBundlePendek);
  const tarifBundlePanjang = num(data.tarifBundlePanjang);
  if (!Number.isFinite(tarifBundlePendek) || tarifBundlePendek < 0) throw httpError(400, "Tarif bundle pendek harus diisi (minimal 0).");
  if (!Number.isFinite(tarifBundlePanjang) || tarifBundlePanjang < 0) throw httpError(400, "Tarif bundle panjang harus diisi (minimal 0).");
  const berlakuMulai = toDate(data.berlakuMulai);
  if (!berlakuMulai) throw httpError(400, "Tanggal berlaku mulai harus diisi.");
  return {
    idJenisKayu,
    tebal,
    tarifBundlePendek,
    tarifBundlePanjang,
    berlakuMulai,
    enable: enabled(data.enable),
  };
}

async function withTx(fn) {
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const out = await fn(transaction);
    await transaction.commit();
    return out;
  } catch (err) {
    try { await transaction.rollback(); } catch { /* ignore */ }
    throw err;
  }
}

const label = (v, jenis) => `${jenis} tebal ${v.tebal} mm berlaku ${v.berlakuMulai}`;

/** Jenis kayu harus ada; satu tarif aktif per jenis kayu + tebal + tanggal berlaku. */
async function check(tx, v, exceptId) {
  const j = await new sql.Request(tx)
    .input("j", sql.Int, v.idJenisKayu)
    .query(`SELECT Jenis FROM dbo.MstJenisKayu WHERE IdJenisKayu = @j`);
  if (!j.recordset.length) throw httpError(400, "Jenis kayu tidak ditemukan.");
  if (v.enable) {
    const o = await new sql.Request(tx)
      .input("j", sql.Int, v.idJenisKayu)
      .input("tgl", sql.Date, v.berlakuMulai)
      .input("tebal", sql.Decimal(10, 2), v.tebal)
      .input("id", sql.Int, exceptId || 0)
      .query(`
        SELECT TOP 1 1 AS ada
        FROM dbo.MstTarifUpahStick WITH (UPDLOCK, HOLDLOCK)
        WHERE IdJenisKayu = @j AND BerlakuMulai = @tgl AND [Enable] = 1
          AND IdTarifUpahStick <> @id AND Tebal = @tebal
      `);
    if (o.recordset.length) {
      throw httpError(
        409,
        `Tarif untuk ${j.recordset[0].Jenis} tebal ${v.tebal} mm yang berlaku ${v.berlakuMulai} sudah ada.`,
      );
    }
  }
  return j.recordset[0].Jenis;
}

function bind(r, v) {
  return r
    .input("j", sql.Int, v.idJenisKayu)
    .input("tebal", sql.Decimal(10, 2), v.tebal)
    .input("pendek", sql.Decimal(18, 2), v.tarifBundlePendek)
    .input("panjang", sql.Decimal(18, 2), v.tarifBundlePanjang)
    .input("tgl", sql.Date, v.berlakuMulai)
    .input("en", sql.Bit, v.enable ? 1 : 0);
}

async function getAll() {
  const pool = await poolPromise;
  const rs = await pool.request().query(`
    SELECT T.IdTarifUpahStick, T.IdJenisKayu, J.Jenis,
           CAST(T.Tebal AS FLOAT) AS Tebal,
           CAST(T.TarifBundlePendek AS FLOAT) AS TarifBundlePendek,
           CAST(T.TarifBundlePanjang AS FLOAT) AS TarifBundlePanjang,
           CONVERT(VARCHAR(10), T.BerlakuMulai, 23) AS BerlakuMulai, T.[Enable]
    FROM dbo.MstTarifUpahStick T
    LEFT JOIN dbo.MstJenisKayu J ON J.IdJenisKayu = T.IdJenisKayu
    ORDER BY J.Jenis ASC, T.Tebal ASC, T.BerlakuMulai DESC
  `);
  return rs.recordset;
}

async function getJenisKayuOptions() {
  const pool = await poolPromise;
  const rs = await pool.request().query(`
    SELECT IdJenisKayu, Jenis FROM dbo.MstJenisKayu
    WHERE ISNULL([Enable], 1) = 1
    ORDER BY Jenis ASC
  `);
  return rs.recordset;
}

async function create(data, user) {
  const v = validate(data);
  return withTx(async (tx) => {
    const jenis = await check(tx, v, 0);
    const r = await bind(new sql.Request(tx), v).query(`
      INSERT INTO dbo.MstTarifUpahStick
        (IdJenisKayu, Tebal, TarifBundlePendek, TarifBundlePanjang, BerlakuMulai, [Enable])
      OUTPUT INSERTED.IdTarifUpahStick
      VALUES (@j, @tebal, @pendek, @panjang, @tgl, @en)
    `);
    const id = r.recordset[0].IdTarifUpahStick;
    await audit(tx, user, `Menyimpan Tarif Upah Stick ${label(v, jenis)} (Web)`);
    return { idTarifUpahStick: id };
  });
}

async function update(idParam, data, user) {
  const id = Number(idParam);
  if (!Number.isInteger(id) || id <= 0) throw httpError(400, "Id tarif upah stick tidak valid.");
  const v = validate(data);
  return withTx(async (tx) => {
    const jenis = await check(tx, v, id);
    const r = await bind(new sql.Request(tx), v).input("id", sql.Int, id).query(`
      UPDATE dbo.MstTarifUpahStick
      SET IdJenisKayu = @j, Tebal = @tebal,
          TarifBundlePendek = @pendek, TarifBundlePanjang = @panjang,
          BerlakuMulai = @tgl, [Enable] = @en
      WHERE IdTarifUpahStick = @id
    `);
    if (!r.rowsAffected[0]) throw httpError(404, "Tarif upah stick tidak ditemukan.");
    await audit(tx, user, `Mengubah Tarif Upah Stick ${label(v, jenis)} (Web)`);
    return { idTarifUpahStick: id };
  });
}

async function remove(idParam, user) {
  const id = Number(idParam);
  if (!Number.isInteger(id) || id <= 0) throw httpError(400, "Id tarif upah stick tidak valid.");
  return withTx(async (tx) => {
    const cur = await new sql.Request(tx).input("id", sql.Int, id).query(`
      SELECT J.Jenis, CAST(T.Tebal AS FLOAT) AS tebal,
             CONVERT(VARCHAR(10), T.BerlakuMulai, 23) AS berlakuMulai
      FROM dbo.MstTarifUpahStick T LEFT JOIN dbo.MstJenisKayu J ON J.IdJenisKayu = T.IdJenisKayu
      WHERE T.IdTarifUpahStick = @id
    `);
    if (!cur.recordset.length) throw httpError(404, "Tarif upah stick tidak ditemukan.");
    await new sql.Request(tx).input("id", sql.Int, id).query(`DELETE FROM dbo.MstTarifUpahStick WHERE IdTarifUpahStick = @id`);
    const c = cur.recordset[0];
    await audit(tx, user, `Menghapus Tarif Upah Stick ${label(c, c.Jenis)} (Web)`);
    return { idTarifUpahStick: id };
  });
}

/**
 * Hitung ulang snapshot upah label yang sudah ada setelah master tarif diperbaiki.
 * Tanpa ini, ST_h menyimpan "Tarif belum diatur..." dari saat label dibuat.
 * Label di periode yang sudah ditutup (Tutup Transaksi) TIDAK diubah: upahnya
 * mungkin sudah dibayar, jadi snapshot-nya dipertahankan dan dilaporkan.
 * opts: { user, recalc, terbuka } (recalc/terbuka untuk tes); fungsi = recalc.
 */
async function hitungUlangRentang(awalParam, akhirParam, opts = {}) {
  const o = typeof opts === "function" ? { recalc: opts } : opts || {};
  const recalc = o.recalc || hitungUlangUpahStick;
  const terbuka = o.terbuka || ((tgl) => cekPeriodeTerbuka(null, tgl));
  const awal = toDate(awalParam);
  const akhir = toDate(akhirParam);
  if (!awal || !akhir) throw httpError(400, "start_date dan end_date wajib berformat YYYY-MM-DD.");
  if (awal > akhir) throw httpError(400, "Tanggal awal tidak boleh melebihi tanggal akhir.");
  const pool = await poolPromise;
  const r = await pool
    .request()
    .input("awal", sql.Date, awal)
    .input("akhir", sql.Date, akhir)
    .query(`
      SELECT NoST, DateCreate FROM dbo.ST_h
      WHERE DateCreate >= @awal AND DateCreate < DATEADD(DAY, 1, @akhir)
        AND JumlahTingkat IS NOT NULL
      ORDER BY NoST
    `);
  const hasil = {
    diproses: r.recordset.length,
    dihitungUlang: 0,
    belumBerdasarkanTarif: [],
    dilewatiPeriodeTerkunci: [],
  };
  for (const row of r.recordset) {
    const noST = row.NoST;
    if (!(await terbuka(row.DateCreate))) {
      hasil.dilewatiPeriodeTerkunci.push(noST);
      continue;
    }
    try {
      const out = await recalc(noST);
      hasil.dihitungUlang++;
      if (out && out.keterangan) {
        hasil.belumBerdasarkanTarif.push({ noST, keterangan: out.keterangan });
      }
    } catch (err) {
      hasil.belumBerdasarkanTarif.push({ noST, keterangan: err.message || "Gagal menghitung ulang" });
    }
  }
  if (hasil.dihitungUlang > 0) {
    await pool
      .request()
      .input("nip", sql.VarChar(50), o.user || "admin")
      .input(
        "aktivitas",
        sql.VarChar(500),
        `Menghitung ulang upah stick ${hasil.dihitungUlang} label ST periode ${awal} s.d. ${akhir} (Web)`,
      )
      .query(`INSERT INTO Riwayat ([Nip], [Tgl], [Aktivitas]) VALUES (@nip, GETDATE(), @aktivitas)`);
  }
  return { awal, akhir, ...hasil };
}

module.exports = {
  getAll,
  getJenisKayuOptions,
  create,
  update,
  remove,
  validate,
  hitungUlangRentang,
};
