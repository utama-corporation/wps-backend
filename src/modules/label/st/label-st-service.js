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
      A.IsSLP,
      A.IsSticked,
      A.IsUpah,
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
      END AS NoKB_ST,
      C.NoBongkarSusun,
      P.NoPenerimaanST AS NoPenerimaanSTPembelian,
      U.NoPenerimaanST AS NoPenerimaanSTUpah
    FROM ${MASTER_TABLE} A
    LEFT JOIN MstJenisKayu k ON k.IdJenisKayu = A.IdJenisKayu
    LEFT JOIN MstStickBy E ON E.IdStickBy = A.IdStickBy
    LEFT JOIN (
      SELECT NoPenerimaanST, NoST FROM PenerimaanSTPembelian_d
    ) B ON B.NoST = A.NoST
    LEFT JOIN (
      SELECT B.NoPenerimaanST, B.NoBongkarSusun, A.NoST
      FROM BongkarSusunOutputST A
      INNER JOIN BongkarSusun_h B ON B.NoBongkarSusun = A.NoBongkarSusun
    ) C ON C.NoST = A.NoST
    LEFT JOIN PenerimaanSTPembelian_d P ON P.NoST = A.NoST
    LEFT JOIN PenerimaanSTUpah_d U ON U.NoST = A.NoST
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
 * LIST LABELS (paginated, paritas tablet: search NoST/NoSPK,
 * DateUsage IS NULL, EXISTS detail)
 * ==========================================================*/

const LIST_FROM_WHERE = `
    FROM ${MASTER_TABLE} A
    LEFT JOIN MstJenisKayu k ON k.IdJenisKayu = A.IdJenisKayu
    LEFT JOIN MstStickBy s ON s.IdStickBy = A.IdStickBy
    LEFT JOIN MstOrgTelly t ON t.IdOrgTelly = A.IdOrgTelly
    LEFT JOIN MstUOM C_UOM ON A.IdUOMTblLebar = C_UOM.IdUOM
    LEFT JOIN MstUOM D_UOM ON A.IdUOMPanjang = D_UOM.IdUOM
    LEFT JOIN PenerimaanSTPembelian_d P ON P.NoST = A.NoST
    LEFT JOIN PenerimaanSTUpah_d U ON U.NoST = A.NoST
    LEFT JOIN BongkarSusunOutputST BO ON BO.NoST = A.NoST
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
`;

function applyListWhere(req, search) {
  let whereClause = "WHERE A.DateUsage IS NULL AND EXISTS (SELECT 1 FROM ST_d d WHERE d.NoST = A.NoST)";
  if (search && search.trim() !== "") {
    req.input("search", sql.VarChar(50), `%${search.trim()}%`);
    whereClause += " AND (A.NoST LIKE @search OR A.NoSPK LIKE @search)";
  }
  return whereClause;
}

async function getAllLabels({ search, topRow, page, pageSize } = {}) {
  const pool = await poolPromise;
  const req = pool.request();
  const whereClause = applyListWhere(req, search);

  const selectCols = `
    SELECT
      A.NoST,
      k.Jenis AS JenisKayu,
      A.DateCreate,
      A.NoKayuBulat,
      CASE
        WHEN A.NoKayuBulat IS NULL THEN
          CASE WHEN B.NoPenerimaanST IS NOT NULL THEN B.NoPenerimaanST
               WHEN B.NoPenerimaanST IS NULL THEN C.NoPenerimaanST END
        WHEN A.NoKayuBulat IS NOT NULL THEN A.NoKayuBulat
        ELSE C.NoPenerimaanST
      END AS NoKB_ST,
      A.NoSPK,
      A.IdOrgTelly,
      t.NamaOrgTelly,
      A.Remark,
      A.IsSLP,
      A.VacuumDate,
      A.IdLokasi,
      A.IdUOMTblLebar,
      A.IdUOMPanjang,
      P.NoPenerimaanST AS NoPenerimaanSTPembelian,
      U.NoPenerimaanST AS NoPenerimaanSTUpah,
      BO.NoBongkarSusun,
      (C_UOM.UOM) AS UOMTebal,
      (D_UOM.UOM) AS UOMPanjang,
      s.NamaStickBy,
      ISNULL(VT.TotalTon, 0) AS TotalTon,
      ISNULL(VT.TotalM3, 0) AS TotalM3
  `;

  const pageNum = parseInt(page, 10);
  const sizeNum = parseInt(pageSize, 10) || 50;

  if (pageNum && pageNum > 0) {
    const countReq = pool.request();
    const countWhere = applyListWhere(countReq, search);
    const countResult = await countReq.query(
      `SELECT COUNT(*) AS total ${LIST_FROM_WHERE} ${countWhere}`
    );
    const total = countResult.recordset[0]?.total || 0;

    req.input("offset", sql.Int, (pageNum - 1) * sizeNum);
    req.input("fetch", sql.Int, sizeNum);
    const result = await req.query(`
      ${selectCols}
      ${LIST_FROM_WHERE}
      ${whereClause}
      ORDER BY A.NoST DESC
      OFFSET @offset ROWS FETCH NEXT @fetch ROWS ONLY
    `);
    return { items: result.recordset, total, page: pageNum, pageSize: sizeNum };
  }

  const top = parseInt(topRow, 10) || 100;
  const result = await req.query(`
    SELECT TOP (${top})
      ${selectCols.replace(/^\s*SELECT\s*/i, "")}
    ${LIST_FROM_WHERE}
    ${whereClause}
    ORDER BY A.NoST DESC
  `);
  return { items: result.recordset, total: result.recordset.length };
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
      A.IsSLP,
      A.IsSticked,
      A.IsUpah,
      A.HasBeenPrinted,
      k.Jenis AS JenisKayu,
      E.NamaStickBy,
      t.NamaOrgTelly,
      CASE
        WHEN A.NoKayuBulat IS NULL THEN
          CASE WHEN B.NoPenerimaanST IS NOT NULL THEN B.NoPenerimaanST
               WHEN B.NoPenerimaanST IS NULL THEN C.NoPenerimaanST END
        WHEN A.NoKayuBulat IS NOT NULL THEN A.NoKayuBulat
        ELSE C.NoPenerimaanST
      END AS NoKB_ST,
      C.NoBongkarSusun,
      P.NoPenerimaanST AS NoPenerimaanSTPembelian,
      U.NoPenerimaanST AS NoPenerimaanSTUpah
    FROM ${MASTER_TABLE} A
    LEFT JOIN MstJenisKayu k ON k.IdJenisKayu = A.IdJenisKayu
    LEFT JOIN MstStickBy E ON E.IdStickBy = A.IdStickBy
    LEFT JOIN MstOrgTelly t ON t.IdOrgTelly = A.IdOrgTelly
    LEFT JOIN (
      SELECT NoPenerimaanST, NoST FROM PenerimaanSTPembelian_d
    ) B ON B.NoST = A.NoST
    LEFT JOIN (
      SELECT B.NoPenerimaanST, B.NoBongkarSusun, A.NoST
      FROM BongkarSusunOutputST A
      INNER JOIN BongkarSusun_h B ON B.NoBongkarSusun = A.NoBongkarSusun
    ) C ON C.NoST = A.NoST
    LEFT JOIN PenerimaanSTPembelian_d P ON P.NoST = A.NoST
    LEFT JOIN PenerimaanSTUpah_d U ON U.NoST = A.NoST
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
  req.input("remark", sql.VarChar(200), data.remark || null);
  req.input("idOrgTelly", sql.Int, data.idOrgTelly || null);
  req.input("startKering", sql.Bit, data.startKering ? 1 : 0);
  req.input("isBagusKulit", sql.Int, toIsBagusKulit(data.isBagusKulit));
  req.input("noKayuBulat", sql.VarChar(50), data.noKayuBulat || null);
  req.input("vacuumDate", sql.Date, data.vacuumDate || null);
  req.input("dateCreate", sql.Date, data.dateCreate || null);
  req.input("isSLP", sql.Bit, data.isSLP ? 1 : 0);
  req.input("isSticked", sql.Bit, data.isSticked ? 1 : 0);
  req.input("isUpah", sql.Bit, data.isUpah ? 1 : 0);

  // Paritas tablet: IdLokasi = L01 jika StartKering 0, selain itu NULL
  req.input("idLokasi", sql.VarChar(20), data.startKering ? null : "L01");

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
        DateCreate = @dateCreate,
        IsSLP = @isSLP,
        IsSticked = @isSticked,
        IsUpah = @isUpah
    WHERE ${KEY_COLUMN} = @noST
  `);

  return { noST };
}

/* ============================================================
 * UPDATE DETAIL (delete old + insert new)
 * ==========================================================*/

/* paritas tablet: Map keyed IdGradeStick — id sama, nilai terakhir menang */
function dedupeSticks(sticks) {
  const map = new Map();
  for (const s of sticks || []) {
    const id = s && s.idGradeStick != null ? Number(s.idGradeStick) : 0;
    map.set(id, { idGradeStick: id, jumlahStick: s ? s.jumlahStick : 0 });
  }
  return Array.from(map.values());
}

async function updateDetail(noST, details) {
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const delReq = new sql.Request(transaction);
    delReq.input("noST", sql.VarChar(50), noST);
    await delReq.query(`DELETE FROM ${DETAIL_TABLE} WHERE ${KEY_COLUMN} = @noST`);

    for (let i = 0; i < details.length; i++) {
      const d = details[i];
      const insReq = new sql.Request(transaction);
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

    await transaction.commit();
  } catch (e) {
    try { await transaction.rollback(); } catch (_) {}
    throw e;
  }

  return { noST, detailCount: details.length };
}

/* ============================================================
 * UPDATE STICK (delete old + insert new)
 * ==========================================================*/

async function updateStick(noST, sticks) {
  const pool = await poolPromise;
  const deduped = dedupeSticks(sticks);
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const delReq = new sql.Request(transaction);
    delReq.input("noST", sql.VarChar(50), noST);
    await delReq.query(`DELETE FROM STStick WHERE ${KEY_COLUMN} = @noST`);

    for (const s of deduped) {
      const insReq = new sql.Request(transaction);
      insReq.input("noST", sql.VarChar(50), noST);
      insReq.input("idGradeStick", sql.Int, s.idGradeStick || 0);
      insReq.input("jumlahStick", sql.VarChar(50), String(s.jumlahStick ?? 0));
      await insReq.query(`
        INSERT INTO STStick (${KEY_COLUMN}, IdGradeStick, JumlahStick)
        VALUES (@noST, @idGradeStick, @jumlahStick)
      `);
    }

    await transaction.commit();
  } catch (e) {
    try { await transaction.rollback(); } catch (_) {}
    throw e;
  }

  return { noST, stickCount: deduped.length };
}

/* ============================================================
 * DELETE LABEL (paritas tablet: bongkar → grade → detail →
 * penerimaan pembelian → penerimaan upah → header, dalam trx)
 * ==========================================================*/

async function deleteLabel(noST) {
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const tables = [
      "BongkarSusunOutputST",
      "STStick",
      DETAIL_TABLE,
      "PenerimaanSTPembelian_d",
      "PenerimaanSTUpah_d",
      MASTER_TABLE,
    ];

    for (const table of tables) {
      const req = new sql.Request(transaction);
      req.input("noST", sql.VarChar(50), noST);
      await req.query(`DELETE FROM ${table} WHERE ${KEY_COLUMN} = @noST`);
    }

    await transaction.commit();
    return { noST };
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
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

function toIsBagusKulit(value) {
  if (value === "B" || value === 1 || value === "1") return 1;
  if (value === "K" || value === 2 || value === "2") return 2;
  return 0;
}

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
    req.input("isBagusKulit", sql.Int, toIsBagusKulit(data.isBagusKulit));
    req.input("isSLP", sql.Bit, data.isSLP ? 1 : 0);
    req.input("isSticked", sql.Bit, data.isSticked ? 1 : 0);
    req.input("isUpah", sql.Bit, data.isUpah ? 1 : 0);
    // Paritas tablet: IdLokasi = L01 jika StartKering 0, selain itu NULL
    req.input("idLokasi", sql.VarChar(20), data.startKering ? null : "L01");

    await req.query(`
      INSERT INTO ${MASTER_TABLE}
        (NoST, IdJenisKayu, DateCreate, VacuumDate, NoKayuBulat,
         IdUOMTblLebar, IdUOMPanjang, IdStickBy, IdOrgTelly, NoSPK,
         StartKering, Remark, IdLokasi, IsBagusKulit, IsSLP, IsSticked, IsUpah)
      VALUES
        (@noST, @idJenisKayu, @dateCreate, @vacuumDate, @noKayuBulat,
         @idUOMTebal, @idUOMPanjang, @idStickBy, @idOrgTelly, @noSPK,
         @startKering, @remark, @idLokasi, @isBagusKulit, @isSLP, @isSticked, @isUpah)
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

    // Insert grade rows - paritas tablet: (NoST, IdGradeStick, JumlahStick)
    // paritas tablet Map<IdGradeStick, JumlahStick>: id sama → nilai terakhir menang
    if (data.sticks && Array.isArray(data.sticks) && data.sticks.length > 0) {
      for (const s of dedupeSticks(data.sticks)) {
        const stickReq = new sql.Request(transaction);
        stickReq.input("noST", sql.VarChar(50), data.noST);
        stickReq.input("idGradeStick", sql.Int, s.idGradeStick || 0);
        stickReq.input("jumlahStick", sql.VarChar(50), String(s.jumlahStick ?? 0));
        await stickReq.query(`
          INSERT INTO STStick (${KEY_COLUMN}, IdGradeStick, JumlahStick)
          VALUES (@noST, @idGradeStick, @jumlahStick)
        `);
      }
    }

    // Link bongkar susun (paritas tablet)
    if (data.noBongkarSusun) {
      const bsReq = new sql.Request(transaction);
      bsReq.input("noST", sql.VarChar(50), data.noST);
      bsReq.input("noBongkarSusun", sql.VarChar(50), data.noBongkarSusun);
      await bsReq.query(`
        INSERT INTO BongkarSusunOutputST (NoST, NoBongkarSusun)
        VALUES (@noST, @noBongkarSusun)
      `);
    }

    // Link penerimaan ST pembelian (paritas tablet labelVersion 1)
    if (data.noPenerimaanSTPembelian) {
      const penReq = new sql.Request(transaction);
      penReq.input("noST", sql.VarChar(50), data.noST);
      penReq.input("noPen", sql.VarChar(50), data.noPenerimaanSTPembelian);
      await penReq.query(`
        INSERT INTO PenerimaanSTPembelian_d (NoPenerimaanST, NoST)
        VALUES (@noPen, @noST)
      `);
    }

    // Link penerimaan ST upah (paritas tablet labelVersion 2)
    if (data.noPenerimaanSTUpah) {
      const upahReq = new sql.Request(transaction);
      upahReq.input("noST", sql.VarChar(50), data.noST);
      upahReq.input("noPen", sql.VarChar(50), data.noPenerimaanSTUpah);
      await upahReq.query(`
        INSERT INTO PenerimaanSTUpah_d (NoPenerimaanST, NoST)
        VALUES (@noPen, @noST)
      `);
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
      // Paritas tablet getJenisKayuSTList: WHERE IsST = 1 (plus ORDER BY untuk web)
      pool
        .request()
        .query(
          `SELECT IdJenisKayu, Jenis, IsUpah FROM MstJenisKayu WHERE IsST = 1 ORDER BY Jenis`
        ),
      // Paritas tablet getStickByList: WHERE Enable = 1
      pool
        .request()
        .query(
          `SELECT IdStickBy, NamaStickBy FROM MstStickBy WHERE Enable = 1 ORDER BY NamaStickBy`
        ),
      // Paritas tablet getTellyList: join MstUsername, Enable = 1
      pool
        .request()
        .query(
          `SELECT A.IdOrgTelly, A.NamaOrgTelly
           FROM MstOrgTelly A
           INNER JOIN (
             SELECT Username, FName + ' ' + LName AS NamaTelly
             FROM MstUsername
           ) B ON B.NamaTelly = A.NamaOrgTelly
           WHERE A.Enable = 1
           ORDER BY A.NamaOrgTelly`
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
          `SELECT IdUOM, UOM FROM MstUOM ORDER BY IdUOM`
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

/* ============================================================
 * TELLY DEFAULT (paritas tablet getTellyByIdUsername)
 * ==========================================================*/

async function getTellyDefault(idUsername) {
  if (!idUsername) return null;
  const pool = await poolPromise;
  const req = pool.request();
  req.input("idUsername", sql.VarChar(50), String(idUsername));

  const result = await req.query(`
    SELECT A.IdOrgTelly, A.NamaOrgTelly
    FROM MstOrgTelly A
    INNER JOIN (
      SELECT Username, FName + ' ' + LName AS NamaTelly
      FROM MstUsername
      WHERE IdUsername = @idUsername
    ) B ON B.NamaTelly = A.NamaOrgTelly
    WHERE A.Enable = 1
  `);

  return result.recordset[0] || null;
}

/* ============================================================
 * SUSUN LIST (paritas tablet MasterApi.getSusunList)
 * ==========================================================*/

async function getSusunList(date) {
  const pool = await poolPromise;
  const req = pool.request();
  req.input("date", sql.Date, date);

  const result = await req.query(`
    SELECT NoBongkarSusun
    FROM BongkarSusun_h
    WHERE CONVERT(date, Tanggal) = CONVERT(date, @date)
    ORDER BY NoBongkarSusun DESC
  `);

  return result.recordset;
}

/* ============================================================
 * OUTPUT BY DATE (paritas tablet getNoSTByDateCreate)
 * ==========================================================*/

async function getOutputByDate(date) {
  const pool = await poolPromise;
  const req = pool.request();
  req.input("date", sql.Date, date);

  const result = await req.query(`
    SELECT NoST, HasBeenPrinted
    FROM ${MASTER_TABLE}
    WHERE CONVERT(date, DateCreate) = CONVERT(date, @date)
    ORDER BY NoST DESC
  `);

  return result.recordset;
}

/* ============================================================
 * PRINT STATUS (paritas tablet updatePrintStatus / reset)
 * ==========================================================*/

async function incrementPrintStatus(noST) {
  const pool = await poolPromise;
  const req = pool.request();
  req.input("noST", sql.VarChar(50), noST);

  const result = await req.query(`
    UPDATE ${MASTER_TABLE}
    SET HasBeenPrinted = COALESCE(HasBeenPrinted, 0) + 1,
        LastPrintDate = GETDATE()
    WHERE ${KEY_COLUMN} = @noST
  `);

  return result.rowsAffected[0] > 0;
}

async function resetPrintStatus(noST) {
  const pool = await poolPromise;
  const req = pool.request();
  req.input("noST", sql.VarChar(50), noST);

  const result = await req.query(`
    UPDATE ${MASTER_TABLE}
    SET HasBeenPrinted = 0, LastPrintDate = NULL
    WHERE ${KEY_COLUMN} = @noST
  `);

  return result.rowsAffected[0] > 0;
}

/* ============================================================
 * REPLACE LINK BONGKAR SUSUN (update: delete + insert, paritas)
 * ==========================================================*/

async function replaceBongkarSusun(noST, noBongkarSusun) {
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const delReq = new sql.Request(transaction);
    delReq.input("noST", sql.VarChar(50), noST);
    await delReq.query(`DELETE FROM BongkarSusunOutputST WHERE NoST = @noST`);

    if (noBongkarSusun) {
      const insReq = new sql.Request(transaction);
      insReq.input("noST", sql.VarChar(50), noST);
      insReq.input("noBongkarSusun", sql.VarChar(50), noBongkarSusun);
      await insReq.query(`
        INSERT INTO BongkarSusunOutputST (NoST, NoBongkarSusun)
        VALUES (@noST, @noBongkarSusun)
      `);
    }

    await transaction.commit();
    return { noST, noBongkarSusun: noBongkarSusun || null };
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

/* ============================================================
 * PDF DATA (label ST versi web, paritas isi label tablet)
 * ==========================================================*/

async function getPdfData(noST) {
  const pool = await poolPromise;
  const req = pool.request();
  req.input("noST", sql.VarChar(50), noST);

  const headerResult = await req.query(`
    SELECT
      A.NoST,
      A.DateCreate,
      A.VacuumDate,
      A.NoSPK,
      A.Remark,
      A.NoKayuBulat,
      A.IsSLP,
      A.IsSticked,
      A.IsUpah,
      A.HasBeenPrinted,
      A.IdUOMTblLebar,
      A.IdUOMPanjang,
      k.Jenis AS JenisKayu,
      t.NamaOrgTelly,
      s.NamaStickBy,
      kb.NoTruk,
      kb.NoPlat,
      sup.NmSupplier AS Supplier,
      P.NoPenerimaanST AS NoPenerimaanSTPembelian
    FROM ${MASTER_TABLE} A
    LEFT JOIN MstJenisKayu k ON k.IdJenisKayu = A.IdJenisKayu
    LEFT JOIN MstOrgTelly t ON t.IdOrgTelly = A.IdOrgTelly
    LEFT JOIN MstStickBy s ON s.IdStickBy = A.IdStickBy
    LEFT JOIN KayuBulat_h kb ON kb.NoKayuBulat = A.NoKayuBulat
    LEFT JOIN MstSupplier sup ON sup.IdSupplier = kb.IdSupplier
    LEFT JOIN PenerimaanSTPembelian_d P ON P.NoST = A.NoST
    WHERE A.${KEY_COLUMN} = @noST
  `);

  const header = headerResult.recordset[0];
  if (!header) return null;

  const detReq = pool.request();
  detReq.input("noST", sql.VarChar(50), noST);
  const detailResult = await detReq.query(`
    SELECT Tebal, Lebar, Panjang, JmlhBatang
    FROM ${DETAIL_TABLE}
    WHERE ${KEY_COLUMN} = @noST
    ORDER BY NoUrut
  `);

  return { header, detail: detailResult.recordset };
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
  updateStick,
  replaceBongkarSusun,
  deleteLabel,
  generateNoST,
  lookupNoKB,
  createLabel,
  getMasters,
  getTellyDefault,
  getSusunList,
  getOutputByDate,
  incrementPrintStatus,
  resetPrintStatus,
  getPdfData,
};
