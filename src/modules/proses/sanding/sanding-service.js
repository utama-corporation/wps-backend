const { sql, poolPromise } = require("../../../core/config/db");
// Health check
const MASTER_TABLE = "Sanding_h";
const DETAIL_TABLE = "Sanding_d";
const KEY_COLUMN = "NoSanding";
// Health check
async function getStock(tgl) {
  const pool = await poolPromise;
  const req = pool.request();
  req.input("tgl", sql.Date, tgl);
  const result = await req.query(`
    SELECT
      (CASE WHEN A.IdFisik IS NULL OR A.IdFisik = 0 THEN G.Singkatan ELSE ISNULL(H.Singkatan, G.Singkatan) END + ' ' + C.Jenis + ' ' + I.NamaGrade) AS Jenis,
      SUM(ROUND(
        COALESCE(TRY_CONVERT(DECIMAL(18,4), B.Tebal), 0) *
        COALESCE(TRY_CONVERT(DECIMAL(18,4), B.Lebar), 0) *
        COALESCE(TRY_CONVERT(DECIMAL(18,4), B.Panjang), 0) *
        COALESCE(TRY_CONVERT(DECIMAL(18,4), B.JmlhBatang), 0) / 1000000000.0 *
        CASE WHEN A.IdUOMTblLebar = 3 THEN 645.16 ELSE 1 END *
        CASE WHEN A.IdUOMPanjang = 4 THEN 304.8 ELSE 1 END, 4, 1)) AS TotalM3,
      MIN(A.DateCreate) AS TglTerlama
    FROM ${MASTER_TABLE} A
    INNER JOIN ${DETAIL_TABLE} B ON B.${KEY_COLUMN} = A.${KEY_COLUMN}
    INNER JOIN MstJenisKayu C ON C.IdJenisKayu = A.IdJenisKayu
    INNER JOIN MstGrade I ON I.IdGrade = A.IdGrade
    INNER JOIN MstWarehouse G ON G.IdWarehouse = A.IdWarehouse
    LEFT JOIN MstWarehouse H ON H.IdWarehouse = A.IdFisik
    WHERE A.DateCreate <= @tgl AND (A.DateUsage > @tgl OR A.DateUsage IS NULL)
    GROUP BY CASE WHEN A.IdFisik IS NULL OR A.IdFisik = 0 THEN G.Singkatan ELSE ISNULL(H.Singkatan, G.Singkatan) END + ' ' + C.Jenis + ' ' + I.NamaGrade
    ORDER BY Jenis
  `);
  return result.recordset;
}

async function getLabels(jenis, tgl) {
  const pool = await poolPromise;
  const req = pool.request();
  req.input("tgl", sql.Date, tgl);
  req.input("jenis", sql.VarChar(250), jenis);
  const result = await req.query(`
    SELECT
      A.${KEY_COLUMN} AS NoLabel,
      A.DateCreate,
      (CASE WHEN A.IdFisik IS NULL OR A.IdFisik = 0 THEN G.Singkatan ELSE ISNULL(H.Singkatan, G.Singkatan) END + ' ' + C.Jenis + ' ' + I.NamaGrade) AS Jenis,
      I.NamaGrade,
      D.Tebal,
      D.Lebar,
      D.Panjang,
      D.JmlhBatang,
      ROUND(
        COALESCE(TRY_CONVERT(DECIMAL(18,4), D.Tebal), 0) *
        COALESCE(TRY_CONVERT(DECIMAL(18,4), D.Lebar), 0) *
        COALESCE(TRY_CONVERT(DECIMAL(18,4), D.Panjang), 0) *
        COALESCE(TRY_CONVERT(DECIMAL(18,4), D.JmlhBatang), 0) / 1000000000.0 *
        CASE WHEN A.IdUOMTblLebar = 3 THEN 645.16 ELSE 1 END *
        CASE WHEN A.IdUOMPanjang = 4 THEN 304.8 ELSE 1 END, 4, 1) AS M3
    FROM ${MASTER_TABLE} A
    INNER JOIN ${DETAIL_TABLE} D ON D.${KEY_COLUMN} = A.${KEY_COLUMN}
    INNER JOIN MstJenisKayu C ON C.IdJenisKayu = A.IdJenisKayu
    INNER JOIN MstGrade I ON I.IdGrade = A.IdGrade
    INNER JOIN MstWarehouse G ON G.IdWarehouse = A.IdWarehouse
    LEFT JOIN MstWarehouse H ON H.IdWarehouse = A.IdFisik
    WHERE (CASE WHEN A.IdFisik IS NULL OR A.IdFisik = 0 THEN G.Singkatan ELSE ISNULL(H.Singkatan, G.Singkatan) END + ' ' + C.Jenis + ' ' + I.NamaGrade) = @jenis
      AND A.DateCreate <= @tgl AND (A.DateUsage > @tgl OR A.DateUsage IS NULL)
    ORDER BY A.DateCreate ASC, A.${KEY_COLUMN}
  `);
  return result.recordset;
}

async function getOldestDate() {
  const pool = await poolPromise;
  const result = await pool.request().query(
    `SELECT MIN(DateCreate) AS oldestDate FROM ${MASTER_TABLE}`
  );
  return result.recordset[0] ? result.recordset[0].oldestDate : null;
}

module.exports = { getStock, getLabels, getOldestDate };
