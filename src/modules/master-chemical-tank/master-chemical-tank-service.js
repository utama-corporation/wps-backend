const { sql, poolPromise } = require("../../core/config/db");

/* ============================================================
 * Paritas desktop: FrmMstChemicalTank.vb ("Master Chemical Tank")
 * MstChemicalTank_h (IdChemicalTank = MAX + 1, bukan identity;
 * Enable bit; Lebar int; Panjang int).
 * MstChemicalTank_d (PK: IdChemicalTank + IdJenis) — daftar jenis
 * kayu (IdJenis = MstJenisKayu.IdJenisKayu); desktop menyimpan
 * replace-all (hapus semua + insert ulang) pada simpan/ubah.
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

const num = (v) => (v === null || v === undefined || v === "" ? null : Number(v));
const bit = (v) => (v === true || v === 1 || v === "1" || v === "true" ? 1 : 0);

function validateHeader(data) {
  const lebar = num(data?.lebar);
  const panjang = num(data?.panjang);
  if (!Number.isInteger(lebar) || lebar <= 0) throw httpError(400, "Lebar harus diisi dengan bilangan bulat.");
  if (!Number.isInteger(panjang) || panjang <= 0) throw httpError(400, "Panjang harus diisi dengan bilangan bulat.");
  return { enable: bit(data?.enable), lebar, panjang };
}

function validateJenisIds(body) {
  const raw = body?.jenisIds;
  if (!Array.isArray(raw)) throw httpError(400, "Field jenisIds harus berupa array.");
  const ids = raw.map((x) => num(x));
  for (const id of ids) {
    if (!Number.isInteger(id)) throw httpError(400, "Jenis kayu tidak valid.");
  }
  return [...new Set(ids)];
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

async function getAll() {
  const pool = await poolPromise;
  const rs = await pool.request().query(`
    SELECT h.IdChemicalTank, CAST(ISNULL(h.[Enable], 0) AS bit) AS [Enable],
           h.Lebar, h.Panjang,
           (SELECT COUNT(*) FROM MstChemicalTank_d d WHERE d.IdChemicalTank = h.IdChemicalTank) AS JumlahJenis
    FROM MstChemicalTank_h h
    ORDER BY h.IdChemicalTank ASC
  `);
  return rs.recordset;
}

async function getDetail(idParam) {
  const id = Number(idParam);
  if (!Number.isInteger(id)) throw httpError(400, "Id chemical tank tidak valid.");
  const pool = await poolPromise;
  const rs = await pool.request()
    .input("id", sql.Int, id)
    .query(`
      SELECT d.IdChemicalTank, d.IdJenis, j.Jenis
      FROM MstChemicalTank_d d
      LEFT JOIN MstJenisKayu j ON j.IdJenisKayu = d.IdJenis
      WHERE d.IdChemicalTank = @id
      ORDER BY j.Jenis ASC
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

async function validateJenis(tx, ids) {
  for (const id of ids) {
    const j = await new sql.Request(tx)
      .input("j", sql.Int, id)
      .query(`SELECT TOP 1 Jenis FROM MstJenisKayu WHERE IdJenisKayu = @j`);
    if (!j.recordset.length) throw httpError(404, `Jenis kayu id ${id} tidak ditemukan.`);
  }
}

async function insertDetail(tx, id, ids) {
  for (const idJenis of ids) {
    await new sql.Request(tx)
      .input("id", sql.Int, id)
      .input("j", sql.Int, idJenis)
      .query(`INSERT INTO MstChemicalTank_d (IdChemicalTank, IdJenis) VALUES (@id, @j)`);
  }
}

async function create(data, user) {
  const v = validateHeader(data);
  const jenisIds = validateJenisIds(data);
  return withTx(async (tx) => {
    await validateJenis(tx, jenisIds);
    const m = await new sql.Request(tx).query(
      `SELECT ISNULL(MAX(IdChemicalTank), 0) + 1 AS NextId FROM MstChemicalTank_h WITH (UPDLOCK, HOLDLOCK)`,
    );
    const id = m.recordset[0].NextId;
    await new sql.Request(tx)
      .input("id", sql.Int, id)
      .input("e", sql.Bit, v.enable)
      .input("l", sql.Int, v.lebar)
      .input("p", sql.Int, v.panjang)
      .query(`INSERT INTO MstChemicalTank_h (IdChemicalTank, [Enable], Lebar, Panjang) VALUES (@id, @e, @l, @p)`);
    await insertDetail(tx, id, jenisIds);
    await audit(tx, user, `Menyimpan Data Master Chemical Tank ${id} (${jenisIds.length} jenis kayu) (Web)`);
    return { idChemicalTank: id };
  });
}

async function update(idParam, data, user) {
  const id = Number(idParam);
  if (!Number.isInteger(id)) throw httpError(400, "Id chemical tank tidak valid.");
  const v = validateHeader(data);
  const jenisIds = validateJenisIds(data);
  return withTx(async (tx) => {
    const cur = await new sql.Request(tx)
      .input("id", sql.Int, id)
      .query(`SELECT TOP 1 1 AS ok FROM MstChemicalTank_h WHERE IdChemicalTank = @id`);
    if (!cur.recordset.length) throw httpError(404, "Chemical tank tidak ditemukan.");
    await validateJenis(tx, jenisIds);
    await new sql.Request(tx)
      .input("id", sql.Int, id)
      .input("e", sql.Bit, v.enable)
      .input("l", sql.Int, v.lebar)
      .input("p", sql.Int, v.panjang)
      .query(`UPDATE MstChemicalTank_h SET [Enable] = @e, Lebar = @l, Panjang = @p WHERE IdChemicalTank = @id`);
    await new sql.Request(tx).input("id", sql.Int, id).query(`DELETE FROM MstChemicalTank_d WHERE IdChemicalTank = @id`);
    await insertDetail(tx, id, jenisIds);
    await audit(tx, user, `Mengubah Data Master Chemical Tank ${id} (${jenisIds.length} jenis kayu) (Web)`);
    return { idChemicalTank: id };
  });
}

async function remove(idParam, user) {
  const id = Number(idParam);
  if (!Number.isInteger(id)) throw httpError(400, "Id chemical tank tidak valid.");
  try {
    return await withTx(async (tx) => {
      const cur = await new sql.Request(tx)
        .input("id", sql.Int, id)
        .query(`SELECT TOP 1 1 AS ok FROM MstChemicalTank_h WHERE IdChemicalTank = @id`);
      if (!cur.recordset.length) throw httpError(404, "Chemical tank tidak ditemukan.");
      await new sql.Request(tx).input("id", sql.Int, id).query(`DELETE FROM MstChemicalTank_d WHERE IdChemicalTank = @id`);
      await new sql.Request(tx).input("id", sql.Int, id).query(`DELETE FROM MstChemicalTank_h WHERE IdChemicalTank = @id`);
      await audit(tx, user, `Menghapus Data Master Chemical Tank ${id} (Web)`);
      return { idChemicalTank: id };
    });
  } catch (err) {
    if (err.number === 547 || err.originalError?.info?.number === 547) {
      throw httpError(409, "Chemical tank masih dipakai pada data lain dan tidak dapat dihapus. Ubah statusnya menjadi TIDAK AKTIF sebagai gantinya.");
    }
    throw err;
  }
}

module.exports = { getAll, getDetail, getJenisKayu, create, update, remove };
