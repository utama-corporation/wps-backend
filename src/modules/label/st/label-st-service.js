const { sql, poolPromise } = require("../../../core/config/db");

const MASTER_TABLE = "ST_h";
const DETAIL_TABLE = "ST_d";
const KEY_COLUMN = "NoST";

/* ============================================================
 * GET HEADER
 * ==========================================================*/

async function getHeader(noST) {
  const pool = await poolPromise;
  const req = pool.request();
  req.input("noST", sql.VarChar(50), noST);

  const result = await req.query(`
    SELECT
      A.NoST,
      A.DateCreate,
      A.VacuumDate,
      A.NoSPK,
      A.Remark,
      A.IdLokasi,
      A.HasBeenPrinted,
      A.DateUsage,
      A.StartKering,
      A.NoKayuBulat,
      A.IsBagusKulit,
      A.IdOrgTelly,
      k.Jenis AS JenisKayu,
      A.IdUOMTblLebar AS IdUOMTebal,
      A.IdUOMPanjang,
      E.NamaStickBy,
      A.IdStickBy,
      A.IdJenisKayu,
      CASE
        WHEN A.NoKayuBulat IS NULL THEN
          CASE WHEN B.NoPenerimaanST IS NOT NULL THEN B.NoPenerimaanST
               WHEN B.NoPenerimaanST IS NULL THEN C.NoPenerimaanST END
        WHEN A.NoKayuBulat IS NOT NULL THEN A.NoKayuBulat
        ELSE C.NoPenerimaanST
      END AS NoKB_ST
    FROM ${MASTER_TABLE} A
    INNER JOIN MstJenisKayu k ON k.IdJenisKayu = A.IdJenisKayu
    INNER JOIN MstStickBy E ON E.IdStickBy = A.IdStickBy
    LEFT JOIN (
      SELECT NoPenerimaanST, NoST FROM PenerimaanSTPembelian_d
    ) B ON B.NoST = A.NoST
    LEFT JOIN (
      SELECT B.NoPenerimaanST, A.NoST
      FROM BongkarSusunOutputST A
      INNER JOIN BongkarSusun_h B ON B.NoBongkarSusun = A.NoBongkarSusun
    ) C ON C.NoST = A.NoST
    WHERE A.${KEY_COLUMN} = @noST
  `);

  return result.recordset[0] || null;
}

/* ============================================================
 * GET DETAIL
 * ==========================================================*/

async function getDetail(noST) {
  const pool = await poolPromise;
  const req = pool.request();
  req.input("noST", sql.VarChar(50), noST);

  const result = await req.query(`
    SELECT NoUrut, Tebal, Lebar, Panjang, JmlhBatang
    FROM ${DETAIL_TABLE}
    WHERE ${KEY_COLUMN} = @noST
    ORDER BY NoUrut
  `);

  return result.recordset;
}

/* ============================================================
 * GET STICK
 * ==========================================================*/

async function getStick(noST) {
  const pool = await poolPromise;
  const req = pool.request();
  req.input("noST", sql.VarChar(50), noST);

  const result = await req.query(`
    SELECT A.IdGradeStick, B.NamaGradeStick, A.JumlahStick, A.Tingkat, A.StickBy, C.NamaStickBy
    FROM STStick A
    INNER JOIN MstGradeStick B ON B.IdGradeStick = A.IdGradeStick
    LEFT JOIN MstStickBy C ON C.IdStickBy = A.StickBy
    WHERE A.${KEY_COLUMN} = @noST
  `);

  return result.recordset;
}

/* ============================================================
 * LIST ALL LABELS
 * ==========================================================*/

async function getAllLabels({ search, topRow }) {
  const pool = await poolPromise;
  const req = pool.request();
  const top = parseInt(topRow, 10) || 100;

  let whereClause = "WHERE A.DateUsage IS NULL";
  if (search && search.trim() !== "") {
    req.input("search", sql.VarChar(50), `%${search.trim()}%`);
    whereClause += " AND A.NoST LIKE @search";
  }

  const result = await req.query(`
    SELECT TOP (${top})
      A.NoST,
      k.Jenis AS JenisKayu,
      A.DateCreate,
      CASE
        WHEN A.NoKayuBulat IS NULL THEN
          CASE WHEN B.NoPenerimaanST IS NOT NULL THEN B.NoPenerimaanST
               WHEN B.NoPenerimaanST IS NULL THEN C.NoPenerimaanST END
        WHEN A.NoKayuBulat IS NOT NULL THEN A.NoKayuBulat
        ELSE C.NoPenerimaanST
      END AS NoKB_ST,
      A.NoSPK,
      (C_UOM.UOM) AS UOMTebal,
      (D_UOM.UOM) AS UOMPanjang,
      E.NamaStickBy,
      A.IdLokasi,
      A.Remark,
      A.VacuumDate,
      ISNULL(VT.TotalTon, 0) AS TotalTon,
      ISNULL(VT.TotalM3, 0) AS TotalM3
    FROM ${MASTER_TABLE} A
    INNER JOIN MstJenisKayu k ON k.IdJenisKayu = A.IdJenisKayu
    INNER JOIN MstUOM C_UOM ON A.IdUOMTblLebar = C_UOM.IdUOM
    INNER JOIN MstUOM D_UOM ON A.IdUOMPanjang = D_UOM.IdUOM
    INNER JOIN MstStickBy E ON E.IdStickBy = A.IdStickBy
    LEFT JOIN (
      SELECT NoPenerimaanST, NoST FROM PenerimaanSTPembelian_d
    ) B ON B.NoST = A.NoST
    LEFT JOIN (
      SELECT B.NoPenerimaanST, A.NoST
      FROM BongkarSusunOutputST A
      INNER JOIN BongkarSusun_h B ON B.NoBongkarSusun = A.NoBongkarSusun
    ) C ON C.NoST = A.NoST
    LEFT JOIN (
      SELECT
        H.NoST,
        SUM(CASE
          WHEN H.IdUOMTblLebar = 1 AND H.IdUOMPanjang = 4 THEN
            CAST(D.Tebal AS FLOAT) * CAST(D.Lebar AS FLOAT) * CAST(D.Panjang AS FLOAT) * 304.8 * CAST(D.JmlhBatang AS FLOAT) / 1000000000.0 / 1.416
          WHEN H.IdUOMTblLebar = 3 AND H.IdUOMPanjang = 4 THEN
            CAST(D.Tebal AS FLOAT) * CAST(D.Lebar AS FLOAT) * CAST(D.Panjang AS FLOAT) * CAST(D.JmlhBatang AS FLOAT) / 7200.8
          ELSE 0
        END) AS TotalTon,
        SUM(CASE
          WHEN H.IdUOMTblLebar = 1 AND H.IdUOMPanjang = 4 THEN
            CAST(D.Tebal AS FLOAT) * CAST(D.Lebar AS FLOAT) * CAST(D.Panjang AS FLOAT) * 304.8 * CAST(D.JmlhBatang AS FLOAT) / 1000000000.0
          WHEN H.IdUOMTblLebar = 3 AND H.IdUOMPanjang = 4 THEN
            CAST(D.Tebal AS FLOAT) * CAST(D.Lebar AS FLOAT) * CAST(D.Panjang AS FLOAT) * CAST(D.JmlhBatang AS FLOAT) / 7200.8 * 1.416
          ELSE 0
        END) AS TotalM3
      FROM ${MASTER_TABLE} H
      INNER JOIN ${DETAIL_TABLE} D ON D.NoST = H.NoST
      GROUP BY H.NoST
    ) VT ON VT.NoST = A.NoST
    ${whereClause}
    ORDER BY A.NoST DESC
  `);

  return result.recordset;
}

/* ============================================================
 * GET DETAIL BY NO (list form)
 * ==========================================================*/

async function getDetailByNo(noST) {
  const pool = await poolPromise;
  const req = pool.request();
  req.input("noST", sql.VarChar(50), noST);

  const result = await req.query(`
    SELECT NoUrut, Tebal, Lebar, Panjang, JmlhBatang
    FROM ${DETAIL_TABLE}
    WHERE ${KEY_COLUMN} = @noST
    ORDER BY NoUrut
  `);

  return result.recordset;
}

/* ============================================================
 * GET HEADER FOR EDIT (returns IDs for combo selection)
 * ==========================================================*/

async function getHeaderForEdit(noST) {
  const pool = await poolPromise;
  const req = pool.request();
  req.input("noST", sql.VarChar(50), noST);

  const result = await req.query(`
    SELECT
      A.${KEY_COLUMN} AS NoST,
      A.DateCreate,
      A.NoSPK,
      A.Remark,
      A.IdLokasi,
      A.IdJenisKayu,
      A.IdUOMTblLebar AS IdUOMTebal,
      A.IdUOMPanjang,
      A.IdStickBy,
      A.IdOrgTelly,
      A.StartKering,
      A.NoKayuBulat,
      A.VacuumDate,
      A.IsBagusKulit,
      k.Jenis AS JenisKayu,
      E.NamaStickBy,
      CASE
        WHEN A.NoKayuBulat IS NULL THEN
          CASE WHEN B.NoPenerimaanST IS NOT NULL THEN B.NoPenerimaanST
               WHEN B.NoPenerimaanST IS NULL THEN C.NoPenerimaanST END
        WHEN A.NoKayuBulat IS NOT NULL THEN A.NoKayuBulat
        ELSE C.NoPenerimaanST
      END AS NoKB_ST
    FROM ${MASTER_TABLE} A
    INNER JOIN MstJenisKayu k ON k.IdJenisKayu = A.IdJenisKayu
    INNER JOIN MstStickBy E ON E.IdStickBy = A.IdStickBy
    LEFT JOIN (
      SELECT NoPenerimaanST, NoST FROM PenerimaanSTPembelian_d
    ) B ON B.NoST = A.NoST
    LEFT JOIN (
      SELECT B.NoPenerimaanST, A.NoST
      FROM BongkarSusunOutputST A
      INNER JOIN BongkarSusun_h B ON B.NoBongkarSusun = A.NoBongkarSusun
    ) C ON C.NoST = A.NoST
    WHERE A.${KEY_COLUMN} = @noST
  `);

  return result.recordset[0] || null;
}

/* ============================================================
 * UPDATE LABEL
 * ==========================================================*/

async function updateLabel(noST, data) {
  const pool = await poolPromise;
  const req = pool.request();
  req.input("noST", sql.VarChar(50), noST);
  req.input("idJenisKayu", sql.Int, data.idJenisKayu || null);
  req.input("idUOMTebal", sql.Int, data.idUOMTebal || null);
  req.input("idUOMPanjang", sql.Int, data.idUOMPanjang || null);
  req.input("idStickBy", sql.Int, data.idStickBy || null);
  req.input("noSPK", sql.VarChar(50), data.noSPK || null);
  req.input("idLokasi", sql.VarChar(50), data.idLokasi || null);
  req.input("remark", sql.VarChar(200), data.remark || null);
  req.input("idOrgTelly", sql.Int, data.idOrgTelly || null);
  req.input("startKering", sql.Bit, data.startKering ? 1 : 0);
  let isBagusKulitInt = null;
  if (data.isBagusKulit === "B") isBagusKulitInt = 1;
  else if (data.isBagusKulit === "K") isBagusKulitInt = 2;
  req.input("isBagusKulit", sql.Int, isBagusKulitInt);
  req.input("noKayuBulat", sql.VarChar(50), data.noKayuBulat || null);
  req.input("vacuumDate", sql.Date, data.vacuumDate || null);
  req.input("dateCreate", sql.Date, data.dateCreate || null);

  await req.query(`
    UPDATE ${MASTER_TABLE}
    SET IdJenisKayu = @idJenisKayu,
        IdUOMTblLebar = @idUOMTebal,
        IdUOMPanjang = @idUOMPanjang,
        IdStickBy = @idStickBy,
        NoSPK = @noSPK,
        IdLokasi = @idLokasi,
        Remark = @remark,
        IdOrgTelly = @idOrgTelly,
        StartKering = @startKering,
        IsBagusKulit = @isBagusKulit,
        NoKayuBulat = @noKayuBulat,
        VacuumDate = @vacuumDate,
        DateCreate = @dateCreate
    WHERE ${KEY_COLUMN} = @noST
  `);

  return { noST };
}

/* ============================================================
 * UPDATE DETAIL (delete old + insert new)
 * ==========================================================*/

async function updateDetail(noST, details) {
  const pool = await poolPromise;

  const delReq = pool.request();
  delReq.input("noST", sql.VarChar(50), noST);
  await delReq.query(`DELETE FROM ${DETAIL_TABLE} WHERE ${KEY_COLUMN} = @noST`);

  for (let i = 0; i < details.length; i++) {
    const d = details[i];
    const insReq = pool.request();
    insReq.input("noST", sql.VarChar(50), noST);
    insReq.input("noUrut", sql.Int, i + 1);
    insReq.input("tebal", sql.Decimal(18, 2), d.tebal || 0);
    insReq.input("lebar", sql.Decimal(18, 2), d.lebar || 0);
    insReq.input("panjang", sql.Decimal(18, 2), d.panjang || 0);
    insReq.input("jmlhBatang", sql.Int, d.jmlhBatang || 0);
    await insReq.query(`
      INSERT INTO ${DETAIL_TABLE} (${KEY_COLUMN}, NoUrut, Tebal, Lebar, Panjang, JmlhBatang)
      VALUES (@noST, @noUrut, @tebal, @lebar, @panjang, @jmlhBatang)
    `);
  }

  return { noST, detailCount: details.length };
}

/* ============================================================
 * UPDATE STICK (delete old + insert new)
 * ==========================================================*/

async function updateStick(noST, sticks, idStickBy) {
  const pool = await poolPromise;

  const delReq = pool.request();
  delReq.input("noST", sql.VarChar(50), noST);
  await delReq.query(`DELETE FROM STStick WHERE ${KEY_COLUMN} = @noST`);

  for (let i = 0; i < sticks.length; i++) {
    const s = sticks[i];
    const insReq = pool.request();
    insReq.input("noST", sql.VarChar(50), noST);
    insReq.input("idGradeStick", sql.Int, s.idGradeStick || 0);
    insReq.input("jumlahStick", sql.Int, s.jumlahStick || 0);
    insReq.input("tingkat", sql.Int, s.tingkat || 0);
    insReq.input("stickBy", sql.Int, idStickBy || null);
    await insReq.query(`
      INSERT INTO STStick (${KEY_COLUMN}, IdGradeStick, JumlahStick, Tingkat, StickBy)
      VALUES (@noST, @idGradeStick, @jumlahStick, @tingkat, @stickBy)
    `);
  }

  return { noST, stickCount: sticks.length };
}

/* ============================================================
 * DELETE LABEL (header + detail + stick)
 * ==========================================================*/

async function deleteLabel(noST) {
  const pool = await poolPromise;

  // Delete stick
  const stickReq = pool.request();
  stickReq.input("noST", sql.VarChar(50), noST);
  await stickReq.query(`DELETE FROM STStick WHERE ${KEY_COLUMN} = @noST`);

  // Delete detail
  const detReq = pool.request();
  detReq.input("noST", sql.VarChar(50), noST);
  await detReq.query(`DELETE FROM ${DETAIL_TABLE} WHERE ${KEY_COLUMN} = @noST`);

  // Delete header
  const hdrReq = pool.request();
  hdrReq.input("noST", sql.VarChar(50), noST);
  await hdrReq.query(`DELETE FROM ${MASTER_TABLE} WHERE ${KEY_COLUMN} = @noST`);

  return { noST };
}

/* ============================================================
 * GENERATE NO ST (auto increment E.000001)
 * ==========================================================*/

async function generateNoST() {
  const pool = await poolPromise;
  const result = await pool.request().query(`
    SELECT 'E.' + FORMAT(RIGHT(MAX(NoST), 6) + 1, '000000') AS NoST
    FROM ${MASTER_TABLE}
  `);
  return result.recordset[0]?.NoST || "E.000001";
}

/* ============================================================
 * LOOKUP NO KB (from KayuBulat_h)
 * ==========================================================*/

async function lookupNoKB(noKB) {
  const pool = await poolPromise;
  const req = pool.request();
  req.input("noKB", sql.VarChar(50), noKB);

  const result = await req.query(`
    SELECT
      A.NoKayuBulat,
      C.Jenis AS JenisKB,
      B.NmSupplier AS Supplier,
      A.NoTruk,
      A.NoPlat,
      A.Suket AS NoSuket,
      A.IdJenisKayu
    FROM KayuBulat_h A
    INNER JOIN MstSupplier B ON A.IdSupplier = B.IdSupplier
    INNER JOIN MstJenisKayu C ON A.IdJenisKayu = C.IdJenisKayu
    WHERE A.NoKayuBulat = @noKB
  `);

  return result.recordset[0] || null;
}

/* ============================================================
 * CREATE LABEL ST (insert ST_h + ST_d + STStick)
 * ==========================================================*/

async function createLabel(data) {
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  console.log("ST CREATE payload:", JSON.stringify(data));

  try {
    const req = new sql.Request(transaction);
    req.input("noST", sql.VarChar(50), data.noST);
    req.input("idJenisKayu", sql.Int, data.idJenisKayu || null);
    req.input("dateCreate", sql.Date, data.dateCreate || null);
    req.input("vacuumDate", sql.Date, data.vacuumDate || null);
    req.input("noKayuBulat", sql.VarChar(50), data.noKayuBulat || null);
    req.input("idUOMTebal", sql.Int, data.idUOMTebal || null);
    req.input("idUOMPanjang", sql.Int, data.idUOMPanjang || null);
    req.input("idStickBy", sql.Int, data.idStickBy || null);
    req.input("idOrgTelly", sql.Int, data.idOrgTelly || null);
    req.input("noSPK", sql.VarChar(50), data.noSPK || null);
    req.input("startKering", sql.Bit, data.startKering ? 1 : 0);
    req.input("remark", sql.VarChar(200), data.remark || null);
    let isBagusKulitInt = null;
    if (data.isBagusKulit === "B") isBagusKulitInt = 1;
    else if (data.isBagusKulit === "K") isBagusKulitInt = 2;
    req.input("isBagusKulit", sql.Int, isBagusKulitInt);

    await req.query(`
      INSERT INTO ${MASTER_TABLE}
        (NoST, IdJenisKayu, DateCreate, VacuumDate, NoKayuBulat,
         IdUOMTblLebar, IdUOMPanjang, IdStickBy, IdOrgTelly, NoSPK,
         StartKering, Remark, IdLokasi, IsBagusKulit)
      VALUES
        (@noST, @idJenisKayu, @dateCreate, @vacuumDate, @noKayuBulat,
         @idUOMTebal, @idUOMPanjang, @idStickBy, @idOrgTelly, @noSPK,
         @startKering, @remark, NULL, @isBagusKulit)
    `);

    // Insert detail rows
    if (data.details && Array.isArray(data.details)) {
      for (let i = 0; i < data.details.length; i++) {
        const d = data.details[i];
        const detReq = new sql.Request(transaction);
        detReq.input("noST", sql.VarChar(50), data.noST);
        detReq.input("noUrut", sql.Int, i + 1);
        detReq.input("tebal", sql.Decimal(18, 2), d.tebal || 0);
        detReq.input("lebar", sql.Decimal(18, 2), d.lebar || 0);
        detReq.input("panjang", sql.Decimal(18, 2), d.panjang || 0);
        detReq.input("jmlhBatang", sql.Int, d.jmlhBatang || 0);
        await detReq.query(`
          INSERT INTO ${DETAIL_TABLE} (${KEY_COLUMN}, NoUrut, Tebal, Lebar, Panjang, JmlhBatang)
          VALUES (@noST, @noUrut, @tebal, @lebar, @panjang, @jmlhBatang)
        `);
      }
    }

    // Insert stick rows - StickBy always from header
    if (data.sticks && Array.isArray(data.sticks) && data.sticks.length > 0) {
      for (const s of data.sticks) {
        const stickReq = new sql.Request(transaction);
        stickReq.input("noST", sql.VarChar(50), data.noST);
        stickReq.input("idGradeStick", sql.Int, s.idGradeStick || 0);
        stickReq.input("jumlahStick", sql.Int, s.jumlahStick || 0);
        stickReq.input("tingkat", sql.Int, s.tingkat || 0);
        stickReq.input("stickBy", sql.Int, data.idStickBy || null);
        await stickReq.query(`
          INSERT INTO STStick (${KEY_COLUMN}, IdGradeStick, JumlahStick, Tingkat, StickBy)
          VALUES (@noST, @idGradeStick, @jumlahStick, @tingkat, @stickBy)
        `);
      }
    }

    await transaction.commit();
    return { noST: data.noST };
  } catch (err) {
    console.error("ST Create Error:", err.message, err.originalError ? err.originalError.message : "");
    await transaction.rollback();
    throw err;
  }
}

/* ============================================================
 * GET MASTERS (all combo data for create/edit)
 * ==========================================================*/

async function getMasters() {
  const pool = await poolPromise;

  const [jenisKayu, stickBy, orgTelly, spk, gradeStick, uoms, lokasi] =
    await Promise.all([
      pool
        .request()
        .query(
          `SELECT IdJenisKayu, Jenis FROM MstJenisKayu WHERE IsInternal=1 AND IsST=1 ORDER BY Jenis`
        ),
      pool
        .request()
        .query(
          `SELECT IdStickBy, NamaStickBy FROM MstStickBy ORDER BY NamaStickBy`
        ),
      pool
        .request()
        .query(
          `SELECT IdOrgTelly, NamaOrgTelly FROM MstOrgTelly ORDER BY NamaOrgTelly`
        ),
      pool
        .request()
        .query(
          `SELECT A.NoSPK, A.NoSPK + ' - ' + B.Buyer AS NoSPKBuyer
           FROM MstSPK_h A INNER JOIN MstBuyer B ON B.IdBuyer = A.IdBuyer
           ORDER BY A.NoSPK`
        ),
      pool
        .request()
        .query(
          `SELECT IdGradeStick, NamaGradeStick FROM MstGradeStick ORDER BY NamaGradeStick`
        ),
      pool
        .request()
        .query(
          `SELECT IdUOM, UOM FROM MstUOM ORDER BY UOM`
        ),
      pool
        .request()
        .query(
          `SELECT CAST(IdLokasi AS VARCHAR(20)) AS IdLokasi FROM MstLokasi ORDER BY IdLokasi`
        ),
    ]);

  return {
    jenisKayu: jenisKayu.recordset,
    stickBy: stickBy.recordset,
    orgTelly: orgTelly.recordset,
    spk: spk.recordset,
    gradeStick: gradeStick.recordset,
    uom: uoms.recordset,
    lokasi: lokasi.recordset,
  };
}

module.exports = {
  getHeader,
  getDetail,
  getStick,
  getAllLabels,
  getDetailByNo,
  getHeaderForEdit,
  updateLabel,
  updateDetail,
  deleteLabel,
  generateNoST,
  lookupNoKB,
  createLabel,
  getMasters,
};
