const { sql, poolPromise } = require("../../core/config/db");

/* ============================================================
 * Paritas desktop: FrmMstTargetKayuBulat.vb
 * Master MstTargetKayuBulat (IdTargetGroupingKayu, Periode [tgl-1
 * bulan], TargetTon) — kunci komposit IdTargetGroupingKayu + Periode.
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

/** Terima "YYYY-MM" / "YYYY-MM-DD" / Date → "YYYY-MM-01" (tanggal-1 bulan). */
function normalizePeriode(v) {
  const s = v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? "").trim();
  const m = s.match(/^(\d{4})-(\d{2})/);
  if (!m) throw httpError(400, "Periode harus format YYYY-MM.");
  const month = Number(m[2]);
  if (month < 1 || month > 12) throw httpError(400, "Bulan periode tidak valid.");
  return `${m[1]}-${m[2]}-01`;
}

function validate(data) {
  const id = Number(data.idTargetGroupingKayu);
  if (!Number.isInteger(id) || id <= 0) throw httpError(400, "Group target harus dipilih.");
  const periode = normalizePeriode(data.periode);
  const target = Number(data.targetTon);
  if (!Number.isFinite(target) || target < 0) throw httpError(400, "Target (ton) harus berupa angka 0 atau lebih.");
  return { id, periode, target };
}

async function getAll() {
  const pool = await poolPromise;
  const rs = await pool.request().query(`
    SELECT t.IdTargetGroupingKayu, ISNULL(h.NamaGroup, '(group terhapus)') AS NamaGroup,
           t.Periode, t.TargetTon
    FROM dbo.MstTargetKayuBulat t
    LEFT JOIN dbo.MstTargetGroupingKayu_h h ON h.IdTargetGroupingKayu = t.IdTargetGroupingKayu
    ORDER BY h.NamaGroup ASC, t.Periode DESC
  `);
  return rs.recordset;
}

async function getGroupingOptions() {
  const pool = await poolPromise;
  const rs = await pool
    .request()
    .query(
      `SELECT IdTargetGroupingKayu AS id, NamaGroup FROM dbo.MstTargetGroupingKayu_h
       WHERE [Enable] = 1 ORDER BY NamaGroup ASC`,
    );
  return rs.recordset;
}

async function create(data, user) {
  const v = validate(data);
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const g = new sql.Request(transaction);
    g.input("id", sql.Int, v.id);
    const grp = await g.query(`SELECT NamaGroup FROM dbo.MstTargetGroupingKayu_h WHERE IdTargetGroupingKayu = @id`);
    if (!grp.recordset.length) throw httpError(404, "Group target tidak ditemukan.");

    const dup = new sql.Request(transaction);
    dup.input("id", sql.Int, v.id);
    dup.input("tgl", sql.Date, v.periode);
    const d = await dup.query(
      `SELECT TOP 1 1 AS dup FROM dbo.MstTargetKayuBulat WHERE IdTargetGroupingKayu = @id AND Periode = @tgl`,
    );
    if (d.recordset.length) throw httpError(409, `Target ${grp.recordset[0].NamaGroup} periode ${v.periode.slice(0, 7)} sudah ada.`);

    const req = new sql.Request(transaction);
    req.input("id", sql.Int, v.id);
    req.input("tgl", sql.Date, v.periode);
    req.input("target", sql.Float, v.target);
    await req.query(
      `INSERT INTO dbo.MstTargetKayuBulat (IdTargetGroupingKayu, Periode, TargetTon) VALUES (@id, @tgl, @target)`,
    );
    await audit(transaction, user, `Menyimpan Target Kayu Bulat ${grp.recordset[0].NamaGroup} ${v.periode.slice(0, 7)} (Web)`);
    await transaction.commit();
    return { id: v.id, periode: v.periode };
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
    const req = new sql.Request(transaction);
    req.input("id", sql.Int, v.id);
    req.input("tgl", sql.Date, v.periode);
    req.input("target", sql.Float, v.target);
    const r = await req.query(
      `UPDATE dbo.MstTargetKayuBulat SET TargetTon = @target
       WHERE IdTargetGroupingKayu = @id AND Periode = @tgl`,
    );
    if (!r.rowsAffected[0]) throw httpError(404, "Data target tidak ditemukan.");
    await audit(transaction, user, `Mengubah Target Kayu Bulat id ${v.id} ${v.periode.slice(0, 7)} (Web)`);
    await transaction.commit();
    return { id: v.id, periode: v.periode };
  } catch (err) {
    try { await transaction.rollback(); } catch { /* ignore */ }
    throw err;
  }
}

async function remove(id, periode, user) {
  const idNum = Number(id);
  if (!Number.isInteger(idNum) || idNum <= 0) throw httpError(400, "Id group tidak valid.");
  const tgl = normalizePeriode(periode);
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const c = new sql.Request(transaction);
    c.input("id", sql.Int, idNum);
    c.input("tgl", sql.Date, tgl);
    const cur = await c.query(`
      SELECT ISNULL(h.NamaGroup, '(group terhapus)') AS NamaGroup
      FROM dbo.MstTargetKayuBulat t
      LEFT JOIN dbo.MstTargetGroupingKayu_h h ON h.IdTargetGroupingKayu = t.IdTargetGroupingKayu
      WHERE t.IdTargetGroupingKayu = @id AND t.Periode = @tgl
    `);
    if (!cur.recordset.length) throw httpError(404, "Data target tidak ditemukan.");

    const d = new sql.Request(transaction);
    d.input("id", sql.Int, idNum);
    d.input("tgl", sql.Date, tgl);
    await d.query(`DELETE FROM dbo.MstTargetKayuBulat WHERE IdTargetGroupingKayu = @id AND Periode = @tgl`);
    await audit(transaction, user, `Menghapus Target Kayu Bulat ${cur.recordset[0].NamaGroup} ${tgl.slice(0, 7)} (Web)`);
    await transaction.commit();
    return { id: idNum, periode: tgl };
  } catch (err) {
    try { await transaction.rollback(); } catch { /* ignore */ }
    throw err;
  }
}

module.exports = { getAll, getGroupingOptions, create, update, remove };
