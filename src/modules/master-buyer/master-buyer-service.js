const { sql, poolPromise } = require("../../core/config/db");

/* ============================================================
 * Paritas desktop: FrmMstBuyer.vb
 * Master MstBuyer (IdBuyer = MAX + 1, bukan identity; Buyer varchar(35); IsExport bit).
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
  const buyer = String(data.buyer ?? "").trim();
  if (!buyer) throw httpError(400, "Nama buyer harus diisi.");
  if (buyer.length > 35) throw httpError(400, "Nama buyer maksimal 35 karakter.");
  return { buyer, isExport: bit(data.isExport) };
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

async function assertUnique(tx, buyer, exceptId) {
  const r = await new sql.Request(tx)
    .input("b", sql.VarChar(35), buyer)
    .input("id", sql.Int, exceptId ?? 0)
    .query(`SELECT TOP 1 1 AS dup FROM MstBuyer WHERE Buyer = @b AND IdBuyer <> @id`);
  if (r.recordset.length) throw httpError(409, `Buyer "${buyer}" sudah ada.`);
}

async function getAll() {
  const pool = await poolPromise;
  const rs = await pool.request().query(`
    SELECT b.IdBuyer, b.Buyer, CAST(ISNULL(b.IsExport, 0) AS bit) AS IsExport,
           (SELECT COUNT(*) FROM MstSPK_h h WHERE h.IdBuyer = b.IdBuyer) AS JumlahSPK
    FROM MstBuyer b
    ORDER BY b.IdBuyer DESC
  `);
  return rs.recordset;
}

async function create(data, user) {
  const v = validate(data);
  return withTx(async (tx) => {
    await assertUnique(tx, v.buyer, null);
    const m = await new sql.Request(tx).query(
      `SELECT ISNULL(MAX(IdBuyer), 0) + 1 AS NextId FROM MstBuyer WITH (UPDLOCK, HOLDLOCK)`,
    );
    const id = m.recordset[0].NextId;
    await new sql.Request(tx)
      .input("id", sql.Int, id)
      .input("b", sql.VarChar(35), v.buyer)
      .input("e", sql.Bit, v.isExport)
      .query(`INSERT INTO MstBuyer (IdBuyer, Buyer, IsExport) VALUES (@id, @b, @e)`);
    await audit(tx, user, `Menyimpan Data Master Buyer ${v.buyer} (Web)`);
    return { idBuyer: id };
  });
}

async function update(idParam, data, user) {
  const id = Number(idParam);
  if (!Number.isInteger(id)) throw httpError(400, "Id buyer tidak valid.");
  const v = validate(data);
  return withTx(async (tx) => {
    await assertUnique(tx, v.buyer, id);
    const r = await new sql.Request(tx)
      .input("id", sql.Int, id)
      .input("b", sql.VarChar(35), v.buyer)
      .input("e", sql.Bit, v.isExport)
      .query(`UPDATE MstBuyer SET Buyer = @b, IsExport = @e WHERE IdBuyer = @id`);
    if (!r.rowsAffected[0]) throw httpError(404, "Buyer tidak ditemukan.");
    await audit(tx, user, `Mengubah Data Master Buyer ${v.buyer} (Web)`);
    return { idBuyer: id };
  });
}

async function remove(idParam, user) {
  const id = Number(idParam);
  if (!Number.isInteger(id)) throw httpError(400, "Id buyer tidak valid.");
  try {
    return await withTx(async (tx) => {
      const cur = await new sql.Request(tx)
        .input("id", sql.Int, id)
        .query(`SELECT Buyer FROM MstBuyer WHERE IdBuyer = @id`);
      if (!cur.recordset.length) throw httpError(404, "Buyer tidak ditemukan.");
      await new sql.Request(tx).input("id", sql.Int, id).query(`DELETE FROM MstBuyer WHERE IdBuyer = @id`);
      await audit(tx, user, `Menghapus Data Master Buyer ${cur.recordset[0].Buyer} (Web)`);
      return { idBuyer: id };
    });
  } catch (err) {
    // 547 = pelanggaran FK: buyer sudah dipakai SPK / transaksi
    if (err.number === 547 || err.originalError?.info?.number === 547) {
      throw httpError(409, "Buyer sudah dipakai pada SPK / transaksi dan tidak dapat dihapus.");
    }
    throw err;
  }
}

module.exports = { getAll, create, update, remove };
