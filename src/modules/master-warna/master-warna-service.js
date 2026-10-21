const { sql, poolPromise } = require("../../core/config/db");

/* ============================================================
 * Paritas desktop: FrmMstWarna.vb ("Data Master Warna")
 * MstWarna (IdWarna = MAX + 1, bukan identity; NamaWarna varchar(20)).
 * Tanpa kolom Enable (desktop hanya Id + Nama).
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
  const nama = str(data.namaWarna);
  if (!nama) throw httpError(400, "Nama warna harus diisi.");
  if (nama.length > 20) throw httpError(400, "Nama warna maksimal 20 karakter.");
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

async function assertUnique(tx, nama, exceptId) {
  const r = await new sql.Request(tx)
    .input("n", sql.VarChar(20), nama)
    .input("id", sql.Int, exceptId ?? 0)
    .query(`SELECT TOP 1 1 AS dup FROM MstWarna WHERE NamaWarna = @n AND IdWarna <> @id`);
  if (r.recordset.length) throw httpError(409, `Warna "${nama}" sudah ada.`);
}

async function getAll() {
  const pool = await poolPromise;
  const rs = await pool.request().query(`
    SELECT IdWarna, NamaWarna FROM MstWarna ORDER BY NamaWarna ASC
  `);
  return rs.recordset;
}

async function create(data, user) {
  const v = validate(data);
  return withTx(async (tx) => {
    await assertUnique(tx, v.nama, null);
    const m = await new sql.Request(tx).query(
      `SELECT ISNULL(MAX(IdWarna), 0) + 1 AS NextId FROM MstWarna WITH (UPDLOCK, HOLDLOCK)`,
    );
    const id = m.recordset[0].NextId;
    await new sql.Request(tx)
      .input("id", sql.Int, id)
      .input("n", sql.VarChar(20), v.nama)
      .query(`INSERT INTO MstWarna (IdWarna, NamaWarna) VALUES (@id, @n)`);
    await audit(tx, user, `Menyimpan Data Warna ${v.nama} (Web)`);
    return { idWarna: id };
  });
}

async function update(idParam, data, user) {
  const id = Number(idParam);
  if (!Number.isInteger(id)) throw httpError(400, "Id warna tidak valid.");
  const v = validate(data);
  return withTx(async (tx) => {
    await assertUnique(tx, v.nama, id);
    const r = await new sql.Request(tx)
      .input("id", sql.Int, id)
      .input("n", sql.VarChar(20), v.nama)
      .query(`UPDATE MstWarna SET NamaWarna = @n WHERE IdWarna = @id`);
    if (!r.rowsAffected[0]) throw httpError(404, "Warna tidak ditemukan.");
    await audit(tx, user, `Mengubah Data Warna ${v.nama} (Web)`);
    return { idWarna: id };
  });
}

async function remove(idParam, user) {
  const id = Number(idParam);
  if (!Number.isInteger(id)) throw httpError(400, "Id warna tidak valid.");
  try {
    return await withTx(async (tx) => {
      const cur = await new sql.Request(tx)
        .input("id", sql.Int, id)
        .query(`SELECT NamaWarna FROM MstWarna WHERE IdWarna = @id`);
      if (!cur.recordset.length) throw httpError(404, "Warna tidak ditemukan.");
      await new sql.Request(tx).input("id", sql.Int, id).query(`DELETE FROM MstWarna WHERE IdWarna = @id`);
      await audit(tx, user, `Menghapus Data Warna ${cur.recordset[0].NamaWarna} (Web)`);
      return { idWarna: id };
    });
  } catch (err) {
    if (err.number === 547 || err.originalError?.info?.number === 547) {
      throw httpError(409, "Warna masih dipakai pada data lain dan tidak dapat dihapus.");
    }
    throw err;
  }
}

module.exports = { getAll, create, update, remove };
