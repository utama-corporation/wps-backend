const { sql, poolPromise } = require("../../core/config/db");

/* ============================================================
 * Paritas desktop: FrmMstGrade.vb ("Data Master Grade")
 * MstGrade (IdGrade = MAX + 1, bukan identity; NamaGrade nvarchar(30);
 * IsAfkir bit; IsReproses bit; Enable bit).
 * MstGrade_d (PK: IdGrade + Category varchar(15) + IdJenisKayu; Enable bit)
 * — category per jenis kayu; desktop menyimpan replace-all (hapus semua + insert ulang).
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

const str = (v) => String(v ?? "").trim();
const bit = (v) => (v === true || v === 1 || v === "1" || v === "true" ? 1 : 0);
const num = (v) => (v === null || v === undefined || v === "" ? null : Number(v));

function validate(data) {
  const nama = str(data.namaGrade);
  if (!nama) throw httpError(400, "Nama grade harus diisi.");
  if (nama.length > 30) throw httpError(400, "Nama grade maksimal 30 karakter.");
  return { nama, isAfkir: bit(data.isAfkir), isReproses: bit(data.isReproses), enable: bit(data.enable) };
}

async function withTx(fn) {
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const out = await fn(transaction);
    await transaction.commit();
    return out;
  } catch (err) {
    try { await transaction.rollback(); } catch { /* ignore */ }
    throw err;
  }
}

async function getAll() {
  const pool = await poolPromise;
  const rs = await pool.request().query(`
    SELECT g.IdGrade, g.NamaGrade,
           CAST(ISNULL(g.IsAfkir, 0) AS bit) AS IsAfkir,
           CAST(ISNULL(g.IsReproses, 0) AS bit) AS IsReproses,
           CAST(ISNULL(g.[Enable], 0) AS bit) AS [Enable],
           (SELECT COUNT(*) FROM MstGrade_d d WHERE d.IdGrade = g.IdGrade) AS JumlahCategory
    FROM MstGrade g
    ORDER BY g.IdGrade ASC
  `);
  return rs.recordset;
}

async function create(data, user) {
  const v = validate(data);
  return withTx(async (tx) => {
    const m = await new sql.Request(tx).query(
      `SELECT ISNULL(MAX(IdGrade), 0) + 1 AS NextId FROM MstGrade WITH (UPDLOCK, HOLDLOCK)`,
    );
    const id = m.recordset[0].NextId;
    await new sql.Request(tx)
      .input("id", sql.Int, id)
      .input("n", sql.NVarChar(30), v.nama)
      .input("a", sql.Bit, v.isAfkir)
      .input("r", sql.Bit, v.isReproses)
      .input("e", sql.Bit, v.enable)
      .query(`INSERT INTO MstGrade (IdGrade, NamaGrade, IsAfkir, IsReproses, [Enable]) VALUES (@id, @n, @a, @r, @e)`);
    await audit(tx, user, `Menyimpan Data Master Grade ${v.nama} (Web)`);
    return { idGrade: id };
  });
}

async function update(idParam, data, user) {
  const id = Number(idParam);
  if (!Number.isInteger(id)) throw httpError(400, "Id grade tidak valid.");
  const v = validate(data);
  return withTx(async (tx) => {
    const r = await new sql.Request(tx)
      .input("id", sql.Int, id)
      .input("n", sql.NVarChar(30), v.nama)
      .input("a", sql.Bit, v.isAfkir)
      .input("r", sql.Bit, v.isReproses)
      .input("e", sql.Bit, v.enable)
      .query(`UPDATE MstGrade SET NamaGrade = @n, IsAfkir = @a, IsReproses = @r, [Enable] = @e WHERE IdGrade = @id`);
    if (!r.rowsAffected[0]) throw httpError(404, "Grade tidak ditemukan.");
    await audit(tx, user, `Mengubah Data Master Grade ${v.nama} (Web)`);
    return { idGrade: id };
  });
}

async function remove(idParam, user) {
  const id = Number(idParam);
  if (!Number.isInteger(id)) throw httpError(400, "Id grade tidak valid.");
  try {
    return await withTx(async (tx) => {
      const cur = await new sql.Request(tx)
        .input("id", sql.Int, id)
        .query(`SELECT NamaGrade FROM MstGrade WHERE IdGrade = @id`);
      if (!cur.recordset.length) throw httpError(404, "Grade tidak ditemukan.");
      await new sql.Request(tx).input("id", sql.Int, id).query(`DELETE FROM MstGrade_d WHERE IdGrade = @id`);
      await new sql.Request(tx).input("id", sql.Int, id).query(`DELETE FROM MstGrade WHERE IdGrade = @id`);
      await audit(tx, user, `Menghapus Data Master Grade ${cur.recordset[0].NamaGrade} (Web)`);
      return { idGrade: id };
    });
  } catch (err) {
    if (err.number === 547 || err.originalError?.info?.number === 547) {
      throw httpError(409, "Grade masih dipakai pada data lain dan tidak dapat dihapus. Ubah statusnya menjadi TIDAK AKTIF sebagai gantinya.");
    }
    throw err;
  }
}

async function getCategories(idParam) {
  const id = Number(idParam);
  if (!Number.isInteger(id)) throw httpError(400, "Id grade tidak valid.");
  const pool = await poolPromise;
  const rs = await pool.request()
    .input("id", sql.Int, id)
    .query(`
      SELECT d.IdGrade, d.Category, d.IdJenisKayu, j.Jenis,
             CAST(ISNULL(d.[Enable], 0) AS bit) AS [Enable]
      FROM MstGrade_d d
      LEFT JOIN MstJenisKayu j ON j.IdJenisKayu = d.IdJenisKayu
      WHERE d.IdGrade = @id
      ORDER BY d.Category ASC, d.IdJenisKayu ASC
    `);
  return rs.recordset;
}

function validateCategories(body) {
  const raw = body?.categories;
  if (!Array.isArray(raw)) throw httpError(400, "Field categories harus berupa array.");
  return raw.map((c) => {
    const category = str(c?.category);
    const idJenisKayu = num(c?.idJenisKayu);
    if (!category) throw httpError(400, "Category harus diisi.");
    if (category.length > 15) throw httpError(400, "Category maksimal 15 karakter.");
    if (!Number.isInteger(idJenisKayu)) throw httpError(400, "Jenis kayu harus dipilih.");
    return { category, idJenisKayu, enable: bit(c?.enable) };
  });
}

async function replaceCategories(idParam, body, user) {
  const id = Number(idParam);
  if (!Number.isInteger(id)) throw httpError(400, "Id grade tidak valid.");
  const items = validateCategories(body);
  return withTx(async (tx) => {
    const cur = await new sql.Request(tx)
      .input("id", sql.Int, id)
      .query(`SELECT NamaGrade FROM MstGrade WHERE IdGrade = @id`);
    if (!cur.recordset.length) throw httpError(404, "Grade tidak ditemukan.");
    const seen = new Set();
    for (const it of items) {
      const k = `${it.category}|${it.idJenisKayu}`;
      if (seen.has(k)) throw httpError(409, `Category "${it.category}" ganda untuk jenis kayu yang sama.`);
      seen.add(k);
      const j = await new sql.Request(tx)
        .input("j", sql.Int, it.idJenisKayu)
        .query(`SELECT TOP 1 1 AS ok FROM MstJenisKayu WHERE IdJenisKayu = @j`);
      if (!j.recordset.length) throw httpError(404, `Jenis kayu id ${it.idJenisKayu} tidak ditemukan.`);
    }
    await new sql.Request(tx).input("id", sql.Int, id).query(`DELETE FROM MstGrade_d WHERE IdGrade = @id`);
    for (const it of items) {
      await new sql.Request(tx)
        .input("g", sql.Int, id)
        .input("c", sql.VarChar(15), it.category)
        .input("j", sql.Int, it.idJenisKayu)
        .input("e", sql.Bit, it.enable)
        .query(`INSERT INTO MstGrade_d (IdGrade, Category, IdJenisKayu, [Enable]) VALUES (@g, @c, @j, @e)`);
    }
    await audit(tx, user, `Menyimpan Category Master Grade ${cur.recordset[0].NamaGrade} (${items.length} baris) (Web)`);
    return { idGrade: id, jumlah: items.length };
  });
}

module.exports = { getAll, create, update, remove, getCategories, replaceCategories };
