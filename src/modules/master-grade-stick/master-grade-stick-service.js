const { sql, poolPromise } = require("../../core/config/db");

/* ============================================================
 * Paritas desktop: FrmMstGradeStick.vb ("Master Grade Stick")
 * MstGradeStick (IdGradeStick = MAX + 1, bukan identity;
 * NamaGradeStick varchar(15); tanpa kolom Enable).
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

function validate(data) {
  const nama = str(data.namaGradeStick);
  if (!nama) throw httpError(400, "Nama grade stick harus diisi.");
  if (nama.length > 15) throw httpError(400, "Nama grade stick maksimal 15 karakter.");
  return { nama };
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
    SELECT IdGradeStick, NamaGradeStick
    FROM MstGradeStick
    ORDER BY IdGradeStick ASC
  `);
  return rs.recordset;
}

async function create(data, user) {
  const v = validate(data);
  return withTx(async (tx) => {
    const dup = await new sql.Request(tx)
      .input("n", sql.VarChar(15), v.nama)
      .query(`SELECT TOP 1 1 AS ok FROM MstGradeStick WHERE NamaGradeStick = @n`);
    if (dup.recordset.length) throw httpError(409, `Grade stick "${v.nama}" sudah terdaftar.`);
    const m = await new sql.Request(tx).query(
      `SELECT ISNULL(MAX(IdGradeStick), 0) + 1 AS NextId FROM MstGradeStick WITH (UPDLOCK, HOLDLOCK)`,
    );
    const id = m.recordset[0].NextId;
    await new sql.Request(tx)
      .input("id", sql.Int, id)
      .input("n", sql.VarChar(15), v.nama)
      .query(`INSERT INTO MstGradeStick (IdGradeStick, NamaGradeStick) VALUES (@id, @n)`);
    await audit(tx, user, `Menyimpan Data Master Grade Stick ${v.nama} (Web)`);
    return { idGradeStick: id };
  });
}

async function update(idParam, data, user) {
  const id = Number(idParam);
  if (!Number.isInteger(id)) throw httpError(400, "Id grade stick tidak valid.");
  const v = validate(data);
  return withTx(async (tx) => {
    const r = await new sql.Request(tx)
      .input("id", sql.Int, id)
      .input("n", sql.VarChar(15), v.nama)
      .query(`UPDATE MstGradeStick SET NamaGradeStick = @n WHERE IdGradeStick = @id`);
    if (!r.rowsAffected[0]) throw httpError(404, "Grade stick tidak ditemukan.");
    await audit(tx, user, `Mengubah Data Master Grade Stick ${v.nama} (Web)`);
    return { idGradeStick: id };
  });
}

async function remove(idParam, user) {
  const id = Number(idParam);
  if (!Number.isInteger(id)) throw httpError(400, "Id grade stick tidak valid.");
  try {
    return await withTx(async (tx) => {
      const cur = await new sql.Request(tx)
        .input("id", sql.Int, id)
        .query(`SELECT NamaGradeStick FROM MstGradeStick WHERE IdGradeStick = @id`);
      if (!cur.recordset.length) throw httpError(404, "Grade stick tidak ditemukan.");
      await new sql.Request(tx).input("id", sql.Int, id).query(`DELETE FROM MstGradeStick WHERE IdGradeStick = @id`);
      await audit(tx, user, `Menghapus Data Master Grade Stick ${cur.recordset[0].NamaGradeStick} (Web)`);
      return { idGradeStick: id };
    });
  } catch (err) {
    if (err.number === 547 || err.originalError?.info?.number === 547) {
      throw httpError(409, "Grade stick masih dipakai pada data lain dan tidak dapat dihapus. Gunakan Ubah bila ingin merubah nama.");
    }
    throw err;
  }
}

module.exports = { getAll, create, update, remove };
