const { sql, poolPromise } = require("../../core/config/db");

/* ============================================================
 * Paritas desktop: FrmTargetGroupingKayu.vb
 * Master MstTargetGroupingKayu_h (IdTargetGroupingKayu, NamaGroup,
 * Enable) + detail MstTargetGroupingKayu_d (IdGroup → MstGroupJenisKayu).
 * Id = MAX + 1 (bukan identity). Simpan/hapus detail = delete + insert ulang.
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
  const nama = String(data.namaGroup ?? "").trim();
  if (!nama) throw httpError(400, "Nama group harus diisi.");
  if (nama.length > 50) throw httpError(400, "Nama group maksimal 50 karakter.");
  const raw = Array.isArray(data.idGroups) ? data.idGroups : [];
  const idGroups = [...new Set(raw.map((x) => Number(x)).filter((x) => Number.isInteger(x) && x > 0))];
  return { nama, enable: bit(data.enable), idGroups };
}

async function assertUnique(transaction, nama, exceptId) {
  const r = new sql.Request(transaction);
  r.input("nama", sql.VarChar(50), nama);
  r.input("id", sql.Int, exceptId ?? 0);
  const d = await r.query(
    `SELECT TOP 1 1 AS dup FROM dbo.MstTargetGroupingKayu_h
     WHERE LTRIM(RTRIM(NamaGroup)) = @nama AND IdTargetGroupingKayu <> @id`,
  );
  if (d.recordset.length) throw httpError(409, `Group "${nama}" sudah ada.`);
}

async function assertGroupsExist(transaction, idGroups) {
  if (!idGroups.length) return;
  const r = new sql.Request(transaction);
  const list = idGroups.join(",");
  const d = await r.query(
    `SELECT IdGroup FROM dbo.MstGroupJenisKayu WHERE IdGroup IN (${list}) AND [Enable] = 1`,
  );
  const found = new Set(d.recordset.map((x) => x.IdGroup));
  const missing = idGroups.filter((id) => !found.has(id));
  if (missing.length) throw httpError(400, `Group jenis kayu tidak ditemukan atau tidak aktif: ${missing.join(", ")}.`);
}

async function insertDetails(transaction, id, idGroups) {
  for (const idGroup of idGroups) {
    const r = new sql.Request(transaction);
    r.input("id", sql.Int, id);
    r.input("idGroup", sql.Int, idGroup);
    await r.query(`INSERT INTO dbo.MstTargetGroupingKayu_d (IdTargetGroupingkayu, IdGroup) VALUES (@id, @idGroup)`);
  }
}

async function getAll() {
  const pool = await poolPromise;
  const rs = await pool.request().query(`
    SELECT h.IdTargetGroupingKayu, h.NamaGroup, h.[Enable],
           (SELECT COUNT(*) FROM dbo.MstTargetGroupingKayu_d d
             WHERE d.IdTargetGroupingkayu = h.IdTargetGroupingKayu) AS JumlahGroup,
           (SELECT COUNT(*) FROM dbo.MstTargetKayuBulat t
             WHERE t.IdTargetGroupingKayu = h.IdTargetGroupingKayu) AS JumlahTarget
    FROM dbo.MstTargetGroupingKayu_h h
    ORDER BY h.IdTargetGroupingKayu ASC
  `);
  return rs.recordset;
}

async function getDetail(id) {
  const idNum = Number(id);
  if (!Number.isInteger(idNum)) throw httpError(400, "Id tidak valid.");
  const pool = await poolPromise;
  const rs = await pool
    .request()
    .input("id", sql.Int, idNum)
    .query(`
      SELECT d.IdGroup, g.[Group] AS NamaGroup
      FROM dbo.MstTargetGroupingKayu_d d
      INNER JOIN dbo.MstGroupJenisKayu g ON g.IdGroup = d.IdGroup
      WHERE d.IdTargetGroupingkayu = @id
      ORDER BY g.[Group] ASC
    `);
  return rs.recordset;
}

async function getGroupOptions() {
  const pool = await poolPromise;
  const rs = await pool
    .request()
    .query(`SELECT IdGroup, [Group] AS NamaGroup FROM dbo.MstGroupJenisKayu WHERE [Enable] = 1 ORDER BY [Group] ASC`);
  return rs.recordset;
}

async function create(data, user) {
  const v = validate(data);
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    await assertUnique(transaction, v.nama, null);
    await assertGroupsExist(transaction, v.idGroups);

    const m = await new sql.Request(transaction).query(
      `SELECT ISNULL(MAX(IdTargetGroupingKayu), 0) + 1 AS NextId
       FROM dbo.MstTargetGroupingKayu_h WITH (UPDLOCK, HOLDLOCK)`,
    );
    const id = m.recordset[0].NextId;

    const req = new sql.Request(transaction);
    req.input("id", sql.Int, id);
    req.input("nama", sql.VarChar(50), v.nama);
    req.input("enable", sql.Bit, v.enable);
    await req.query(
      `INSERT INTO dbo.MstTargetGroupingKayu_h (IdTargetGroupingKayu, NamaGroup, [Enable]) VALUES (@id, @nama, @enable)`,
    );
    await insertDetails(transaction, id, v.idGroups);
    await audit(transaction, user, `Menyimpan Data Master Target Grouping Kayu ${v.nama} (Web)`);
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
    const cur = await c.query(`SELECT NamaGroup FROM dbo.MstTargetGroupingKayu_h WHERE IdTargetGroupingKayu = @id`);
    if (!cur.recordset.length) throw httpError(404, "Target grouping kayu tidak ditemukan.");
    if (String(cur.recordset[0].NamaGroup ?? "").trim().toLowerCase() !== v.nama.toLowerCase()) {
      await assertUnique(transaction, v.nama, idNum);
    }
    await assertGroupsExist(transaction, v.idGroups);

    const req = new sql.Request(transaction);
    req.input("id", sql.Int, idNum);
    req.input("nama", sql.VarChar(50), v.nama);
    req.input("enable", sql.Bit, v.enable);
    await req.query(
      `UPDATE dbo.MstTargetGroupingKayu_h SET NamaGroup = @nama, [Enable] = @enable WHERE IdTargetGroupingKayu = @id`,
    );
    const del = new sql.Request(transaction);
    del.input("id", sql.Int, idNum);
    await del.query(`DELETE FROM dbo.MstTargetGroupingKayu_d WHERE IdTargetGroupingkayu = @id`);
    await insertDetails(transaction, idNum, v.idGroups);
    await audit(transaction, user, `Mengubah Data Master Target Grouping Kayu ${v.nama} (Web)`);
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
      SELECT h.NamaGroup,
             (SELECT COUNT(*) FROM dbo.MstTargetKayuBulat t WHERE t.IdTargetGroupingKayu = h.IdTargetGroupingKayu) AS JumlahTarget
      FROM dbo.MstTargetGroupingKayu_h h WHERE h.IdTargetGroupingKayu = @id
    `);
    if (!cur.recordset.length) throw httpError(404, "Target grouping kayu tidak ditemukan.");
    if (cur.recordset[0].JumlahTarget > 0) {
      throw httpError(
        409,
        `Group "${cur.recordset[0].NamaGroup}" masih dipakai ${cur.recordset[0].JumlahTarget} baris Target Kayu Bulat dan tidak dapat dihapus. Ubah statusnya menjadi TIDAK AKTIF sebagai gantinya.`,
      );
    }

    const d1 = new sql.Request(transaction);
    d1.input("id", sql.Int, idNum);
    await d1.query(`DELETE FROM dbo.MstTargetGroupingKayu_d WHERE IdTargetGroupingkayu = @id`);
    const d2 = new sql.Request(transaction);
    d2.input("id", sql.Int, idNum);
    await d2.query(`DELETE FROM dbo.MstTargetGroupingKayu_h WHERE IdTargetGroupingKayu = @id`);
    await audit(transaction, user, `Menghapus Data Master Target Grouping Kayu ${cur.recordset[0].NamaGroup} (Web)`);
    await transaction.commit();
    return { id: idNum };
  } catch (err) {
    try { await transaction.rollback(); } catch { /* ignore */ }
    throw err;
  }
}

module.exports = { getAll, getDetail, getGroupOptions, create, update, remove };
