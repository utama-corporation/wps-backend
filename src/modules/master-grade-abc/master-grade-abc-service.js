const { sql, poolPromise } = require("../../core/config/db");

/* ============================================================
 * Paritas desktop: FrmMstGradeABC.vb ("Master Grade ABC")
 * MstGradeABC (IdGradeABC = MAX + 1, bukan identity;
 * NamaGrade varchar(15); tanpa kolom Enable).
 * Catatan: berbeda dari modul transaksi grade-abc (GradeABC_h/_d)
 * yang sudah ada — modul ini khusus master MstGradeABC.
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
  const nama = str(data.namaGrade);
  if (!nama) throw httpError(400, "Nama grade harus diisi.");
  if (nama.length > 15) throw httpError(400, "Nama grade maksimal 15 karakter.");
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
    SELECT IdGradeABC, NamaGrade
    FROM MstGradeABC
    ORDER BY IdGradeABC ASC
  `);
  return rs.recordset;
}

async function create(data, user) {
  const v = validate(data);
  return withTx(async (tx) => {
    const dup = await new sql.Request(tx)
      .input("n", sql.VarChar(15), v.nama)
      .query(`SELECT TOP 1 1 AS ok FROM MstGradeABC WHERE NamaGrade = @n`);
    if (dup.recordset.length) throw httpError(409, `Grade "${v.nama}" sudah terdaftar.`);
    const m = await new sql.Request(tx).query(
      `SELECT ISNULL(MAX(IdGradeABC), 0) + 1 AS NextId FROM MstGradeABC WITH (UPDLOCK, HOLDLOCK)`,
    );
    const id = m.recordset[0].NextId;
    await new sql.Request(tx)
      .input("id", sql.Int, id)
      .input("n", sql.VarChar(15), v.nama)
      .query(`INSERT INTO MstGradeABC (IdGradeABC, NamaGrade) VALUES (@id, @n)`);
    await audit(tx, user, `Menyimpan Data Master Grade ABC ${v.nama} (Web)`);
    return { idGradeABC: id };
  });
}

async function update(idParam, data, user) {
  const id = Number(idParam);
  if (!Number.isInteger(id)) throw httpError(400, "Id grade ABC tidak valid.");
  const v = validate(data);
  return withTx(async (tx) => {
    const r = await new sql.Request(tx)
      .input("id", sql.Int, id)
      .input("n", sql.VarChar(15), v.nama)
      .query(`UPDATE MstGradeABC SET NamaGrade = @n WHERE IdGradeABC = @id`);
    if (!r.rowsAffected[0]) throw httpError(404, "Grade ABC tidak ditemukan.");
    await audit(tx, user, `Mengubah Data Master Grade ABC ${v.nama} (Web)`);
    return { idGradeABC: id };
  });
}

async function remove(idParam, user) {
  const id = Number(idParam);
  if (!Number.isInteger(id)) throw httpError(400, "Id grade ABC tidak valid.");
  try {
    return await withTx(async (tx) => {
      const cur = await new sql.Request(tx)
        .input("id", sql.Int, id)
        .query(`SELECT NamaGrade FROM MstGradeABC WHERE IdGradeABC = @id`);
      if (!cur.recordset.length) throw httpError(404, "Grade ABC tidak ditemukan.");
      await new sql.Request(tx).input("id", sql.Int, id).query(`DELETE FROM MstGradeABC WHERE IdGradeABC = @id`);
      await audit(tx, user, `Menghapus Data Master Grade ABC ${cur.recordset[0].NamaGrade} (Web)`);
      return { idGradeABC: id };
    });
  } catch (err) {
    if (err.number === 547 || err.originalError?.info?.number === 547) {
      throw httpError(409, "Grade ABC masih dipakai pada data lain dan tidak dapat dihapus. Gunakan Ubah bila ingin merubah nama.");
    }
    throw err;
  }
}

module.exports = { getAll, create, update, remove };
