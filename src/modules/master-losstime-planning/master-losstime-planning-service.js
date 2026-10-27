const { sql, poolPromise } = require("../../core/config/db");

/* ============================================================
 * Paritas desktop: MstLoosTimePlaning.vb
 * Master mstLossTimePlanning (IdMesin, IdLossTimeFactor, Menit) —
 * kunci komposit IdMesin + IdLossTimeFactor. Update/hapus by komposit,
 * field yang diubah hanya Menit (sesuai VB).
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
  const idMesin = Number(data.idMesin);
  if (!Number.isInteger(idMesin) || idMesin <= 0) throw httpError(400, "Mesin harus dipilih.");
  const idFaktor = Number(data.idLossTimeFactor);
  if (!Number.isInteger(idFaktor) || idFaktor <= 0) throw httpError(400, "Loss time faktor harus dipilih.");
  const menit = data.menit === "" || data.menit === null || data.menit === undefined ? 0 : Number(data.menit);
  if (!Number.isInteger(menit) || menit < 0) throw httpError(400, "Menit harus berupa bilangan bulat 0 atau lebih.");
  return { idMesin, idFaktor, menit };
}

async function getAll() {
  const pool = await poolPromise;
  const rs = await pool.request().query(`
    SELECT p.IdMesin, m.NamaMesin, p.IdLossTimeFactor, f.LossTimeFactor, p.Menit
    FROM dbo.mstLossTimePlanning p
    LEFT JOIN dbo.MstMesin m ON m.IdMesin = p.IdMesin
    LEFT JOIN dbo.mstLossTimeFactor f ON f.IdLossTimeFactor = p.IdLossTimeFactor
    ORDER BY m.NamaMesin ASC, p.IdLossTimeFactor ASC
  `);
  return rs.recordset;
}

async function getOptions() {
  const pool = await poolPromise;
  const [mesin, faktor] = await Promise.all([
    pool
      .request()
      .query(`SELECT IdMesin, NamaMesin FROM dbo.MstMesin WHERE [Enable] = 1 ORDER BY NamaMesin ASC`),
    pool
      .request()
      .query(`SELECT IdLossTimeFactor, LossTimeFactor FROM dbo.mstLossTimeFactor ORDER BY IdLossTimeFactor ASC`),
  ]);
  return { mesin: mesin.recordset, faktor: faktor.recordset };
}

async function assertPairExists(transaction, idMesin, idFaktor) {
  const m = new sql.Request(transaction);
  m.input("id", sql.Int, idMesin);
  const mr = await m.query(`SELECT NamaMesin FROM dbo.MstMesin WHERE IdMesin = @id`);
  if (!mr.recordset.length) throw httpError(404, "Mesin tidak ditemukan.");
  const f = new sql.Request(transaction);
  f.input("id", sql.Int, idFaktor);
  const fr = await f.query(`SELECT LossTimeFactor FROM dbo.mstLossTimeFactor WHERE IdLossTimeFactor = @id`);
  if (!fr.recordset.length) throw httpError(404, "Loss time faktor tidak ditemukan.");
  return { nama: mr.recordset[0].NamaMesin, faktor: fr.recordset[0].LossTimeFactor };
}

async function create(data, user) {
  const v = validate(data);
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const ref = await assertPairExists(transaction, v.idMesin, v.idFaktor);

    const dup = new sql.Request(transaction);
    dup.input("idm", sql.Int, v.idMesin);
    dup.input("idf", sql.Int, v.idFaktor);
    const d = await dup.query(
      `SELECT TOP 1 1 AS dup FROM dbo.mstLossTimePlanning WHERE IdMesin = @idm AND IdLossTimeFactor = @idf`,
    );
    if (d.recordset.length) {
      throw httpError(409, `Planning untuk mesin "${ref.nama}" + faktor "${ref.faktor}" sudah ada.`);
    }

    const req = new sql.Request(transaction);
    req.input("idm", sql.Int, v.idMesin);
    req.input("idf", sql.Int, v.idFaktor);
    req.input("menit", sql.Int, v.menit);
    await req.query(
      `INSERT INTO dbo.mstLossTimePlanning (IdMesin, IdLossTimeFactor, Menit) VALUES (@idm, @idf, @menit)`,
    );
    await audit(transaction, user, `Menyimpan Loss Time Planning ${ref.nama} - ${ref.faktor} (Web)`);
    await transaction.commit();
    return { idMesin: v.idMesin, idLossTimeFactor: v.idFaktor };
  } catch (err) {
    try { await transaction.rollback(); } catch { /* ignore */ }
    throw err;
  }
}

async function update(data, user) {
  const v = validate(data);
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const ref = await assertPairExists(transaction, v.idMesin, v.idFaktor);
    const req = new sql.Request(transaction);
    req.input("idm", sql.Int, v.idMesin);
    req.input("idf", sql.Int, v.idFaktor);
    req.input("menit", sql.Int, v.menit);
    const r = await req.query(
      `UPDATE dbo.mstLossTimePlanning SET Menit = @menit
       WHERE IdMesin = @idm AND IdLossTimeFactor = @idf`,
    );
    if (!r.rowsAffected[0]) throw httpError(404, "Loss time planning tidak ditemukan.");
    await audit(transaction, user, `Mengubah Loss Time Planning ${ref.nama} - ${ref.faktor} menjadi ${v.menit} menit (Web)`);
    await transaction.commit();
    return { idMesin: v.idMesin, idLossTimeFactor: v.idFaktor };
  } catch (err) {
    try { await transaction.rollback(); } catch { /* ignore */ }
    throw err;
  }
}

async function remove(idMesin, idFaktor, user) {
  const idm = Number(idMesin);
  const idf = Number(idFaktor);
  if (!Number.isInteger(idm) || idm <= 0) throw httpError(400, "Id mesin tidak valid.");
  if (!Number.isInteger(idf) || idf <= 0) throw httpError(400, "Id loss time faktor tidak valid.");
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const c = new sql.Request(transaction);
    c.input("idm", sql.Int, idm);
    c.input("idf", sql.Int, idf);
    const cur = await c.query(`
      SELECT ISNULL(m.NamaMesin, '(mesin terhapus)') AS NamaMesin, ISNULL(f.LossTimeFactor, '(faktor terhapus)') AS Faktor
      FROM dbo.mstLossTimePlanning p
      LEFT JOIN dbo.MstMesin m ON m.IdMesin = p.IdMesin
      LEFT JOIN dbo.mstLossTimeFactor f ON f.IdLossTimeFactor = p.IdLossTimeFactor
      WHERE p.IdMesin = @idm AND p.IdLossTimeFactor = @idf
    `);
    if (!cur.recordset.length) throw httpError(404, "Loss time planning tidak ditemukan.");

    const d = new sql.Request(transaction);
    d.input("idm", sql.Int, idm);
    d.input("idf", sql.Int, idf);
    await d.query(`DELETE FROM dbo.mstLossTimePlanning WHERE IdMesin = @idm AND IdLossTimeFactor = @idf`);
    await audit(transaction, user, `Menghapus Loss Time Planning ${cur.recordset[0].NamaMesin} - ${cur.recordset[0].Faktor} (Web)`);
    await transaction.commit();
    return { idMesin: idm, idLossTimeFactor: idf };
  } catch (err) {
    try { await transaction.rollback(); } catch { /* ignore */ }
    throw err;
  }
}

module.exports = { getAll, getOptions, create, update, remove };
