const { sql, poolPromise } = require("../../core/config/db");

/* ============================================================
 * Paritas desktop: FrmMstGroupJenisKayu.vb
 * Master MstGroupJenisKayu (IdGroup, [Group], [Enable], TargetHarian).
 * IdGroup = MAX + 1 (bukan identity / bukan jumlah baris seperti di VB).
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

function validate(data) {
  const group = String(data.group ?? "").trim();
  if (!group) throw httpError(400, "Nama group jenis kayu harus diisi.");
  const raw = data.targetHarian;
  const target = raw === "" || raw === null || raw === undefined ? 0 : Number(raw);
  if (!Number.isFinite(target) || target < 0) throw httpError(400, "Target harian harus berupa angka 0 atau lebih.");
  return { group: group.slice(0, 100), target, enable: bit(data.enable) };
}

function bindFields(req, v) {
  req.input("group", sql.VarChar(100), v.group);
  req.input("target", sql.Float, v.target);
  req.input("enable", sql.Bit, v.enable);
}

async function assertUnique(transaction, group, exceptId) {
  const r = new sql.Request(transaction);
  r.input("group", sql.VarChar(100), group);
  r.input("id", sql.Int, exceptId ?? 0);
  const d = await r.query(
    `SELECT TOP 1 1 AS dup FROM dbo.MstGroupJenisKayu WHERE LTRIM(RTRIM([Group])) = @group AND IdGroup <> @id`,
  );
  if (d.recordset.length) throw httpError(409, `Group jenis kayu "${group}" sudah ada.`);
}

function mapSqlError(err) {
  const n = err.number ?? err.originalError?.info?.number;
  if (n === 2628 || n === 8152) {
    return httpError(400, "Data terlalu panjang untuk disimpan. Persingkat nama group.");
  }
  return err;
}

async function getAll() {
  const pool = await poolPromise;
  const rs = await pool.request().query(`
    SELECT g.IdGroup, g.[Group] AS NamaGroup, g.[Enable], g.TargetHarian,
           (SELECT COUNT(*) FROM dbo.MstJenisKayu k WHERE k.IdGroup = g.IdGroup) AS JumlahJenis
    FROM dbo.MstGroupJenisKayu g
    ORDER BY g.IdGroup ASC
  `);
  return rs.recordset;
}

async function create(data, user) {
  const v = validate(data);
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    await assertUnique(transaction, v.group, null);

    const m = await new sql.Request(transaction).query(
      `SELECT ISNULL(MAX(IdGroup), 0) + 1 AS NextId FROM dbo.MstGroupJenisKayu WITH (UPDLOCK, HOLDLOCK)`,
    );
    const id = m.recordset[0].NextId;

    const req = new sql.Request(transaction);
    req.input("id", sql.Int, id);
    bindFields(req, v);
    await req.query(`
      INSERT INTO dbo.MstGroupJenisKayu (IdGroup, [Group], [Enable], TargetHarian)
      VALUES (@id, @group, @enable, @target)
    `);
    await audit(transaction, user, `Menyimpan Data Master Group Jenis Kayu ${v.group} (Web)`);
    await transaction.commit();
    return { idGroup: id };
  } catch (err) {
    try { await transaction.rollback(); } catch { /* ignore */ }
    throw mapSqlError(err);
  }
}

async function update(id, data, user) {
  const idNum = Number(id);
  if (!Number.isInteger(idNum)) throw httpError(400, "Id group tidak valid.");
  const v = validate(data);
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const c = new sql.Request(transaction);
    c.input("id", sql.Int, idNum);
    const cur = await c.query(`SELECT [Group] FROM dbo.MstGroupJenisKayu WHERE IdGroup = @id`);
    if (!cur.recordset.length) throw httpError(404, "Group jenis kayu tidak ditemukan.");
    // Cek kembar hanya bila nama diganti, agar data lama yang sudah kembar tetap bisa diubah.
    if (String(cur.recordset[0].Group ?? "").trim().toLowerCase() !== v.group.toLowerCase()) {
      await assertUnique(transaction, v.group, idNum);
    }

    const req = new sql.Request(transaction);
    req.input("id", sql.Int, idNum);
    bindFields(req, v);
    await req.query(`
      UPDATE dbo.MstGroupJenisKayu
      SET [Group] = @group, TargetHarian = @target, [Enable] = @enable
      WHERE IdGroup = @id
    `);
    await audit(transaction, user, `Mengubah Data Master Group Jenis Kayu ${v.group} (Web)`);
    await transaction.commit();
    return { idGroup: idNum };
  } catch (err) {
    try { await transaction.rollback(); } catch { /* ignore */ }
    throw mapSqlError(err);
  }
}

async function remove(id, user) {
  const idNum = Number(id);
  if (!Number.isInteger(idNum)) throw httpError(400, "Id group tidak valid.");
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const c = new sql.Request(transaction);
    c.input("id", sql.Int, idNum);
    const cur = await c.query(`
      SELECT g.[Group],
             (SELECT COUNT(*) FROM dbo.MstJenisKayu k WHERE k.IdGroup = g.IdGroup) AS JumlahJenis
      FROM dbo.MstGroupJenisKayu g WHERE g.IdGroup = @id
    `);
    if (!cur.recordset.length) throw httpError(404, "Group jenis kayu tidak ditemukan.");
    if (cur.recordset[0].JumlahJenis > 0) {
      throw httpError(
        409,
        `Group "${cur.recordset[0].Group}" masih dipakai ${cur.recordset[0].JumlahJenis} jenis kayu dan tidak dapat dihapus. Ubah statusnya menjadi TIDAK ADA sebagai gantinya.`,
      );
    }

    const req = new sql.Request(transaction);
    req.input("id", sql.Int, idNum);
    await req.query(`DELETE FROM dbo.MstGroupJenisKayu WHERE IdGroup = @id`);
    await audit(transaction, user, `Menghapus Data Master Group Jenis Kayu ${cur.recordset[0].Group} (Web)`);
    await transaction.commit();
    return { idGroup: idNum };
  } catch (err) {
    try { await transaction.rollback(); } catch { /* ignore */ }
    // 547 = pelanggaran FK: dipakai tabel lain
    if (err.number === 547 || err.originalError?.info?.number === 547) {
      throw httpError(
        409,
        "Group sudah dipakai data lain dan tidak dapat dihapus. Ubah statusnya menjadi TIDAK ADA sebagai gantinya.",
      );
    }
    throw err;
  }
}

module.exports = { getAll, create, update, remove };
