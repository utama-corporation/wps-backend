const { sql, poolPromise } = require("../../../core/config/db");

async function getStock(tgl) {
  const pool = await poolPromise;
  const req = pool.request();
  req.input("tgl", sql.Date, tgl);
  const result = await req.query(`
    SELECT
      ('BJ ' + C.Jenis + ' ' + D.NamaBarangJadi) AS Jenis,
      SUM(ROUND(B.Tebal * B.Lebar * B.Panjang * B.JmlhBatang / 1000000000, 4, 1)) AS TotalM3,
      MIN(A.DateCreate) AS TglTerlama
    FROM BarangJadi_h A
    INNER JOIN BarangJadi_d B ON B.NoBJ = A.NoBJ
    INNER JOIN MstJenisKayu C ON C.IdJenisKayu = A.IdJenisKayu
    INNER JOIN MstBarangJadi D ON D.IdBarangJadi = A.IdBarangJadi
    WHERE A.DateCreate <= @tgl AND (A.DateUsage IS NULL OR A.DateUsage > @tgl)
    GROUP BY C.Jenis, D.NamaBarangJadi
    ORDER BY Jenis
  `);
  return result.recordset;
}
// Health check
async function getLabels(jenis, tgl) {
  const pool = await poolPromise;
  const req = pool.request();
  req.input("tgl", sql.Date, tgl);
  req.input("jenis", sql.VarChar(250), jenis);
  const result = await req.query(`
    SELECT
      A.NoBJ AS NoLabel,
      A.DateCreate,
      ('BJ ' + C.Jenis + ' ' + D.NamaBarangJadi) AS Jenis,
      B.Tebal,
      B.Lebar,
      B.Panjang,
      B.JmlhBatang,
      ROUND(B.Tebal * B.Lebar * B.Panjang * B.JmlhBatang / 1000000000, 4, 1) AS M3
    FROM BarangJadi_h A
    INNER JOIN BarangJadi_d B ON B.NoBJ = A.NoBJ
    INNER JOIN MstJenisKayu C ON C.IdJenisKayu = A.IdJenisKayu
    INNER JOIN MstBarangJadi D ON D.IdBarangJadi = A.IdBarangJadi
    WHERE ('BJ ' + C.Jenis + ' ' + D.NamaBarangJadi) = @jenis
      AND A.DateCreate <= @tgl AND (A.DateUsage IS NULL OR A.DateUsage > @tgl)
    ORDER BY A.DateCreate ASC, A.NoBJ
  `);
  return result.recordset;
}

async function getOldestDate() {
  const pool = await poolPromise;
  const result = await pool.request().query(
    `SELECT MIN(DateCreate) AS oldestDate FROM BarangJadi_h`
  );
  return result.recordset[0] ? result.recordset[0].oldestDate : null;
}

module.exports = { getStock, getLabels, getOldestDate };
