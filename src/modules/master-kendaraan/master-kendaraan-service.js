const { sql, poolPromise } = require("../../core/config/db");

/* ============================================================
 * Paritas desktop: FrmMstJenisKendaraan.vb ("Data Master Jenis Kendaraan")
 * MstJenisKendaraan (IdJenisKendaraan = MAX + 1, bukan identity; Model varchar(25); Type varchar(13); Enable bit).
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
  const model = str(data.model);
  const type = str(data.type);
  if (!model) throw httpError(400, "Model kendaraan harus diisi.");
  if (model.length > 25) throw httpError(400, "Model maksimal 25 karakter.");
  if (type.length > 13) throw httpError(400, "Type maksimal 13 karakter.");
  return { model, type: type || null, enable: bit(data.enable) };
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

async function assertUnique(tx, model, exceptId) {
  const r = await new sql.Request(tx)
    .input("m", sql.VarChar(25), model)
    .input("id", sql.Int, exceptId ?? 0)
    .query(`SELECT TOP 1 1 AS dup FROM MstJenisKendaraan WHERE Model = @m AND IdJenisKendaraan <> @id`);
  if (r.recordset.length) throw httpError(409, `Kendaraan "${model}" sudah ada.`);
}

async function getAll() {
  const pool = await poolPromise;
  const rs = await pool.request().query(`
    SELECT k.IdJenisKendaraan, k.Model, k.[Type], CAST(ISNULL(k.[Enable], 0) AS bit) AS [Enable],
           (SELECT COUNT(*) FROM Penjualan_h p WHERE p.IdJenisKendaraan = k.IdJenisKendaraan) AS JumlahPenjualan
    FROM MstJenisKendaraan k
    ORDER BY k.IdJenisKendaraan ASC
  `);
  return rs.recordset;
}

async function create(data, user) {
  const v = validate(data);
  return withTx(async (tx) => {
    await assertUnique(tx, v.model, null);
    const m = await new sql.Request(tx).query(
      `SELECT ISNULL(MAX(IdJenisKendaraan), 0) + 1 AS NextId FROM MstJenisKendaraan WITH (UPDLOCK, HOLDLOCK)`,
    );
    const id = m.recordset[0].NextId;
    await new sql.Request(tx)
      .input("id", sql.Int, id)
      .input("m", sql.VarChar(25), v.model)
      .input("t", sql.VarChar(13), v.type)
      .input("e", sql.Bit, v.enable)
      .query(`INSERT INTO MstJenisKendaraan (IdJenisKendaraan, Model, [Type], [Enable]) VALUES (@id, @m, @t, @e)`);
    await audit(tx, user, `Menyimpan Data Master Jenis Kendaraan ${v.model} (Web)`);
    return { idJenisKendaraan: id };
  });
}

async function update(idParam, data, user) {
  const id = Number(idParam);
  if (!Number.isInteger(id)) throw httpError(400, "Id kendaraan tidak valid.");
  const v = validate(data);
  return withTx(async (tx) => {
    await assertUnique(tx, v.model, id);
    const r = await new sql.Request(tx)
      .input("id", sql.Int, id)
      .input("m", sql.VarChar(25), v.model)
      .input("t", sql.VarChar(13), v.type)
      .input("e", sql.Bit, v.enable)
      .query(`UPDATE MstJenisKendaraan SET Model = @m, [Type] = @t, [Enable] = @e WHERE IdJenisKendaraan = @id`);
    if (!r.rowsAffected[0]) throw httpError(404, "Kendaraan tidak ditemukan.");
    await audit(tx, user, `Mengubah Data Master Jenis Kendaraan ${v.model} (Web)`);
    return { idJenisKendaraan: id };
  });
}

async function remove(idParam, user) {
  const id = Number(idParam);
  if (!Number.isInteger(id)) throw httpError(400, "Id kendaraan tidak valid.");
  try {
    return await withTx(async (tx) => {
      const cur = await new sql.Request(tx)
        .input("id", sql.Int, id)
        .query(`SELECT Model FROM MstJenisKendaraan WHERE IdJenisKendaraan = @id`);
      if (!cur.recordset.length) throw httpError(404, "Kendaraan tidak ditemukan.");
      await new sql.Request(tx).input("id", sql.Int, id).query(`DELETE FROM MstJenisKendaraan WHERE IdJenisKendaraan = @id`);
      await audit(tx, user, `Menghapus Data Master Jenis Kendaraan ${cur.recordset[0].Model} (Web)`);
      return { idJenisKendaraan: id };
    });
  } catch (err) {
    if (err.number === 547 || err.originalError?.info?.number === 547) {
      throw httpError(409, "Kendaraan sudah dipakai pada penjualan dan tidak dapat dihapus. Ubah statusnya menjadi TIDAK AKTIF sebagai gantinya.");
    }
    throw err;
  }
}

module.exports = { getAll, create, update, remove };
