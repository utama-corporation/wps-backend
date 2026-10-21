const { sql, poolPromise } = require("../../core/config/db");

/* ============================================================
 * Paritas desktop: FrmSupplierGroupKayu.vb
 * Relasi MstSupplierGroupKayu (IdSupplier, IdGroupJenisKayu, IsTopSupplier).
 * Kunci = pasangan (IdSupplier, IdGroupJenisKayu). Yang bisa diubah hanya IsTopSupplier.
 * Setiap perubahan dicatat ke Riwayat.
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

const bit = (v) => (v === true || v === 1 || v === "1" || v === "true" ? 1 : 0);

function toId(v, label) {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw httpError(400, `${label} harus dipilih.`);
  return n;
}

/** Nama supplier + group untuk pesan riwayat; null bila salah satunya tidak ada. */
async function lookupNames(transaction, idSupplier, idGroup) {
  const r = new sql.Request(transaction);
  r.input("s", sql.Int, idSupplier);
  r.input("g", sql.Int, idGroup);
  const rs = await r.query(`
    SELECT (SELECT NmSupplier FROM dbo.MstSupplier WHERE IdSupplier = @s) AS Supplier,
           (SELECT [Group] FROM dbo.MstGroupJenisKayu WHERE IdGroup = @g) AS GroupName
  `);
  return rs.recordset[0];
}

async function getAll() {
  const pool = await poolPromise;
  const rs = await pool.request().query(`
    SELECT A.IdSupplier, B.NmSupplier, A.IdGroupJenisKayu AS IdGroup, C.[Group] AS NamaGroup,
           CAST(ISNULL(A.IsTopSupplier, 0) AS bit) AS IsTopSupplier
    FROM dbo.MstSupplierGroupKayu A
    INNER JOIN dbo.MstSupplier B ON B.IdSupplier = A.IdSupplier
    INNER JOIN dbo.MstGroupJenisKayu C ON C.IdGroup = A.IdGroupJenisKayu
    ORDER BY B.NmSupplier ASC, C.[Group] ASC
  `);
  return rs.recordset;
}

/** Pilihan dropdown: hanya supplier / group yang aktif (seperti VB). */
async function getOptions() {
  const pool = await poolPromise;
  const [suppliers, groups] = await Promise.all([
    pool.request().query(`
      SELECT IdSupplier, NmSupplier FROM dbo.MstSupplier WHERE [Enable] = 1 ORDER BY NmSupplier ASC
    `),
    pool.request().query(`
      SELECT IdGroup, [Group] AS NamaGroup FROM dbo.MstGroupJenisKayu WHERE [Enable] = 1 ORDER BY [Group] ASC
    `),
  ]);
  return { suppliers: suppliers.recordset, groups: groups.recordset };
}

async function create(data, user) {
  const idSupplier = toId(data.idSupplier, "Supplier");
  const idGroup = toId(data.idGroup, "Group jenis kayu");
  const isTop = bit(data.isTop);
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const names = await lookupNames(transaction, idSupplier, idGroup);
    if (!names.Supplier) throw httpError(400, "Supplier tidak ditemukan.");
    if (!names.GroupName) throw httpError(400, "Group jenis kayu tidak ditemukan.");

    const d = new sql.Request(transaction);
    d.input("s", sql.Int, idSupplier);
    d.input("g", sql.Int, idGroup);
    const dup = await d.query(
      `SELECT TOP 1 1 AS dup FROM dbo.MstSupplierGroupKayu WHERE IdSupplier = @s AND IdGroupJenisKayu = @g`,
    );
    if (dup.recordset.length) {
      throw httpError(409, `Supplier "${names.Supplier}" sudah terdaftar pada group "${names.GroupName}".`);
    }

    const req = new sql.Request(transaction);
    req.input("s", sql.Int, idSupplier);
    req.input("g", sql.Int, idGroup);
    req.input("top", sql.Bit, isTop);
    await req.query(`
      INSERT INTO dbo.MstSupplierGroupKayu (IdSupplier, IdGroupJenisKayu, IsTopSupplier)
      VALUES (@s, @g, @top)
    `);
    await audit(
      transaction,
      user,
      `Menyimpan Data Supplier Group Kayu ${names.Supplier} - ${names.GroupName} (${isTop ? "TOP" : "OTHER"}) (Web)`,
    );
    await transaction.commit();
    return { idSupplier, idGroup };
  } catch (err) {
    try { await transaction.rollback(); } catch { /* ignore */ }
    throw err;
  }
}

async function update(idSupplierRaw, idGroupRaw, data, user) {
  const idSupplier = toId(idSupplierRaw, "Supplier");
  const idGroup = toId(idGroupRaw, "Group jenis kayu");
  const isTop = bit(data.isTop);
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const names = await lookupNames(transaction, idSupplier, idGroup);
    const req = new sql.Request(transaction);
    req.input("s", sql.Int, idSupplier);
    req.input("g", sql.Int, idGroup);
    req.input("top", sql.Bit, isTop);
    const r = await req.query(`
      UPDATE dbo.MstSupplierGroupKayu SET IsTopSupplier = @top
      WHERE IdSupplier = @s AND IdGroupJenisKayu = @g
    `);
    if (!r.rowsAffected[0]) throw httpError(404, "Data supplier group kayu tidak ditemukan.");
    await audit(
      transaction,
      user,
      `Mengubah Data Supplier Group Kayu ${names.Supplier} - ${names.GroupName} (${isTop ? "TOP" : "OTHER"}) (Web)`,
    );
    await transaction.commit();
    return { idSupplier, idGroup };
  } catch (err) {
    try { await transaction.rollback(); } catch { /* ignore */ }
    throw err;
  }
}

async function remove(idSupplierRaw, idGroupRaw, user) {
  const idSupplier = toId(idSupplierRaw, "Supplier");
  const idGroup = toId(idGroupRaw, "Group jenis kayu");
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const names = await lookupNames(transaction, idSupplier, idGroup);
    const req = new sql.Request(transaction);
    req.input("s", sql.Int, idSupplier);
    req.input("g", sql.Int, idGroup);
    const r = await req.query(`
      DELETE FROM dbo.MstSupplierGroupKayu WHERE IdSupplier = @s AND IdGroupJenisKayu = @g
    `);
    if (!r.rowsAffected[0]) throw httpError(404, "Data supplier group kayu tidak ditemukan.");
    await audit(transaction, user, `Menghapus Data Supplier Group Kayu ${names.Supplier} - ${names.GroupName} (Web)`);
    await transaction.commit();
    return { idSupplier, idGroup };
  } catch (err) {
    try { await transaction.rollback(); } catch { /* ignore */ }
    throw err;
  }
}

module.exports = { getAll, getOptions, create, update, remove };
