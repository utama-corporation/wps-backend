const { sql, poolPromise } = require("../../core/config/db");

/* ============================================================
 * Paritas desktop: FrmMstBarangJadi.vb ("Data Master Barang Jadi")
 * MstBarangJadi (IdBarangJadi = MAX + 1, bukan identity;
 * NamaBarangJadi nvarchar(30); TipeBarangJadi nvarchar(30); Enable bit).
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
  const nama = str(data.namaBarangJadi);
  const tipe = str(data.tipeBarangJadi);
  if (!nama) throw httpError(400, "Nama barang jadi harus diisi.");
  if (nama.length > 30) throw httpError(400, "Nama barang jadi maksimal 30 karakter.");
  if (tipe.length > 30) throw httpError(400, "Tipe barang jadi maksimal 30 karakter.");
  return { nama, tipe: tipe || null, enable: bit(data.enable) };
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
    .input("n", sql.NVarChar(30), nama)
    .input("id", sql.Int, exceptId ?? 0)
    .query(`SELECT TOP 1 1 AS dup FROM MstBarangJadi WHERE NamaBarangJadi = @n AND IdBarangJadi <> @id`);
  if (r.recordset.length) throw httpError(409, `Barang jadi "${nama}" sudah ada.`);
}

async function getAll() {
  const pool = await poolPromise;
  const rs = await pool.request().query(`
    SELECT IdBarangJadi, NamaBarangJadi, TipeBarangJadi, CAST(ISNULL([Enable], 0) AS bit) AS [Enable]
    FROM MstBarangJadi
    ORDER BY IdBarangJadi ASC
  `);
  return rs.recordset;
}

async function create(data, user) {
  const v = validate(data);
  return withTx(async (tx) => {
    await assertUnique(tx, v.nama, null);
    const m = await new sql.Request(tx).query(
      `SELECT ISNULL(MAX(IdBarangJadi), 0) + 1 AS NextId FROM MstBarangJadi WITH (UPDLOCK, HOLDLOCK)`,
    );
    const id = m.recordset[0].NextId;
    await new sql.Request(tx)
      .input("id", sql.Int, id)
      .input("n", sql.NVarChar(30), v.nama)
      .input("t", sql.NVarChar(30), v.tipe)
      .input("e", sql.Bit, v.enable)
      .query(`INSERT INTO MstBarangJadi (IdBarangJadi, NamaBarangJadi, TipeBarangJadi, [Enable]) VALUES (@id, @n, @t, @e)`);
    await audit(tx, user, `Menyimpan Data Master Barang Jadi ${v.nama} (Web)`);
    return { idBarangJadi: id };
  });
}

async function update(idParam, data, user) {
  const id = Number(idParam);
  if (!Number.isInteger(id)) throw httpError(400, "Id barang jadi tidak valid.");
  const v = validate(data);
  return withTx(async (tx) => {
    await assertUnique(tx, v.nama, id);
    const r = await new sql.Request(tx)
      .input("id", sql.Int, id)
      .input("n", sql.NVarChar(30), v.nama)
      .input("t", sql.NVarChar(30), v.tipe)
      .input("e", sql.Bit, v.enable)
      .query(`UPDATE MstBarangJadi SET NamaBarangJadi = @n, TipeBarangJadi = @t, [Enable] = @e WHERE IdBarangJadi = @id`);
    if (!r.rowsAffected[0]) throw httpError(404, "Barang jadi tidak ditemukan.");
    await audit(tx, user, `Mengubah Data Master Barang Jadi ${v.nama} (Web)`);
    return { idBarangJadi: id };
  });
}

async function remove(idParam, user) {
  const id = Number(idParam);
  if (!Number.isInteger(id)) throw httpError(400, "Id barang jadi tidak valid.");
  try {
    return await withTx(async (tx) => {
      const cur = await new sql.Request(tx)
        .input("id", sql.Int, id)
        .query(`SELECT NamaBarangJadi FROM MstBarangJadi WHERE IdBarangJadi = @id`);
      if (!cur.recordset.length) throw httpError(404, "Barang jadi tidak ditemukan.");
      await new sql.Request(tx).input("id", sql.Int, id).query(`DELETE FROM MstBarangJadi WHERE IdBarangJadi = @id`);
      await audit(tx, user, `Menghapus Data Master Barang Jadi ${cur.recordset[0].NamaBarangJadi} (Web)`);
      return { idBarangJadi: id };
    });
  } catch (err) {
    if (err.number === 547 || err.originalError?.info?.number === 547) {
      throw httpError(409, "Barang jadi masih dipakai pada data lain dan tidak dapat dihapus. Ubah statusnya menjadi TIDAK AKTIF sebagai gantinya.");
    }
    throw err;
  }
}

module.exports = { getAll, create, update, remove };
