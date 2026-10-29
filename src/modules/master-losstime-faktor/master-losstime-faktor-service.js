const { sql, poolPromise } = require("../../core/config/db");

/* ============================================================
 * Paritas desktop: MstLossTimeFaktor.vb
 * Master mstLossTimeFactor (IdLossTimeFactor, LossTimeFactor
 * varchar(20) — teks faktor, mis. "Loss Awal", "Sebelum Istirahat").
 * Id = MAX + 1 (bukan identity).
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
  const faktor = String(data.lossTimeFactor ?? "").trim();
  if (!faktor) throw httpError(400, "Loss time factor harus diisi.");
  if (faktor.length > 20) throw httpError(400, "Loss time factor maksimal 20 karakter.");
  return { faktor };
}

async function getAll() {
  const pool = await poolPromise;
  const rs = await pool
    .request()
    .query(`
      SELECT f.IdLossTimeFactor, f.LossTimeFactor,
             (SELECT COUNT(*) FROM dbo.mstLossTimePlanning p WHERE p.IdLossTimeFactor = f.IdLossTimeFactor) AS JumlahPlanning
      FROM dbo.mstLossTimeFactor f
      ORDER BY f.IdLossTimeFactor ASC
    `);
  return rs.recordset;
}

async function create(data, user) {
  const v = validate(data);
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const dup = new sql.Request(transaction);
    dup.input("f", sql.VarChar(20), v.faktor);
    const d = await dup.query(
      `SELECT TOP 1 1 AS dup FROM dbo.mstLossTimeFactor WHERE LTRIM(RTRIM(LossTimeFactor)) = @f`,
    );
    if (d.recordset.length) throw httpError(409, `Loss time factor "${v.faktor}" sudah ada.`);

    const m = await new sql.Request(transaction).query(
      `SELECT ISNULL(MAX(IdLossTimeFactor), 0) + 1 AS NextId
       FROM dbo.mstLossTimeFactor WITH (UPDLOCK, HOLDLOCK)`,
    );
    const id = m.recordset[0].NextId;

    const req = new sql.Request(transaction);
    req.input("id", sql.Int, id);
    req.input("f", sql.VarChar(20), v.faktor);
    await req.query(`INSERT INTO dbo.mstLossTimeFactor (IdLossTimeFactor, LossTimeFactor) VALUES (@id, @f)`);
    await audit(transaction, user, `Menyimpan Data Master Loss Time Faktor ${v.faktor} (Web)`);
    await transaction.commit();
    return { id };
  } catch (err) {
    try { await transaction.rollback(); } catch { /* ignore */ }
    throw err;
  }
}

async function update(id, data, user) {
  const idNum = Number(id);
  if (!Number.isInteger(idNum)) throw httpError(400, "Id tidak valid.");
  const v = validate(data);
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const c = new sql.Request(transaction);
    c.input("id", sql.Int, idNum);
    const cur = await c.query(`SELECT LossTimeFactor FROM dbo.mstLossTimeFactor WHERE IdLossTimeFactor = @id`);
    if (!cur.recordset.length) throw httpError(404, "Loss time factor tidak ditemukan.");
    if (String(cur.recordset[0].LossTimeFactor ?? "").trim().toLowerCase() !== v.faktor.toLowerCase()) {
      const dup = new sql.Request(transaction);
      dup.input("f", sql.VarChar(20), v.faktor);
      dup.input("id", sql.Int, idNum);
      const d = await dup.query(
        `SELECT TOP 1 1 AS dup FROM dbo.mstLossTimeFactor
         WHERE LTRIM(RTRIM(LossTimeFactor)) = @f AND IdLossTimeFactor <> @id`,
      );
      if (d.recordset.length) throw httpError(409, `Loss time factor "${v.faktor}" sudah ada.`);
    }

    const req = new sql.Request(transaction);
    req.input("id", sql.Int, idNum);
    req.input("f", sql.VarChar(20), v.faktor);
    await req.query(`UPDATE dbo.mstLossTimeFactor SET LossTimeFactor = @f WHERE IdLossTimeFactor = @id`);
    await audit(transaction, user, `Mengubah Data Master Loss Time Faktor ${v.faktor} (Web)`);
    await transaction.commit();
    return { id: idNum };
  } catch (err) {
    try { await transaction.rollback(); } catch { /* ignore */ }
    throw err;
  }
}

async function remove(id, user) {
  const idNum = Number(id);
  if (!Number.isInteger(idNum)) throw httpError(400, "Id tidak valid.");
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const c = new sql.Request(transaction);
    c.input("id", sql.Int, idNum);
    const cur = await c.query(`
      SELECT f.LossTimeFactor,
             (SELECT COUNT(*) FROM dbo.mstLossTimePlanning p WHERE p.IdLossTimeFactor = f.IdLossTimeFactor) AS JumlahPlanning
      FROM dbo.mstLossTimeFactor f WHERE f.IdLossTimeFactor = @id
    `);
    if (!cur.recordset.length) throw httpError(404, "Loss time factor tidak ditemukan.");
    if (cur.recordset[0].JumlahPlanning > 0) {
      throw httpError(
        409,
        `Faktor "${cur.recordset[0].LossTimeFactor}" masih dipakai ${cur.recordset[0].JumlahPlanning} baris Losstime Planning dan tidak dapat dihapus.`,
      );
    }

    const d = new sql.Request(transaction);
    d.input("id", sql.Int, idNum);
    await d.query(`DELETE FROM dbo.mstLossTimeFactor WHERE IdLossTimeFactor = @id`);
    await audit(transaction, user, `Menghapus Data Master Loss Time Faktor ${cur.recordset[0].LossTimeFactor} (Web)`);
    await transaction.commit();
    return { id: idNum };
  } catch (err) {
    try { await transaction.rollback(); } catch { /* ignore */ }
    throw err;
  }
}

module.exports = { getAll, create, update, remove };
