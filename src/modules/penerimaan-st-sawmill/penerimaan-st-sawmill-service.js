const { sql, poolPromise } = require("../../core/config/db");

const httpError = (statusCode, message) => Object.assign(new Error(message), { statusCode });

// Paritas SawmillApi.getPenerimaanSTSawmillData tablet (TOP 100, terbaru dulu)
async function getAll({ search } = {}) {
  const pool = await poolPromise;
  const req = pool.request();
  const keyword = String(search || "").trim();
  let where = "";
  if (keyword) {
    req.input("kw", sql.VarChar(100), `%${keyword}%`);
    where = "WHERE NoPenerimaanST LIKE @kw OR NoKayuBulat LIKE @kw";
  }
  const result = await req.query(`
    SELECT TOP 100 NoPenerimaanST, TglLaporan, NoKayuBulat
    FROM PenerimaanSTSawmill_h
    ${where}
    ORDER BY NoPenerimaanST DESC
  `);
  return result.recordset;
}

// Paritas SawmillApi.getSTSawmillListByNoPenerimaanST tablet
async function getSTSawmillList(no) {
  const pool = await poolPromise;
  const result = await pool
    .request()
    .input("no", sql.VarChar(50), no)
    .query(`SELECT NoSTSawmill FROM PenerimaanSTSawmill_d WHERE NoPenerimaanST = @no ORDER BY NoSTSawmill`);
  return result.recordset.map((r) => r.NoSTSawmill);
}

// Paritas SawmillApi.deletePenerimaanST tablet: hapus detail, KayuBulat_h.DateUsage = NULL, hapus header
async function remove(no) {
  const pool = await poolPromise;
  const head = await pool
    .request()
    .input("no", sql.VarChar(50), no)
    .query(`SELECT NoKayuBulat FROM PenerimaanSTSawmill_h WHERE NoPenerimaanST = @no`);
  const row = head.recordset[0];
  if (!row) throw httpError(404, "Penerimaan ST tidak ditemukan");

  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    await new sql.Request(transaction)
      .input("no", sql.VarChar(50), no)
      .query(`DELETE FROM PenerimaanSTSawmill_d WHERE NoPenerimaanST = @no`);

    if (row.NoKayuBulat) {
      await new sql.Request(transaction)
        .input("nokb", sql.VarChar(50), row.NoKayuBulat)
        .query(`UPDATE KayuBulat_h SET DateUsage = NULL WHERE NoKayuBulat = @nokb`);
    }

    await new sql.Request(transaction)
      .input("no", sql.VarChar(50), no)
      .query(`DELETE FROM PenerimaanSTSawmill_h WHERE NoPenerimaanST = @no`);

    await transaction.commit();
    return { noPenerimaanST: no };
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

module.exports = { getAll, getSTSawmillList, remove };
