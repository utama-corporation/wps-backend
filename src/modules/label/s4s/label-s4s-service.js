const moment = require("moment");
const { sql, poolPromise } = require("../../../core/config/db");

const MASTER_TABLE = "S4S_h";
const DETAIL_TABLE = "S4S_d";
const KEY_COLUMN = "NoS4S";

/* ============================================================
 * QUERY
 * ==========================================================*/

async function getHeader(noS4S) {
  const pool = await poolPromise;
  const req = pool.request();
  req.input("noS4S", sql.VarChar(50), noS4S);

  const result = await req.query(`
    SELECT
      h.${KEY_COLUMN}      AS NoS4S,
      h.DateCreate,
      h.Jam,
      h.NoSPK,
      h.Remark,
      h.IsReject,
      h.IsLembur,
      h.HasBeenPrinted,
      h.DateUsage,
      k.Jenis              AS JenisKayu,
      g.NamaGrade          AS Grade,
      t.NamaOrgTelly       AS Telly,
      wf.Singkatan         AS FisikSingkatan,
      wf.NamaWarehouse     AS FisikNama,
      m.NamaMesin          AS NamaMesin,
      o.NoProduksi         AS NoProduksi,
      s.NoBongkarSusun     AS NoBongkarSusun
    FROM ${MASTER_TABLE} h
    LEFT JOIN (
      SELECT NoProduksi, NoS4S FROM S4SProduksiOutput
      UNION
      SELECT NoProduksi, NoS4S FROM CCAkhirProduksiOutputS4S
    ) o ON o.NoS4S = h.${KEY_COLUMN}
    LEFT JOIN (
      SELECT NoProduksi, IdMesin FROM S4SProduksi_h
      UNION
      SELECT NoProduksi, IdMesin FROM CCAkhirProduksi_h
    ) p ON p.NoProduksi = o.NoProduksi
    LEFT JOIN BongkarSusunOutputS4S s ON s.NoS4S = h.${KEY_COLUMN}
    LEFT JOIN MstMesin m       ON m.IdMesin = p.IdMesin
    LEFT JOIN MstGrade g       ON g.IdGrade = h.IdGrade
    LEFT JOIN MstOrgTelly t    ON t.IdOrgTelly = h.IdOrgTelly
    LEFT JOIN MstJenisKayu k   ON k.IdJenisKayu = h.IdJenisKayu
    LEFT JOIN MstWarehouse wf  ON wf.IdWarehouse = h.IdFisik
    WHERE h.${KEY_COLUMN} = @noS4S
  `);

  return result.recordset[0] || null;
}

async function getDetail(noS4S) {
  const pool = await poolPromise;
  const req = pool.request();
  req.input("noS4S", sql.VarChar(50), noS4S);

  const result = await req.query(`
    SELECT Tebal, Lebar, Panjang, JmlhBatang
    FROM ${DETAIL_TABLE}
    WHERE ${KEY_COLUMN} = @noS4S
    ORDER BY NoUrut
  `);

  return result.recordset;
}

/* ============================================================
 * LIST ALL LABELS (header only, for V2 list form)
 * ==========================================================*/

async function getAllLabels({ search, topRow }) {
  const pool = await poolPromise;
  const req = pool.request();
  const top = parseInt(topRow, 10) || 100;

  let whereClause = "WHERE h.DateUsage IS NULL";
  if (search && search.trim() !== "") {
    req.input("search", sql.VarChar(50), `%${search.trim()}%`);
    whereClause += " AND h.NoS4S LIKE @search";
  }

  const result = await req.query(`
    SELECT TOP (${top})
      h.NoS4S,
      h.DateCreate,
      h.Jam,
      h.IsReject,
      h.IsLembur,
      h.HasBeenPrinted,
      k.Jenis AS JenisKayu,
      g.NamaGrade AS Grade,
      t.NamaOrgTelly AS Telly,
      h.NoSPK,
      h.NoSPKAsal,
      h.IdLokasi,
      h.NoSTAsal
    FROM ${MASTER_TABLE} h
    INNER JOIN MstJenisKayu k ON k.IdJenisKayu = h.IdJenisKayu
    LEFT JOIN MstGrade g ON g.IdGrade = h.IdGrade
    LEFT JOIN MstOrgTelly t ON t.IdOrgTelly = h.IdOrgTelly
    ${whereClause}
    ORDER BY h.NoS4S DESC
  `);

  return result.recordset;
}

/* ============================================================
 * GET DETAIL BY NO S4S (for V2 list form)
 * ==========================================================*/

async function getDetailByNo(noS4S) {
  const pool = await poolPromise;
  const req = pool.request();
  req.input("noS4S", sql.VarChar(50), noS4S);

  const result = await req.query(`
    SELECT NoUrut, Tebal, Lebar, Panjang, JmlhBatang
    FROM ${DETAIL_TABLE}
    WHERE ${KEY_COLUMN} = @noS4S
    ORDER BY NoUrut
  `);

  return result.recordset;
}

/* ============================================================
 * GET HEADER FOR EDIT (returns IDs for combo selection)
 * ==========================================================*/

async function getHeaderForEdit(noS4S) {
  const pool = await poolPromise;
  const req = pool.request();
  req.input("noS4S", sql.VarChar(50), noS4S);

  const result = await req.query(`
    SELECT
      h.${KEY_COLUMN}      AS NoS4S,
      h.DateCreate,
      h.Jam,
      h.NoSPK,
      h.NoSPKAsal,
      h.IdLokasi,
      h.NoSTAsal,
      h.IdJenisKayu,
      h.IdGrade,
      h.IdOrgTelly,
      h.IsReject,
      h.IsLembur,
      h.Remark,
      k.Jenis              AS JenisKayu,
      g.NamaGrade          AS Grade,
      t.NamaOrgTelly       AS Telly,
      wf.Singkatan         AS FisikSingkatan,
      wf.NamaWarehouse     AS FisikNama
    FROM ${MASTER_TABLE} h
    INNER JOIN MstJenisKayu k ON k.IdJenisKayu = h.IdJenisKayu
    LEFT JOIN MstGrade g     ON g.IdGrade = h.IdGrade
    LEFT JOIN MstOrgTelly t  ON t.IdOrgTelly = h.IdOrgTelly
    LEFT JOIN MstWarehouse wf ON wf.IdWarehouse = h.IdFisik
    WHERE h.${KEY_COLUMN} = @noS4S
  `);

  return result.recordset[0] || null;
}

/* ============================================================
 * UPDATE LABEL
 * ==========================================================*/

async function updateLabel(noS4S, data) {
  const pool = await poolPromise;
  const req = pool.request();
  req.input("noS4S", sql.VarChar(50), noS4S);
  req.input("idJenisKayu", sql.Int, data.idJenisKayu || null);
  req.input("idGrade", sql.Int, data.idGrade || null);
  req.input("idOrgTelly", sql.Int, data.idOrgTelly || null);
  req.input("noSPK", sql.VarChar(50), data.noSPK || null);
  req.input("noSPKAsal", sql.VarChar(50), data.noSPKAsal || null);
  req.input("idLokasi", sql.VarChar(50), data.idLokasi || null);
  req.input("noSTAsal", sql.VarChar(50), data.noSTAsal || null);
  req.input("isReject", sql.Bit, data.isReject ? 1 : 0);
  req.input("isLembur", sql.Bit, data.isLembur ? 1 : 0);
  req.input("jam", sql.VarChar(10), data.jam || null);

  await req.query(`
    UPDATE ${MASTER_TABLE}
    SET IdJenisKayu = @idJenisKayu,
        IdGrade = @idGrade,
        IdOrgTelly = @idOrgTelly,
        NoSPK = @noSPK,
        NoSPKAsal = @noSPKAsal,
        IdLokasi = @idLokasi,
        NoSTAsal = @noSTAsal,
        IsReject = @isReject,
        IsLembur = @isLembur,
        Jam = @jam
    WHERE ${KEY_COLUMN} = @noS4S
  `);

  return { noS4S };
}

/* ============================================================
 * UPDATE DETAIL (delete old + insert new)
 * ==========================================================*/

async function updateDetail(noS4S, details) {
  const pool = await poolPromise;

  // Delete old details
  const delReq = pool.request();
  delReq.input("noS4S", sql.VarChar(50), noS4S);
  await delReq.query(`DELETE FROM ${DETAIL_TABLE} WHERE ${KEY_COLUMN} = @noS4S`);

  // Insert new details
  for (let i = 0; i < details.length; i++) {
    const d = details[i];
    const insReq = pool.request();
    insReq.input("noS4S", sql.VarChar(50), noS4S);
    insReq.input("noUrut", sql.Int, i + 1);
    insReq.input("tebal", sql.Decimal(18, 2), d.tebal || 0);
    insReq.input("lebar", sql.Decimal(18, 2), d.lebar || 0);
    insReq.input("panjang", sql.Decimal(18, 2), d.panjang || 0);
    insReq.input("jmlhBatang", sql.Int, d.jmlhBatang || 0);
    await insReq.query(`
      INSERT INTO ${DETAIL_TABLE} (${KEY_COLUMN}, NoUrut, Tebal, Lebar, Panjang, JmlhBatang)
      VALUES (@noS4S, @noUrut, @tebal, @lebar, @panjang, @jmlhBatang)
    `);
  }

  return { noS4S, detailCount: details.length };
}

/* ============================================================
 * DELETE LABEL (header + detail + output refs)
 * ==========================================================*/

async function deleteLabel(noS4S) {
  const pool = await poolPromise;

  // Delete output references first
  const outReq1 = pool.request();
  outReq1.input("noS4S", sql.VarChar(50), noS4S);
  await outReq1.query(`DELETE FROM S4SProduksiOutput WHERE NoS4S = @noS4S`);

  const outReq2 = pool.request();
  outReq2.input("noS4S", sql.VarChar(50), noS4S);
  await outReq2.query(`DELETE FROM CCAkhirProduksiOutputS4S WHERE NoS4S = @noS4S`);

  // Delete detail
  const detReq = pool.request();
  detReq.input("noS4S", sql.VarChar(50), noS4S);
  await detReq.query(`DELETE FROM ${DETAIL_TABLE} WHERE ${KEY_COLUMN} = @noS4S`);

  // Delete header
  const hdrReq = pool.request();
  hdrReq.input("noS4S", sql.VarChar(50), noS4S);
  await hdrReq.query(`DELETE FROM ${MASTER_TABLE} WHERE ${KEY_COLUMN} = @noS4S`);

  return { noS4S };
}

/* ============================================================
 * PERHITUNGAN
 * ==========================================================*/

function toNumber(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

function computeM3(detail) {
  let total = 0;
  for (const row of detail) {
    const tebal = toNumber(row.Tebal);
    const lebar = toNumber(row.Lebar);
    const panjang = toNumber(row.Panjang);
    const pcs = parseInt(row.JmlhBatang, 10) || 0;
    let rowM3 = (tebal * lebar * panjang * pcs) / 1000000000.0;
    rowM3 = Math.floor(rowM3 * 10000) / 10000;
    total += rowM3;
  }
  return total.toFixed(4);
}

function computeTotalPcs(detail) {
  return detail.reduce((sum, row) => sum + (parseInt(row.JmlhBatang, 10) || 0), 0);
}

function firstToken(s) {
  if (!s) return "-";
  const t = String(s).trim().split(/\s+/)[0];
  return t || "-";
}

function truthy(v) {
  return v === true || v === 1 || v === "1";
}

function resolveMesinSusun(header) {
  if (header.NamaMesin) {
    return header.NoProduksi
      ? `${header.NamaMesin} - ${header.NoProduksi}`
      : header.NamaMesin;
  }
  if (header.NoBongkarSusun) return header.NoBongkarSusun;
  return "-";
}

/* ============================================================
 * DATA LABEL
 * ==========================================================*/

async function getLabelData(noS4S) {
  const header = await getHeader(noS4S);
  if (!header) {
    const err = new Error(`Label S4S ${noS4S} tidak ditemukan`);
    err.statusCode = 404;
    throw err;
  }

  const detail = await getDetail(noS4S);
  if (!detail.length) {
    const err = new Error(`Detail label S4S ${noS4S} tidak ditemukan`);
    err.statusCode = 404;
    throw err;
  }

  return {
    noS4S: header.NoS4S,
    jenisKayu: header.JenisKayu || "-",
    grade: header.Grade || "-",
    fisik: header.FisikSingkatan || header.FisikNama || "-",
    tanggal: header.DateCreate ? moment(header.DateCreate).format("DD-MMM-YYYY") : "-",
    jam: header.Jam ? moment.utc(header.Jam).format("HH:mm") : "-",
    mmYY: header.DateCreate ? moment(header.DateCreate).format("MMYY") : "-",
    telly: firstToken(header.Telly),
    noSPK: header.NoSPK || "-",
    mesinSusun: resolveMesinSusun(header),
    remark: (header.Remark || "").trim(),
    isReject: truthy(header.IsReject),
    isLembur: truthy(header.IsLembur),
    hasBeenPrinted: parseInt(header.HasBeenPrinted, 10) || 0,
    dateUsage: header.DateUsage || null,
    detail: detail.map((r) => ({
      tebal: r.Tebal,
      lebar: r.Lebar,
      panjang: r.Panjang,
      pcs: r.JmlhBatang,
    })),
    totalPcs: computeTotalPcs(detail),
    totalM3: computeM3(detail),
  };
}

module.exports = {
  getLabelData,
  getAllLabels,
  getDetailByNo,
  getHeaderForEdit,
  updateLabel,
  updateDetail,
  deleteLabel,
};
