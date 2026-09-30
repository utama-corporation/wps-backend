const moment = require("moment");
const { sql, poolPromise } = require("../../../core/config/db");

const MASTER_TABLE = "Moulding_h";
const DETAIL_TABLE = "Moulding_d";
const KEY_COLUMN = "NoMoulding";

/* ============================================================
 * QUERY
 * ==========================================================*/

async function getHeader(noMoulding) {
  const pool = await poolPromise;
  const req = pool.request();
  req.input("noMoulding", sql.VarChar(50), noMoulding);

  const result = await req.query(`
    SELECT
      h.${KEY_COLUMN}      AS NoMoulding,
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
      SELECT NoProduksi, NoMoulding FROM MouldingProduksiOutput      
    ) o ON o.NoMoulding = h.${KEY_COLUMN}
    LEFT JOIN (
      SELECT NoProduksi, IdMesin FROM FJProduksi_h
    ) p ON p.NoProduksi = o.NoProduksi
    LEFT JOIN BongkarSusunOutputMoulding s ON s.NoMoulding = h.${KEY_COLUMN}
    LEFT JOIN MstMesin m       ON m.IdMesin = p.IdMesin
    LEFT JOIN MstGrade g       ON g.IdGrade = h.IdGrade
    LEFT JOIN MstOrgTelly t    ON t.IdOrgTelly = h.IdOrgTelly
    LEFT JOIN MstJenisKayu k   ON k.IdJenisKayu = h.IdJenisKayu
    LEFT JOIN MstWarehouse wf  ON wf.IdWarehouse = h.IdFisik
    WHERE h.${KEY_COLUMN} = @noMoulding
  `);

  return result.recordset[0] || null;
}

async function getDetail(noMoulding) {
  const pool = await poolPromise;
  const req = pool.request();
  req.input("noMoulding", sql.VarChar(50), noMoulding);

  const result = await req.query(`
    SELECT Tebal, Lebar, Panjang, JmlhBatang
    FROM ${DETAIL_TABLE}
    WHERE ${KEY_COLUMN} = @noMoulding
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
    whereClause += " AND h.NoMoulding LIKE @search";
  }

  const result = await req.query(`
    SELECT TOP (${top})
      h.NoMoulding,
      h.DateCreate,
      h.Jam,
      h.IsReject,
      h.IsLembur,
      h.HasBeenPrinted,
      k.Jenis AS JenisKayu,
      g.NamaGrade AS Grade,
      t.NamaOrgTelly AS Telly,
      h.NoSPK,
      h.IdLokasi
    FROM ${MASTER_TABLE} h
    INNER JOIN MstJenisKayu k ON k.IdJenisKayu = h.IdJenisKayu
    LEFT JOIN MstGrade g ON g.IdGrade = h.IdGrade
    LEFT JOIN MstOrgTelly t ON t.IdOrgTelly = h.IdOrgTelly
    ${whereClause}
    ORDER BY h.NoMoulding DESC
  `);

  return result.recordset;
}

/* ============================================================
 * GET DETAIL BY NO MOULDING (for V2 list form)
 * ==========================================================*/

async function getDetailByNo(noMoulding) {
  const pool = await poolPromise;
  const req = pool.request();
  req.input("noMoulding", sql.VarChar(50), noMoulding);

  const result = await req.query(`
    SELECT NoUrut, Tebal, Lebar, Panjang, JmlhBatang
    FROM ${DETAIL_TABLE}
    WHERE ${KEY_COLUMN} = @noMoulding
    ORDER BY NoUrut
  `);

  return result.recordset;
}

/* ============================================================
 * GET HEADER FOR EDIT (returns IDs for combo selection)
 * ==========================================================*/

async function getHeaderForEdit(noMoulding) {
  const pool = await poolPromise;
  const req = pool.request();
  req.input("noMoulding", sql.VarChar(50), noMoulding);

  const result = await req.query(`
    SELECT
      h.${KEY_COLUMN}      AS NoMoulding,
      h.DateCreate,
      h.Jam,
      h.NoSPK,
      h.NoSPKAsal,
      h.IdLokasi,
      h.IdJenisKayu,
      h.IdGrade,
      h.IdOrgTelly,
      h.IsReject,
      h.IsLembur,
      h.Remark,
      k.Jenis              AS JenisKayu,
      g.NamaGrade          AS Grade,
      t.NamaOrgTelly       AS Telly
    FROM ${MASTER_TABLE} h
    INNER JOIN MstJenisKayu k ON k.IdJenisKayu = h.IdJenisKayu
    LEFT JOIN MstGrade g     ON g.IdGrade = h.IdGrade
    LEFT JOIN MstOrgTelly t  ON t.IdOrgTelly = h.IdOrgTelly
    WHERE h.${KEY_COLUMN} = @noMoulding
  `);

  return result.recordset[0] || null;
}

/* ============================================================
 * UPDATE LABEL
 * ==========================================================*/

async function updateLabel(noMoulding, data) {
  const pool = await poolPromise;
  const req = pool.request();
  req.input("noMoulding", sql.VarChar(50), noMoulding);
  req.input("idJenisKayu", sql.Int, data.idJenisKayu || null);
  req.input("idGrade", sql.Int, data.idGrade || null);
  req.input("idOrgTelly", sql.Int, data.idOrgTelly || null);
  req.input("noSPK", sql.VarChar(50), data.noSPK || null);
  req.input("idLokasi", sql.VarChar(50), data.idLokasi || null);
  req.input("isReject", sql.Bit, data.isReject ? 1 : 0);
  req.input("isLembur", sql.Bit, data.isLembur ? 1 : 0);
  req.input("jam", sql.VarChar(10), data.jam || null);

  await req.query(`
    UPDATE ${MASTER_TABLE}
    SET IdJenisKayu = @idJenisKayu,
        IdGrade = @idGrade,
        IdOrgTelly = @idOrgTelly,
        NoSPK = @noSPK,
        IdLokasi = @idLokasi,
        IsReject = @isReject,
        IsLembur = @isLembur,
        Jam = @jam
    WHERE ${KEY_COLUMN} = @noMoulding
  `);

  return { noMoulding };
}

/* ============================================================
 * UPDATE DETAIL (delete old + insert new)
 * ==========================================================*/

async function updateDetail(noMoulding, details) {
  const pool = await poolPromise;

  const delReq = pool.request();
  delReq.input("noMoulding", sql.VarChar(50), noMoulding);
  await delReq.query(`DELETE FROM ${DETAIL_TABLE} WHERE ${KEY_COLUMN} = @noMoulding`);

  for (let i = 0; i < details.length; i++) {
    const d = details[i];
    const insReq = pool.request();
    insReq.input("noMoulding", sql.VarChar(50), noMoulding);
    insReq.input("noUrut", sql.Int, i + 1);
    insReq.input("tebal", sql.Decimal(18, 2), d.tebal || 0);
    insReq.input("lebar", sql.Decimal(18, 2), d.lebar || 0);
    insReq.input("panjang", sql.Decimal(18, 2), d.panjang || 0);
    insReq.input("jmlhBatang", sql.Int, d.jmlhBatang || 0);
    await insReq.query(`
      INSERT INTO ${DETAIL_TABLE} (${KEY_COLUMN}, NoUrut, Tebal, Lebar, Panjang, JmlhBatang)
      VALUES (@noMoulding, @noUrut, @tebal, @lebar, @panjang, @jmlhBatang)
    `);
  }

  return { noMoulding, detailCount: details.length };
}

/* ============================================================
 * DELETE LABEL (header + detail + output refs)
 * ==========================================================*/

async function deleteLabel(noMoulding) {
  const pool = await poolPromise;

  const outReq = pool.request();
  outReq.input("noMoulding", sql.VarChar(50), noMoulding);
  await outReq.query(`DELETE FROM MouldingProduksiOutput WHERE NoMoulding = @noMoulding`);

  const detReq = pool.request();
  detReq.input("noMoulding", sql.VarChar(50), noMoulding);
  await detReq.query(`DELETE FROM ${DETAIL_TABLE} WHERE ${KEY_COLUMN} = @noMoulding`);

  const hdrReq = pool.request();
  hdrReq.input("noMoulding", sql.VarChar(50), noMoulding);
  await hdrReq.query(`DELETE FROM ${MASTER_TABLE} WHERE ${KEY_COLUMN} = @noMoulding`);

  return { noMoulding };
}

/* ============================================================
 * PERHITUNGAN (samakan dengan S4S.java: m3() & jumlahpcs())
 * ==========================================================*/

function toNumber(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

// Mirror S4S.java m3(): per baris floor 4 desimal, lalu dijumlahkan, format "0.0000".
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

// Mirror S4S.java jumlahpcs(): jumlah kolom pcs.
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

async function getLabelData(noMoulding) {
  const header = await getHeader(noMoulding);
  if (!header) {
    const err = new Error(`Label Moulding ${noMoulding} tidak ditemukan`);
    err.statusCode = 404;
    throw err;
  }

  const detail = await getDetail(noMoulding);
  if (!detail.length) {
    const err = new Error(`Detail label Moulding ${noMoulding} tidak ditemukan`);
    err.statusCode = 404;
    throw err;
  }

  return {
    noMoulding: header.NoMoulding,
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
