const { sql, poolPromise } = require("../../core/config/db");

/* ============================================================
 * Paritas desktop: FrmMstUOM.vb
 * Master MstUOM (IdUOM, UOM, Enable).
 * Status tampil AKTIF / TIDAK AKTIF dari bit Enable.
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

function validate(data) {
  const uom = String(data.uom ?? "").trim();
  if (!uom) throw httpError(400, "UOM harus diisi.");
  return { uom: uom.slice(0, 13), enable: bit(data.enable) };
}

async function getAll() {
  const pool = await poolPromise;
  const rs = await pool.request().query(`
    SELECT IdUOM, UOM, [Enable]
    FROM dbo.MstUOM
    ORDER BY IdUOM ASC
  `);
  return rs.recordset;
}

async function create(data, user) {
  const v = validate(data);
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    // IdUOM adalah IDENTITY — jangan ikut di-INSERT.
    const req = new sql.Request(transaction);
    req.input("uom", sql.NVarChar(13), v.uom);
    req.input("enable", sql.Bit, v.enable);
    const ins = await req.query(`
      INSERT INTO dbo.MstUOM (UOM, [Enable])
      OUTPUT INSERTED.IdUOM
      VALUES (@uom, @enable)
    `);
    const id = ins.recordset[0].IdUOM;
    await audit(transaction, user, `Menyimpan Data UOM ${v.uom} Pada Data Master UOM (Web)`);
    await transaction.commit();
    return { idUOM: id };
  } catch (err) {
    try { await transaction.rollback(); } catch { /* ignore */ }
    throw mapSqlError(err);
  }
}

async function update(id, data, user) {
  const idNum = Number(id);
  if (!Number.isInteger(idNum)) throw httpError(400, "Id UOM tidak valid.");
  const v = validate(data);
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const c = new sql.Request(transaction);
    c.input("id", sql.Int, idNum);
    const cur = await c.query(`SELECT UOM FROM dbo.MstUOM WHERE IdUOM = @id`);
    if (!cur.recordset.length) throw httpError(404, "UOM tidak ditemukan.");

    const req = new sql.Request(transaction);
    req.input("id", sql.Int, idNum);
    req.input("uom", sql.NVarChar(13), v.uom);
    req.input("enable", sql.Bit, v.enable);
    await req.query(`UPDATE dbo.MstUOM SET UOM = @uom, [Enable] = @enable WHERE IdUOM = @id`);
    await audit(transaction, user, `Mengubah Data UOM ${v.uom} Pada Data Master UOM (Web)`);
    await transaction.commit();
    return { idUOM: idNum };
  } catch (err) {
    try { await transaction.rollback(); } catch { /* ignore */ }
    throw mapSqlError(err);
  }
}

async function remove(id, user) {
  const idNum = Number(id);
  if (!Number.isInteger(idNum)) throw httpError(400, "Id UOM tidak valid.");
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const c = new sql.Request(transaction);
    c.input("id", sql.Int, idNum);
    const cur = await c.query(`SELECT UOM FROM dbo.MstUOM WHERE IdUOM = @id`);
    if (!cur.recordset.length) throw httpError(404, "UOM tidak ditemukan.");

    const req = new sql.Request(transaction);
    req.input("id", sql.Int, idNum);
    await req.query(`DELETE FROM dbo.MstUOM WHERE IdUOM = @id`);
    await audit(transaction, user, `Menghapus Data UOM ${cur.recordset[0].UOM} Pada Data Master UOM (Web)`);
    await transaction.commit();
    return { idUOM: idNum };
  } catch (err) {
    try { await transaction.rollback(); } catch { /* ignore */ }
    if (err.number === 547 || err.originalError?.info?.number === 547) {
      throw httpError(409, "UOM sudah dipakai pada data lain dan tidak dapat dihapus. Ubah statusnya menjadi TIDAK AKTIF sebagai gantinya.");
    }
    throw err;
  }
}

function mapSqlError(err) {
  const n = err.number ?? err.originalError?.info?.number;
  if (n === 2628 || n === 8152) {
    return httpError(400, "Data terlalu panjang untuk disimpan. Persingkat UOM.");
  }
  return err;
}

module.exports = { getAll, create, update, remove };
