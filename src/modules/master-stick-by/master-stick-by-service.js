const { sql, poolPromise } = require("../../core/config/db");

/* ============================================================
 * Paritas desktop: FrmMstStick.vb ("Master Stick By")
 * MstStickBy (IdStickBy = MAX + 1, bukan identity;
 * NamaStickBy nvarchar(20); Enable bit).
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
const bit = (v) => (v === true || v === 1 || v === "1" || v === "true" ? 1 : 0);

function validate(data) {
  const nama = str(data.namaStickBy);
  if (!nama) throw httpError(400, "Nama stick by harus diisi.");
  if (nama.length > 20) throw httpError(400, "Nama stick by maksimal 20 karakter.");
  return { nama, enable: bit(data.enable) };
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
    SELECT IdStickBy, NamaStickBy, CAST(ISNULL([Enable], 0) AS bit) AS [Enable]
    FROM MstStickBy
    ORDER BY IdStickBy ASC
  `);
  return rs.recordset;
}

async function create(data, user) {
  const v = validate(data);
  return withTx(async (tx) => {
    const dup = await new sql.Request(tx)
      .input("n", sql.NVarChar(20), v.nama)
      .query(`SELECT TOP 1 1 AS ok FROM MstStickBy WHERE NamaStickBy = @n`);
    if (dup.recordset.length) throw httpError(409, `Stick by "${v.nama}" sudah terdaftar.`);
    const m = await new sql.Request(tx).query(
      `SELECT ISNULL(MAX(IdStickBy), 0) + 1 AS NextId FROM MstStickBy WITH (UPDLOCK, HOLDLOCK)`,
    );
    const id = m.recordset[0].NextId;
    await new sql.Request(tx)
      .input("id", sql.Int, id)
      .input("n", sql.NVarChar(20), v.nama)
      .input("e", sql.Bit, v.enable)
      .query(`INSERT INTO MstStickBy (IdStickBy, NamaStickBy, [Enable]) VALUES (@id, @n, @e)`);
    await audit(tx, user, `Menyimpan Data Master Stick By ${v.nama} (Web)`);
    return { idStickBy: id };
  });
}

async function update(idParam, data, user) {
  const id = Number(idParam);
  if (!Number.isInteger(id)) throw httpError(400, "Id stick by tidak valid.");
  const v = validate(data);
  return withTx(async (tx) => {
    const r = await new sql.Request(tx)
      .input("id", sql.Int, id)
      .input("n", sql.NVarChar(20), v.nama)
      .input("e", sql.Bit, v.enable)
      .query(`UPDATE MstStickBy SET NamaStickBy = @n, [Enable] = @e WHERE IdStickBy = @id`);
    if (!r.rowsAffected[0]) throw httpError(404, "Stick by tidak ditemukan.");
    await audit(tx, user, `Mengubah Data Master Stick By ${v.nama} (Web)`);
    return { idStickBy: id };
  });
}

async function remove(idParam, user) {
  const id = Number(idParam);
  if (!Number.isInteger(id)) throw httpError(400, "Id stick by tidak valid.");
  try {
    return await withTx(async (tx) => {
      const cur = await new sql.Request(tx)
        .input("id", sql.Int, id)
        .query(`SELECT NamaStickBy FROM MstStickBy WHERE IdStickBy = @id`);
      if (!cur.recordset.length) throw httpError(404, "Stick by tidak ditemukan.");
      await new sql.Request(tx).input("id", sql.Int, id).query(`DELETE FROM MstStickBy WHERE IdStickBy = @id`);
      await audit(tx, user, `Menghapus Data Master Stick By ${cur.recordset[0].NamaStickBy} (Web)`);
      return { idStickBy: id };
    });
  } catch (err) {
    if (err.number === 547 || err.originalError?.info?.number === 547) {
      throw httpError(409, "Stick by masih dipakai pada data lain dan tidak dapat dihapus. Ubah statusnya menjadi TIDAK AKTIF sebagai gantinya.");
    }
    throw err;
  }
}

module.exports = { getAll, create, update, remove };
