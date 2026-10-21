const { sql, poolPromise } = require("../../core/config/db");

/* ============================================================
 * Paritas desktop: FrmMstSawmillSpecialCondition .vb ("Data Master Special Condition")
 * MstSawmillSpecialCondition (IdSawmillSpecialCondition = MAX + 1, bukan identity;
 * Condition varchar(20); Enable bit).
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

function validate(data) {
  const condition = str(data.condition);
  if (!condition) throw httpError(400, "Condition harus diisi.");
  if (condition.length > 20) throw httpError(400, "Condition maksimal 20 karakter.");
  return { condition, enable: bit(data.enable) };
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

async function assertUnique(tx, condition, exceptId) {
  const r = await new sql.Request(tx)
    .input("c", sql.VarChar(20), condition)
    .input("id", sql.Int, exceptId ?? 0)
    .query(`SELECT TOP 1 1 AS dup FROM MstSawmillSpecialCondition WHERE [Condition] = @c AND IdSawmillSpecialCondition <> @id`);
  if (r.recordset.length) throw httpError(409, `Special condition "${condition}" sudah ada.`);
}

async function getAll() {
  const pool = await poolPromise;
  const rs = await pool.request().query(`
    SELECT IdSawmillSpecialCondition, [Condition], CAST(ISNULL([Enable], 0) AS bit) AS [Enable]
    FROM MstSawmillSpecialCondition
    ORDER BY IdSawmillSpecialCondition ASC
  `);
  return rs.recordset;
}

async function create(data, user) {
  const v = validate(data);
  return withTx(async (tx) => {
    await assertUnique(tx, v.condition, null);
    const m = await new sql.Request(tx).query(
      `SELECT ISNULL(MAX(IdSawmillSpecialCondition), 0) + 1 AS NextId FROM MstSawmillSpecialCondition WITH (UPDLOCK, HOLDLOCK)`,
    );
    const id = m.recordset[0].NextId;
    await new sql.Request(tx)
      .input("id", sql.Int, id)
      .input("c", sql.VarChar(20), v.condition)
      .input("e", sql.Bit, v.enable)
      .query(`INSERT INTO MstSawmillSpecialCondition (IdSawmillSpecialCondition, [Condition], [Enable]) VALUES (@id, @c, @e)`);
    await audit(tx, user, `Menyimpan Data Master Special Condition ${v.condition} (Web)`);
    return { idSpecialCondition: id };
  });
}

async function update(idParam, data, user) {
  const id = Number(idParam);
  if (!Number.isInteger(id)) throw httpError(400, "Id special condition tidak valid.");
  const v = validate(data);
  return withTx(async (tx) => {
    await assertUnique(tx, v.condition, id);
    const r = await new sql.Request(tx)
      .input("id", sql.Int, id)
      .input("c", sql.VarChar(20), v.condition)
      .input("e", sql.Bit, v.enable)
      .query(`UPDATE MstSawmillSpecialCondition SET [Condition] = @c, [Enable] = @e WHERE IdSawmillSpecialCondition = @id`);
    if (!r.rowsAffected[0]) throw httpError(404, "Special condition tidak ditemukan.");
    await audit(tx, user, `Mengubah Data Master Special Condition ${v.condition} (Web)`);
    return { idSpecialCondition: id };
  });
}

async function remove(idParam, user) {
  const id = Number(idParam);
  if (!Number.isInteger(id)) throw httpError(400, "Id special condition tidak valid.");
  try {
    return await withTx(async (tx) => {
      const cur = await new sql.Request(tx)
        .input("id", sql.Int, id)
        .query(`SELECT [Condition] FROM MstSawmillSpecialCondition WHERE IdSawmillSpecialCondition = @id`);
      if (!cur.recordset.length) throw httpError(404, "Special condition tidak ditemukan.");
      await new sql.Request(tx).input("id", sql.Int, id).query(`DELETE FROM MstSawmillSpecialCondition WHERE IdSawmillSpecialCondition = @id`);
      await audit(tx, user, `Menghapus Data Master Special Condition ${cur.recordset[0].Condition} (Web)`);
      return { idSpecialCondition: id };
    });
  } catch (err) {
    if (err.number === 547 || err.originalError?.info?.number === 547) {
      throw httpError(409, "Special condition masih dipakai pada data lain dan tidak dapat dihapus. Ubah statusnya menjadi TIDAK AKTIF sebagai gantinya.");
    }
    throw err;
  }
}

module.exports = { getAll, create, update, remove };
