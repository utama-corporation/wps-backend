const { sql, poolPromise } = require("../../core/config/db");

/* ============================================================
 * Paritas desktop: FrmMstVacuumTube.vb ("Master Vacuum Tube")
 * MstVacuumTube (IdVacuumTube = MAX + 1, bukan identity; Enable bit).
 * Form hanya memilih status AKTIF / TIDAK AKTIF.
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
    SELECT IdVacuumTube, CAST(ISNULL([Enable], 0) AS bit) AS [Enable]
    FROM MstVacuumTube
    ORDER BY IdVacuumTube ASC
  `);
  return rs.recordset;
}

async function create(data, user) {
  return withTx(async (tx) => {
    const m = await new sql.Request(tx).query(
      `SELECT ISNULL(MAX(IdVacuumTube), 0) + 1 AS NextId FROM MstVacuumTube WITH (UPDLOCK, HOLDLOCK)`,
    );
    const id = m.recordset[0].NextId;
    const enable = bit(data?.enable);
    await new sql.Request(tx)
      .input("id", sql.Int, id)
      .input("e", sql.Bit, enable)
      .query(`INSERT INTO MstVacuumTube (IdVacuumTube, [Enable]) VALUES (@id, @e)`);
    await audit(tx, user, `Menyimpan Data Master Vacuum Tube ${id} (Web)`);
    return { idVacuumTube: id };
  });
}

async function update(idParam, data, user) {
  const id = Number(idParam);
  if (!Number.isInteger(id)) throw httpError(400, "Id vacuum tube tidak valid.");
  return withTx(async (tx) => {
    const r = await new sql.Request(tx)
      .input("id", sql.Int, id)
      .input("e", sql.Bit, bit(data?.enable))
      .query(`UPDATE MstVacuumTube SET [Enable] = @e WHERE IdVacuumTube = @id`);
    if (!r.rowsAffected[0]) throw httpError(404, "Vacuum tube tidak ditemukan.");
    await audit(tx, user, `Mengubah Data Master Vacuum Tube ${id} (Web)`);
    return { idVacuumTube: id };
  });
}

async function remove(idParam, user) {
  const id = Number(idParam);
  if (!Number.isInteger(id)) throw httpError(400, "Id vacuum tube tidak valid.");
  try {
    return await withTx(async (tx) => {
      const cur = await new sql.Request(tx)
        .input("id", sql.Int, id)
        .query(`SELECT IdVacuumTube FROM MstVacuumTube WHERE IdVacuumTube = @id`);
      if (!cur.recordset.length) throw httpError(404, "Vacuum tube tidak ditemukan.");
      await new sql.Request(tx).input("id", sql.Int, id).query(`DELETE FROM MstVacuumTube WHERE IdVacuumTube = @id`);
      await audit(tx, user, `Menghapus Data Master Vacuum Tube ${id} (Web)`);
      return { idVacuumTube: id };
    });
  } catch (err) {
    if (err.number === 547 || err.originalError?.info?.number === 547) {
      throw httpError(409, "Vacuum tube masih dipakai pada data lain dan tidak dapat dihapus. Ubah statusnya menjadi TIDAK AKTIF sebagai gantinya.");
    }
    throw err;
  }
}

module.exports = { getAll, create, update, remove };
