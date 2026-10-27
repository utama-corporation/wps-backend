const { sql, poolPromise } = require("../../core/config/db");

/* ============================================================
 * Paritas desktop: FrmTblHoliday.vb
 * Master Holiday (Tgl [date], Keterangan varchar(50)) — daftar per
 * tahun, insert by tanggal, update/hapus Keterangan & baris by Tgl.
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

/** "YYYY-MM-DD" valid → string itu; selain itu400. */
function normalizeTgl(v) {
  const s = String(v ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw httpError(400, "Tanggal harus format YYYY-MM-DD.");
  const d = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) throw httpError(400, "Tanggal tidak valid.");
  return s;
}

function validateKet(v, required) {
  const ket = String(v ?? "").trim();
  if (required && !ket) throw httpError(400, "Keterangan harus diisi.");
  if (ket.length > 50) throw httpError(400, "Keterangan maksimal 50 karakter.");
  return ket;
}

async function getAll(tahun) {
  const t = Number(tahun) || new Date().getFullYear();
  if (!Number.isInteger(t) || t < 1970 || t > 9999) throw httpError(400, "Tahun tidak valid.");
  const pool = await poolPromise;
  const req = pool.request();
  req.input("thn", sql.Int, t);
  const rs = await req.query(`
    SELECT Tgl, Keterangan FROM dbo.Holiday
    WHERE YEAR(Tgl) = @thn
    ORDER BY Tgl ASC
  `);
  return rs.recordset;
}

async function create(data, user) {
  const tgl = normalizeTgl(data.tgl);
  const ket = validateKet(data.keterangan, true);
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const dup = new sql.Request(transaction);
    dup.input("tgl", sql.Date, tgl);
    const d = await dup.query(`SELECT TOP 1 1 AS dup FROM dbo.Holiday WHERE Tgl = @tgl`);
    if (d.recordset.length) throw httpError(409, `Holiday tanggal ${tgl} sudah ada.`);

    const req = new sql.Request(transaction);
    req.input("tgl", sql.Date, tgl);
    req.input("ket", sql.VarChar(50), ket);
    await req.query(`INSERT INTO dbo.Holiday (Tgl, Keterangan) VALUES (@tgl, @ket)`);
    await audit(transaction, user, `Menyimpan Holiday ${tgl} - ${ket} (Web)`);
    await transaction.commit();
    return { tgl };
  } catch (err) {
    try { await transaction.rollback(); } catch { /* ignore */ }
    throw err;
  }
}

async function update(tglParam, data, user) {
  const tgl = normalizeTgl(tglParam);
  const ket = validateKet(data.keterangan, true);
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const req = new sql.Request(transaction);
    req.input("tgl", sql.Date, tgl);
    req.input("ket", sql.VarChar(50), ket);
    const r = await req.query(`UPDATE dbo.Holiday SET Keterangan = @ket WHERE Tgl = @tgl`);
    if (!r.rowsAffected[0]) throw httpError(404, `Holiday tanggal ${tgl} tidak ditemukan.`);
    await audit(transaction, user, `Mengubah Holiday ${tgl} menjadi ${ket} (Web)`);
    await transaction.commit();
    return { tgl };
  } catch (err) {
    try { await transaction.rollback(); } catch { /* ignore */ }
    throw err;
  }
}

async function remove(tglParam, user) {
  const tgl = normalizeTgl(tglParam);
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const c = new sql.Request(transaction);
    c.input("tgl", sql.Date, tgl);
    const cur = await c.query(`SELECT Keterangan FROM dbo.Holiday WHERE Tgl = @tgl`);
    if (!cur.recordset.length) throw httpError(404, `Holiday tanggal ${tgl} tidak ditemukan.`);

    const d = new sql.Request(transaction);
    d.input("tgl", sql.Date, tgl);
    await d.query(`DELETE FROM dbo.Holiday WHERE Tgl = @tgl`);
    await audit(transaction, user, `Menghapus Holiday ${tgl} - ${cur.recordset[0].Keterangan} (Web)`);
    await transaction.commit();
    return { tgl };
  } catch (err) {
    try { await transaction.rollback(); } catch { /* ignore */ }
    throw err;
  }
}

module.exports = { getAll, create, update, remove };
