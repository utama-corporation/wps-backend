const { sql, poolPromise } = require("../../core/config/db");

/* ============================================================
 * Paritas desktop: FrmMstSupplierIntelOtherSupplier.vb
 * Master MstSupplierIntelOtherSupplier (IdOtherSupplier, NamaSupplier, Phone).
 * IdOtherSupplier = MAX + 1. Hapus dicek dulu ke SupplierIntel.
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

function validate(data) {
  const nama = String(data.nama ?? "").trim();
  const phone = String(data.phone ?? "").trim();
  if (!nama) throw httpError(400, "Nama supplier harus diisi.");
  return { nama: nama.slice(0, 50), phone: phone.slice(0, 20) };
}

function bindFields(req, v) {
  req.input("nama", sql.VarChar(50), v.nama);
  req.input("phone", sql.VarChar(20), v.phone);
}

async function getAll() {
  const pool = await poolPromise;
  const rs = await pool.request().query(`
    SELECT IdOtherSupplier, NamaSupplier, Phone
    FROM dbo.MstSupplierIntelOtherSupplier
    ORDER BY NamaSupplier ASC
  `);
  return rs.recordset;
}

async function create(data, user) {
  const v = validate(data);
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const m = await new sql.Request(transaction).query(
      `SELECT ISNULL(MAX(IdOtherSupplier), 0) + 1 AS NextId FROM dbo.MstSupplierIntelOtherSupplier WITH (UPDLOCK, HOLDLOCK)`,
    );
    const id = m.recordset[0].NextId;

    const req = new sql.Request(transaction);
    req.input("id", sql.Int, id);
    bindFields(req, v);
    await req.query(`
      INSERT INTO dbo.MstSupplierIntelOtherSupplier (IdOtherSupplier, NamaSupplier, Phone)
      VALUES (@id, @nama, @phone)
    `);
    await audit(transaction, user, `Menyimpan Data Other Supplier ${v.nama} Pada Data Master Other Supplier (Web)`);
    await transaction.commit();
    return { idOtherSupplier: id };
  } catch (err) {
    try { await transaction.rollback(); } catch { /* ignore */ }
    throw mapSqlError(err);
  }
}

async function update(id, data, user) {
  const idNum = Number(id);
  if (!Number.isInteger(idNum)) throw httpError(400, "Id other supplier tidak valid.");
  const v = validate(data);
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const c = new sql.Request(transaction);
    c.input("id", sql.Int, idNum);
    const cur = await c.query(`SELECT NamaSupplier FROM dbo.MstSupplierIntelOtherSupplier WHERE IdOtherSupplier = @id`);
    if (!cur.recordset.length) throw httpError(404, "Other supplier tidak ditemukan.");

    const req = new sql.Request(transaction);
    req.input("id", sql.Int, idNum);
    bindFields(req, v);
    await req.query(`
      UPDATE dbo.MstSupplierIntelOtherSupplier
      SET NamaSupplier = @nama, Phone = @phone
      WHERE IdOtherSupplier = @id
    `);
    await audit(transaction, user, `Mengubah Data Other Supplier ${v.nama} Pada Data Master Other Supplier (Web)`);
    await transaction.commit();
    return { idOtherSupplier: idNum };
  } catch (err) {
    try { await transaction.rollback(); } catch { /* ignore */ }
    throw mapSqlError(err);
  }
}

async function remove(id, user) {
  const idNum = Number(id);
  if (!Number.isInteger(idNum)) throw httpError(400, "Id other supplier tidak valid.");
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const c = new sql.Request(transaction);
    c.input("id", sql.Int, idNum);
    const cur = await c.query(`SELECT NamaSupplier FROM dbo.MstSupplierIntelOtherSupplier WHERE IdOtherSupplier = @id`);
    if (!cur.recordset.length) throw httpError(404, "Other supplier tidak ditemukan.");

    // Cek dipakai di SupplierIntel (paritas vb).
    const chk = new sql.Request(transaction);
    chk.input("id", sql.Int, idNum);
    const used = await chk.query(`SELECT COUNT(*) AS n FROM dbo.SupplierIntel WHERE IdOtherSupplier = @id`);
    if (Number(used.recordset[0].n) > 0) {
      throw httpError(409, "Other supplier tidak dapat dihapus karena sedang digunakan di transaksi Supplier Intel.");
    }

    const req = new sql.Request(transaction);
    req.input("id", sql.Int, idNum);
    await req.query(`DELETE FROM dbo.MstSupplierIntelOtherSupplier WHERE IdOtherSupplier = @id`);
    await audit(transaction, user, `Menghapus Data Other Supplier ${cur.recordset[0].NamaSupplier} Pada Data Master Other Supplier (Web)`);
    await transaction.commit();
    return { idOtherSupplier: idNum };
  } catch (err) {
    try { await transaction.rollback(); } catch { /* ignore */ }
    throw err;
  }
}

function mapSqlError(err) {
  const n = err.number ?? err.originalError?.info?.number;
  if (n === 2628 || n === 8152) {
    return httpError(400, "Data terlalu panjang untuk disimpan. Persingkat nama atau telepon.");
  }
  return err;
}

module.exports = { getAll, create, update, remove };
