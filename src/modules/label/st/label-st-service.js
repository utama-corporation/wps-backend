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
    SELECT A.IdGradeStick, B.NamaGradeStick, A.JumlahStick, A.Tingkat
    FROM STStick A
    INNER JOIN MstGradeStick B ON B.IdGradeStick = A.IdGradeStick
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
      A.VacuumDate
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

  await req.query(`
    UPDATE ${MASTER_TABLE}
    SET IdJenisKayu = @idJenisKayu,
        IdUOMTblLebar = @idUOMTebal,
        IdUOMPanjang = @idUOMPanjang,
        IdStickBy = @idStickBy,
        NoSPK = @noSPK,
        IdLokasi = @idLokasi,
        Remark = @remark
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

async function updateStick(noST, sticks) {
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
    await insReq.query(`
      INSERT INTO STStick (${KEY_COLUMN}, IdGradeStick, JumlahStick, Tingkat)
      VALUES (@noST, @idGradeStick, @jumlahStick, @tingkat)
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
};
