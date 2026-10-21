const { sql, poolPromise } = require("../../core/config/db");

/* ============================================================
 * Paritas desktop: FrmMstJenisKayu.vb
 * Master MstJenisKayu (+ lookup MstGroupJenisKayu). IdJenisKayu = MAX + 1 (bukan identity).
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
  const jenis = String(data.jenis ?? "").trim();
  const singkatan = String(data.singkatan ?? "").trim();
  const idGroup = Number(data.idGroup);
  if (!jenis) throw httpError(400, "Jenis kayu harus diisi.");
  if (!singkatan) throw httpError(400, "Singkatan harus diisi.");
  if (!Number.isInteger(idGroup) || idGroup <= 0) throw httpError(400, "Golongan (group) harus dipilih.");
  return {
    jenis: jenis.slice(0, 100),
    singkatan: singkatan.slice(0, 50),
    idGroup,
    enable: bit(data.enable),
    isLokal: bit(data.isLokal),
    isInternal: bit(data.isInternal),
    isUpah: bit(data.isUpah),
    isST: bit(data.isST),
    isNonST: bit(data.isNonST),
  };
}

function bindFields(req, v) {
  req.input("jenis", sql.VarChar(100), v.jenis);
  req.input("singkatan", sql.VarChar(50), v.singkatan);
  req.input("idGroup", sql.Int, v.idGroup);
  req.input("enable", sql.Bit, v.enable);
  req.input("isLokal", sql.Bit, v.isLokal);
  req.input("isInternal", sql.Bit, v.isInternal);
  req.input("isUpah", sql.Bit, v.isUpah);
  req.input("isST", sql.Bit, v.isST);
  req.input("isNonST", sql.Bit, v.isNonST);
}

async function assertGroupExists(transaction, idGroup) {
  const r = new sql.Request(transaction);
  r.input("g", sql.Int, idGroup);
  const g = await r.query(`SELECT 1 AS ok FROM dbo.MstGroupJenisKayu WHERE IdGroup = @g`);
  if (!g.recordset.length) throw httpError(400, "Golongan (group) tidak ditemukan.");
}

async function assertUnique(transaction, jenis, exceptId) {
  const r = new sql.Request(transaction);
  r.input("jenis", sql.VarChar(100), jenis);
  r.input("id", sql.Int, exceptId ?? 0);
  const d = await r.query(`SELECT TOP 1 1 AS dup FROM dbo.MstJenisKayu WHERE Jenis = @jenis AND IdJenisKayu <> @id`);
  if (d.recordset.length) throw httpError(409, `Jenis kayu "${jenis}" sudah ada.`);
}

async function getAll() {
  const pool = await poolPromise;
  const rs = await pool.request().query(`
    SELECT A.IdJenisKayu, A.Jenis, A.Singkatan, A.[Enable], A.IdGroup, B.[Group] AS NamaGroup,
           A.IsLokal, A.IsInternal, A.IsUpah, A.IsST, A.IsNonST,
           CONVERT(varchar(19), A.DateCreate, 120) AS DateCreate
    FROM dbo.MstJenisKayu A
    LEFT JOIN dbo.MstGroupJenisKayu B ON B.IdGroup = A.IdGroup
    ORDER BY A.IdJenisKayu ASC
  `);
  return rs.recordset;
}

async function getGroups() {
  const pool = await poolPromise;
  const rs = await pool
    .request()
    .query(`SELECT IdGroup, [Group] AS NamaGroup FROM dbo.MstGroupJenisKayu ORDER BY [Group] ASC`);
  return rs.recordset;
}

async function create(data, user) {
  const v = validate(data);
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    await assertGroupExists(transaction, v.idGroup);
    await assertUnique(transaction, v.jenis, null);

    const m = await new sql.Request(transaction).query(
      `SELECT ISNULL(MAX(IdJenisKayu), 0) + 1 AS NextId FROM dbo.MstJenisKayu WITH (UPDLOCK, HOLDLOCK)`,
    );
    const id = m.recordset[0].NextId;

    const req = new sql.Request(transaction);
    req.input("id", sql.Int, id);
    bindFields(req, v);
    await req.query(`
      INSERT INTO dbo.MstJenisKayu
        (IdJenisKayu, Jenis, Singkatan, DateCreate, [Enable], IdGroup, IsLokal, IsInternal, IsUpah, IsST, IsNonST)
      VALUES (@id, @jenis, @singkatan, GETDATE(), @enable, @idGroup, @isLokal, @isInternal, @isUpah, @isST, @isNonST)
    `);
    await audit(transaction, user, `Menyimpan Data Master Jenis Kayu ${v.jenis} (Web)`);
    await transaction.commit();
    return { idJenisKayu: id };
  } catch (err) {
    try { await transaction.rollback(); } catch { /* ignore */ }
    throw err;
  }
}

async function update(id, data, user) {
  const idNum = Number(id);
  if (!Number.isInteger(idNum)) throw httpError(400, "Id jenis kayu tidak valid.");
  const v = validate(data);
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    await assertGroupExists(transaction, v.idGroup);
    await assertUnique(transaction, v.jenis, idNum);

    const req = new sql.Request(transaction);
    req.input("id", sql.Int, idNum);
    bindFields(req, v);
    const r = await req.query(`
      UPDATE dbo.MstJenisKayu
      SET Jenis = @jenis, Singkatan = @singkatan, [Enable] = @enable, IdGroup = @idGroup,
          IsLokal = @isLokal, IsInternal = @isInternal, IsUpah = @isUpah, IsST = @isST, IsNonST = @isNonST
      WHERE IdJenisKayu = @id
    `);
    if (!r.rowsAffected[0]) throw httpError(404, "Jenis kayu tidak ditemukan.");
    await audit(transaction, user, `Mengubah Data Master Jenis Kayu ${v.jenis} (Web)`);
    await transaction.commit();
    return { idJenisKayu: idNum };
  } catch (err) {
    try { await transaction.rollback(); } catch { /* ignore */ }
    throw err;
  }
}

async function remove(id, user) {
  const idNum = Number(id);
  if (!Number.isInteger(idNum)) throw httpError(400, "Id jenis kayu tidak valid.");
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const c = new sql.Request(transaction);
    c.input("id", sql.Int, idNum);
    const cur = await c.query(`SELECT Jenis FROM dbo.MstJenisKayu WHERE IdJenisKayu = @id`);
    if (!cur.recordset.length) throw httpError(404, "Jenis kayu tidak ditemukan.");

    const req = new sql.Request(transaction);
    req.input("id", sql.Int, idNum);
    await req.query(`DELETE FROM dbo.MstJenisKayu WHERE IdJenisKayu = @id`);
    await audit(transaction, user, `Menghapus Data Master Jenis Kayu ${cur.recordset[0].Jenis} (Web)`);
    await transaction.commit();
    return { idJenisKayu: idNum };
  } catch (err) {
    try { await transaction.rollback(); } catch { /* ignore */ }
    // 547 = pelanggaran FK: sudah dipakai transaksi
    if (err.number === 547 || err.originalError?.info?.number === 547) {
      throw httpError(
        409,
        "Jenis kayu sudah dipakai pada transaksi dan tidak dapat dihapus. Ubah statusnya menjadi TIDAK ADA sebagai gantinya.",
      );
    }
    throw err;
  }
}

module.exports = { getAll, getGroups, create, update, remove };
