const { sql, poolPromise } = require("../../core/config/db");

/* ============================================================
 * Paritas desktop: FrmOffset.vb ("Master Offset Racipan Hidup")
 * MstSaldoAwalRacipan_h (PK: TglSaldoAwal date;
 * UserCreate varchar(20); TglMulaiSTKeluar date).
 * Offset (PK: IdJenisKayu + Tebal + Lebar + Panjang + Tanggal;
 * JmlhBatang int; Ket varchar(50); IsBagusKulit bit;
 * TglMulaiSTKeluar date). Desktop: simpan = insert header + insert
 * rows; ubah = update header + delete rows (Tanggal lama) + insert
 * ulang (replace-all); hapus = hapus header + hapus rows.
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

const str = (v) => String(v ?? "").trim();
const num = (v) => (v === null || v === undefined || v === "" ? null : Number(v));
const bit = (v) => (v === true || v === 1 || v === "1" || v === "true" ? 1 : 0);

function parseDateOnly(v, label) {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw httpError(400, `${label} tidak valid.`);
  return d.toISOString().slice(0, 10);
}

function validateRows(body) {
  const raw = body?.rows;
  if (!Array.isArray(raw) || !raw.length) throw httpError(400, "Detail offset minimal 1 baris.");
  const seen = new Set();
  return raw.map((r, i) => {
    const idJenisKayu = num(r?.idJenisKayu);
    const tebal = num(r?.tebal);
    const lebar = num(r?.lebar);
    const panjang = num(r?.panjang);
    const jmlhBatang = num(r?.jmlhBatang);
    if (!Number.isInteger(idJenisKayu)) throw httpError(400, `Baris ${i + 1}: jenis kayu harus dipilih.`);
    if (!(tebal > 0)) throw httpError(400, `Baris ${i + 1}: tebal harus diisi.`);
    if (!(lebar > 0)) throw httpError(400, `Baris ${i + 1}: lebar harus diisi.`);
    if (!(panjang > 0)) throw httpError(400, `Baris ${i + 1}: panjang harus diisi.`);
    if (!Number.isInteger(jmlhBatang) || jmlhBatang < 0) throw httpError(400, `Baris ${i + 1}: jumlah batang tidak valid.`);
    const ket = str(r?.ket);
    if (ket.length > 50) throw httpError(400, `Baris ${i + 1}: keterangan maksimal 50 karakter.`);
    const k = `${idJenisKayu}|${tebal}|${lebar}|${panjang}`;
    if (seen.has(k)) throw httpError(409, `Baris ${i + 1}: dimensi ganda untuk jenis kayu yang sama.`);
    seen.add(k);
    return { idJenisKayu, tebal, lebar, panjang, jmlhBatang, ket, isBagusKulit: bit(r?.isBagusKulit) };
  });
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

async function validateJenis(tx, rows) {
  for (const id of [...new Set(rows.map((r) => r.idJenisKayu))]) {
    const j = await new sql.Request(tx)
      .input("j", sql.Int, id)
      .query(`SELECT TOP 1 Jenis FROM MstJenisKayu WHERE IdJenisKayu = @j`);
    if (!j.recordset.length) throw httpError(404, `Jenis kayu id ${id} tidak ditemukan.`);
  }
}

async function insertRows(tx, tglSaldoAwal, tglMulai, rows) {
  for (const r of rows) {
    await new sql.Request(tx)
      .input("tgl", sql.Date, tglSaldoAwal)
      .input("mulai", sql.Date, tglMulai)
      .input("j", sql.Int, r.idJenisKayu)
      .input("t", sql.Float, r.tebal)
      .input("l", sql.Float, r.lebar)
      .input("p", sql.Float, r.panjang)
      .input("n", sql.Int, r.jmlhBatang)
      .input("k", sql.VarChar(50), r.ket || null)
      .input("b", sql.Bit, r.isBagusKulit)
      .query(`INSERT INTO Offset (Tanggal, TglMulaiSTKeluar, IdJenisKayu, Tebal, Lebar, Panjang, JmlhBatang, Ket, IsBagusKulit)
              VALUES (@tgl, @mulai, @j, @t, @l, @p, @n, @k, @b)`);
  }
}

async function getAll() {
  const pool = await poolPromise;
  const rs = await pool.request().query(`
    SELECT CONVERT(varchar(10), h.TglSaldoAwal, 120) AS TglSaldoAwal,
           CONVERT(varchar(10), h.TglMulaiSTKeluar, 120) AS TglMulaiSTKeluar,
           h.UserCreate,
           (SELECT COUNT(*) FROM Offset o WHERE o.Tanggal = h.TglSaldoAwal) AS JumlahBaris
    FROM MstSaldoAwalRacipan_h h
    ORDER BY h.TglSaldoAwal DESC
  `);
  return rs.recordset;
}

async function getDetail(tglParam) {
  const tgl = parseDateOnly(tglParam, "Tanggal saldo awal");
  const pool = await poolPromise;
  const rs = await pool.request()
    .input("tgl", sql.Date, tgl)
    .query(`
      SELECT o.IdJenisKayu, j.Jenis, o.Tebal, o.Lebar, o.Panjang,
             o.JmlhBatang, o.Ket, CAST(ISNULL(o.IsBagusKulit, 0) AS bit) AS IsBagusKulit,
             CONVERT(varchar(10), o.TglMulaiSTKeluar, 120) AS TglMulaiSTKeluar
      FROM Offset o
      LEFT JOIN MstJenisKayu j ON j.IdJenisKayu = o.IdJenisKayu
      WHERE o.Tanggal = @tgl
      ORDER BY j.Jenis ASC, o.Tebal ASC, o.Lebar ASC, o.Panjang ASC
    `);
  return rs.recordset;
}

async function getJenisKayu() {
  const pool = await poolPromise;
  const rs = await pool.request().query(`
    SELECT IdJenisKayu, Jenis FROM MstJenisKayu WHERE ISNULL(Enable, 1) = 1 ORDER BY Jenis ASC
  `);
  return rs.recordset;
}

async function create(data, user) {
  const tglSaldoAwal = parseDateOnly(data?.tglSaldoAwal, "Tanggal saldo awal");
  const tglMulai = parseDateOnly(data?.tglMulaiSTKeluar, "Tanggal mulai ST keluar");
  const rows = validateRows(data);
  return withTx(async (tx) => {
    const dup = await new sql.Request(tx)
      .input("t", sql.Date, tglSaldoAwal)
      .query(`SELECT TOP 1 1 AS ok FROM MstSaldoAwalRacipan_h WHERE TglSaldoAwal = @t`);
    if (dup.recordset.length) throw httpError(409, `Saldo awal racipan tanggal ${tglSaldoAwal} sudah terdaftar.`);
    await validateJenis(tx, rows);
    await new sql.Request(tx)
      .input("t", sql.Date, tglSaldoAwal)
      .input("u", sql.VarChar(20), user || "admin")
      .input("m", sql.Date, tglMulai)
      .query(`INSERT INTO MstSaldoAwalRacipan_h (TglSaldoAwal, UserCreate, TglMulaiSTKeluar) VALUES (@t, @u, @m)`);
    await insertRows(tx, tglSaldoAwal, tglMulai, rows);
    await audit(tx, user, `Menyimpan Data Master Offset Racipan Hidup ${tglSaldoAwal} (${rows.length} baris) (Web)`);
    return { tglSaldoAwal };
  });
}

async function update(tglParam, data, user) {
  const oldTgl = parseDateOnly(tglParam, "Tanggal saldo awal");
  const tglSaldoAwal = parseDateOnly(data?.tglSaldoAwal, "Tanggal saldo awal");
  const tglMulai = parseDateOnly(data?.tglMulaiSTKeluar, "Tanggal mulai ST keluar");
  const rows = validateRows(data);
  return withTx(async (tx) => {
    const cur = await new sql.Request(tx)
      .input("t", sql.Date, oldTgl)
      .query(`SELECT TOP 1 1 AS ok FROM MstSaldoAwalRacipan_h WHERE TglSaldoAwal = @t`);
    if (!cur.recordset.length) throw httpError(404, "Saldo awal racipan tidak ditemukan.");
    if (oldTgl !== tglSaldoAwal) {
      const dup = await new sql.Request(tx)
        .input("t", sql.Date, tglSaldoAwal)
        .query(`SELECT TOP 1 1 AS ok FROM MstSaldoAwalRacipan_h WHERE TglSaldoAwal = @t`);
      if (dup.recordset.length) throw httpError(409, `Saldo awal racipan tanggal ${tglSaldoAwal} sudah terdaftar.`);
    }
    await validateJenis(tx, rows);
    await new sql.Request(tx)
      .input("ot", sql.Date, oldTgl)
      .input("t", sql.Date, tglSaldoAwal)
      .input("m", sql.Date, tglMulai)
      .query(`UPDATE MstSaldoAwalRacipan_h SET TglSaldoAwal = @t, TglMulaiSTKeluar = @m WHERE TglSaldoAwal = @ot`);
    await new sql.Request(tx).input("tgl", sql.Date, oldTgl).query(`DELETE FROM Offset WHERE Tanggal = @tgl`);
    await insertRows(tx, tglSaldoAwal, tglMulai, rows);
    await audit(tx, user, `Mengubah Data Master Offset Racipan Hidup ${tglSaldoAwal} (${rows.length} baris) (Web)`);
    return { tglSaldoAwal };
  });
}

async function remove(tglParam, user) {
  const tgl = parseDateOnly(tglParam, "Tanggal saldo awal");
  try {
    return await withTx(async (tx) => {
      const cur = await new sql.Request(tx)
        .input("t", sql.Date, tgl)
        .query(`SELECT TOP 1 1 AS ok FROM MstSaldoAwalRacipan_h WHERE TglSaldoAwal = @t`);
      if (!cur.recordset.length) throw httpError(404, "Saldo awal racipan tidak ditemukan.");
      await new sql.Request(tx).input("tgl", sql.Date, tgl).query(`DELETE FROM Offset WHERE Tanggal = @tgl`);
      await new sql.Request(tx).input("t", sql.Date, tgl).query(`DELETE FROM MstSaldoAwalRacipan_h WHERE TglSaldoAwal = @t`);
      await audit(tx, user, `Menghapus Data Master Offset Racipan Hidup ${tgl} (Web)`);
      return { tglSaldoAwal: tgl };
    });
  } catch (err) {
    if (err.number === 547 || err.originalError?.info?.number === 547) {
      throw httpError(409, "Saldo awal racipan masih dipakai pada data lain dan tidak dapat dihapus.");
    }
    throw err;
  }
}

module.exports = { getAll, getDetail, getJenisKayu, create, update, remove };
