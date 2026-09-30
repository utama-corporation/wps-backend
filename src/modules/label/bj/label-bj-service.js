const moment = require("moment");
const { sql, poolPromise } = require("../../../core/config/db");

const MASTER_TABLE = "BarangJadi_h";
const DETAIL_TABLE = "BarangJadi_d";
const KEY_COLUMN = "NoBJ";

/* ============================================================
 * QUERY (for PDF)
 * ==========================================================*/

async function getHeader(noBJ) {
  const pool = await poolPromise;
  const req = pool.request();
  req.input("noBJ", sql.VarChar(50), noBJ);

  const result = await req.query(`
    SELECT
      h.${KEY_COLUMN}      AS NoBJ,
      h.DateCreate,
      h.Jam,
      h.NoSPK,
      h.IsReject,
      h.IsLembur,
      h.DateUsage,
      k.Jenis              AS JenisKayu,
      g.NamaBarangJadi     AS NamaBJ,
      t.NamaOrgTelly       AS Telly,
      m.NamaMesin          AS NamaMesin,
      o.NoProduksi         AS NoProduksi,
      s.NoBongkarSusun     AS NoBongkarSusun
    FROM ${MASTER_TABLE} h
    LEFT JOIN (
      SELECT NoProduksi, NoBJ FROM PackingProduksiOutput
    ) o ON o.NoBJ = h.${KEY_COLUMN}
    LEFT JOIN (
      SELECT NoProduksi, IdMesin FROM PackingProduksi_h
    ) p ON p.NoProduksi = o.NoProduksi
    LEFT JOIN BongkarSusunOutputBarangJadi s ON s.NoBJ = h.${KEY_COLUMN}
    LEFT JOIN MstMesin m       ON m.IdMesin = p.IdMesin
    LEFT JOIN MstBarangJadi g  ON g.IdBarangJadi = h.IdBarangJadi
    LEFT JOIN MstOrgTelly t    ON t.IdOrgTelly = h.IdOrgTelly
    LEFT JOIN MstJenisKayu k   ON k.IdJenisKayu = h.IdJenisKayu
    WHERE h.${KEY_COLUMN} = @noBJ
  `);

  return result.recordset[0] || null;
}

async function getDetail(noBJ) {
  const pool = await poolPromise;
  const req = pool.request();
  req.input("noBJ", sql.VarChar(50), noBJ);

  const result = await req.query(`
    SELECT Tebal, Lebar, Panjang, JmlhBatang
    FROM ${DETAIL_TABLE}
    WHERE ${KEY_COLUMN} = @noBJ
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
    whereClause += " AND h.NoBJ LIKE @search";
  }

  const result = await req.query(`
    SELECT TOP (${top})
      h.NoBJ,
      h.DateCreate,
      h.Jam,
      h.IsReject,
      h.IsLembur,
      k.Jenis AS JenisKayu,
      g.NamaBarangJadi AS NamaBJ,
      t.NamaOrgTelly AS Telly,
      h.NoSPK
    FROM ${MASTER_TABLE} h
    LEFT JOIN MstJenisKayu k ON k.IdJenisKayu = h.IdJenisKayu
    LEFT JOIN MstBarangJadi g ON g.IdBarangJadi = h.IdBarangJadi
    LEFT JOIN MstOrgTelly t ON t.IdOrgTelly = h.IdOrgTelly
    ${whereClause}
    ORDER BY h.NoBJ DESC
  `);

  return result.recordset;
}

/* ============================================================
 * GET DETAIL BY NO BJ (for V2 list form)
 * ==========================================================*/

async function getDetailByNo(noBJ) {
  const pool = await poolPromise;
  const req = pool.request();
  req.input("noBJ", sql.VarChar(50), noBJ);

  const result = await req.query(`
    SELECT NoUrut, Tebal, Lebar, Panjang, JmlhBatang
    FROM ${DETAIL_TABLE}
    WHERE ${KEY_COLUMN} = @noBJ
    ORDER BY NoUrut
  `);

  return result.recordset;
}

/* ============================================================
 * GET HEADER FOR EDIT (returns IDs for combo selection)
 * ==========================================================*/

async function getHeaderForEdit(noBJ) {
  const pool = await poolPromise;
  const req = pool.request();
  req.input("noBJ", sql.VarChar(50), noBJ);

  const result = await req.query(`
    SELECT
      h.${KEY_COLUMN}      AS NoBJ,
      h.DateCreate,
      h.Jam,
      h.NoSPK,
      h.IdJenisKayu,
      h.IdBarangJadi,
      h.IdOrgTelly,
      h.IsReject,
      h.IsLembur,
      k.Jenis              AS JenisKayu,
      g.NamaBarangJadi     AS NamaBJ,
      t.NamaOrgTelly       AS Telly
    FROM ${MASTER_TABLE} h
    INNER JOIN MstJenisKayu k ON k.IdJenisKayu = h.IdJenisKayu
    LEFT JOIN MstBarangJadi g ON g.IdBarangJadi = h.IdBarangJadi
    LEFT JOIN MstOrgTelly t  ON t.IdOrgTelly = h.IdOrgTelly
    WHERE h.${KEY_COLUMN} = @noBJ
  `);

  return result.recordset[0] || null;
}

/* ============================================================
 * UPDATE LABEL
 * ==========================================================*/

async function updateLabel(noBJ, data) {
  const pool = await poolPromise;
  const req = pool.request();
  req.input("noBJ", sql.VarChar(50), noBJ);
  req.input("idJenisKayu", sql.Int, data.idJenisKayu || null);
  req.input("idBarangJadi", sql.Int, data.idBarangJadi || null);
  req.input("idOrgTelly", sql.Int, data.idOrgTelly || null);
  req.input("noSPK", sql.VarChar(50), data.noSPK || null);
  req.input("isReject", sql.Bit, data.isReject ? 1 : 0);
  req.input("isLembur", sql.Bit, data.isLembur ? 1 : 0);
  req.input("jam", sql.VarChar(10), data.jam || null);

  await req.query(`
    UPDATE ${MASTER_TABLE}
    SET IdJenisKayu = @idJenisKayu,
        IdBarangJadi = @idBarangJadi,
        IdOrgTelly = @idOrgTelly,
        NoSPK = @noSPK,
        IsReject = @isReject,
        IsLembur = @isLembur,
        Jam = @jam
    WHERE ${KEY_COLUMN} = @noBJ
  `);

  return { noBJ };
}

/* ============================================================
 * UPDATE DETAIL (delete old + insert new)
 * ==========================================================*/

async function updateDetail(noBJ, details) {
  const pool = await poolPromise;

  const delReq = pool.request();
  delReq.input("noBJ", sql.VarChar(50), noBJ);
  await delReq.query(`DELETE FROM ${DETAIL_TABLE} WHERE ${KEY_COLUMN} = @noBJ`);

  for (let i = 0; i < details.length; i++) {
    const d = details[i];
    const insReq = pool.request();
    insReq.input("noBJ", sql.VarChar(50), noBJ);
    insReq.input("noUrut", sql.Int, i + 1);
    insReq.input("tebal", sql.Decimal(18, 2), d.tebal || 0);
    insReq.input("lebar", sql.Decimal(18, 2), d.lebar || 0);
    insReq.input("panjang", sql.Decimal(18, 2), d.panjang || 0);
    insReq.input("jmlhBatang", sql.Int, d.jmlhBatang || 0);
    await insReq.query(`
      INSERT INTO ${DETAIL_TABLE} (${KEY_COLUMN}, NoUrut, Tebal, Lebar, Panjang, JmlhBatang)
      VALUES (@noBJ, @noUrut, @tebal, @lebar, @panjang, @jmlhBatang)
    `);
  }

  return { noBJ, detailCount: details.length };
}

/* ============================================================
 * DELETE LABEL (header + detail + output refs)
 * ==========================================================*/

async function deleteLabel(noBJ) {
  const pool = await poolPromise;

  const outReq = pool.request();
  outReq.input("noBJ", sql.VarChar(50), noBJ);
  await outReq.query(`DELETE FROM PackingProduksiOutput WHERE NoBJ = @noBJ`);

  const detReq = pool.request();
  detReq.input("noBJ", sql.VarChar(50), noBJ);
  await detReq.query(`DELETE FROM ${DETAIL_TABLE} WHERE ${KEY_COLUMN} = @noBJ`);

  const hdrReq = pool.request();
  hdrReq.input("noBJ", sql.VarChar(50), noBJ);
  await hdrReq.query(`DELETE FROM ${MASTER_TABLE} WHERE ${KEY_COLUMN} = @noBJ`);

  return { noBJ };
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
 * DATA LABEL (bentuk siap render ke template PDF)
 * ==========================================================*/

async function getLabelData(noBJ) {
  const header = await getHeader(noBJ);
  if (!header) {
    const err = new Error(`Label BJ ${noBJ} tidak ditemukan`);
    err.statusCode = 404;
    throw err;
  }

  const detail = await getDetail(noBJ);
  if (!detail.length) {
    const err = new Error(`Detail label BJ ${noBJ} tidak ditemukan`);
    err.statusCode = 404;
    throw err;
  }

  return {
    noBJ: header.NoBJ,
    jenisKayu: header.JenisKayu || "-",
    namaBJ: header.NamaBJ || "-",
    fisik: header.FisikSingkatan || header.FisikNama || "-",
    tanggal: header.DateCreate ? moment(header.DateCreate).format("DD-MMM-YYYY") : "-",
    jam: header.Jam ? moment.utc(header.Jam).format("HH:mm") : "-",
    mmYY: header.DateCreate ? moment(header.DateCreate).format("MMYY") : "-",
    telly: firstToken(header.Telly),
    noSPK: header.NoSPK || "-",
    mesinSusun: resolveMesinSusun(header),
    remark: "",
    isReject: truthy(header.IsReject),
    isLembur: truthy(header.IsLembur),
    hasBeenPrinted: 0,
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
