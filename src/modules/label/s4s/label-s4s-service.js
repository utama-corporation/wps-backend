const { claimPrint, releasePrint } = require("../../../core/utils/print-limit");
const moment = require("moment");
const { sql, poolPromise } = require("../../../core/config/db");
const { assertPeriodeTerbuka } = require("../../../core/utils/periode-lock");

const MASTER_TABLE = "S4S_h";
const DETAIL_TABLE = "S4S_d";
const KEY_COLUMN = "NoS4S";

/** Tanggal label (S4S_h.DateCreate) — dasar cek kunci periode sebelum CUD. */
async function getTanggalLabel(noS4S) {
  const pool = await poolPromise;
  const r = await pool
    .request()
    .input("noS4S", sql.VarChar(50), noS4S)
    .query(`SELECT DateCreate FROM ${MASTER_TABLE} WHERE ${KEY_COLUMN} = @noS4S`);
  return r.recordset[0]?.DateCreate ?? null;
}

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
      b.Buyer             AS Buyer,
      h.Remark,
      h.IsReject,
      h.IsLembur,
      h.IsRepair,
      h.IsReproses,
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
    LEFT JOIN MstSPK_h sp      ON sp.NoSPK = h.NoSPK
    LEFT JOIN MstBuyer b       ON b.IdBuyer = sp.IdBuyer
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

async function getAllLabels({ search, topRow, includeTotal = false }) {
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
    ORDER BY h.NoS4S DESC;
    ${includeTotal ? `
      SELECT COUNT_BIG(*) AS Total
      FROM ${MASTER_TABLE} h
      INNER JOIN MstJenisKayu k ON k.IdJenisKayu = h.IdJenisKayu
      ${whereClause};
    ` : ''}
  `);

  if (includeTotal) {
    return { items: result.recordset, total: Number(result.recordsets[1][0].Total) };
  }
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
      h.IsRepair,
      h.IsReproses,
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

/** Request di dalam transaksi `tx` (withAudit) atau pool bila tx tidak diberikan. */
async function newRequest(tx) {
  if (tx) return tx.request();
  const pool = await poolPromise;
  return pool.request();
}

async function updateLabel(noS4S, data, tx) {
  await assertPeriodeTerbuka(await getTanggalLabel(noS4S));
  const req = await newRequest(tx);
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
  req.input("isRepair", sql.Bit, data.isRepair ? 1 : 0);
  req.input("isReproses", sql.Bit, data.isReproses ? 1 : 0);
  req.input("jam", sql.VarChar(10), data.jam || null);

  // Kondisi WHERE "ada yang berubah" -> tidak ada UPDATE (dan tidak ada audit)
  // bila nilainya sama persis dengan yang sudah tersimpan.
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
        IsRepair = @isRepair,
        IsReproses = @isReproses,
        Jam = @jam
    WHERE ${KEY_COLUMN} = @noS4S
      AND (
           ISNULL(IdJenisKayu, -1) <> ISNULL(@idJenisKayu, -1)
        OR ISNULL(IdGrade, -1) <> ISNULL(@idGrade, -1)
        OR ISNULL(IdOrgTelly, -1) <> ISNULL(@idOrgTelly, -1)
        OR ISNULL(NoSPK, '') <> ISNULL(@noSPK, '')
        OR ISNULL(NoSPKAsal, '') <> ISNULL(@noSPKAsal, '')
        OR ISNULL(IdLokasi, '') <> ISNULL(@idLokasi, '')
        OR ISNULL(NoSTAsal, '') <> ISNULL(@noSTAsal, '')
        OR ISNULL(IsReject, 0) <> @isReject
        OR ISNULL(IsLembur, 0) <> @isLembur
        OR ISNULL(IsRepair, 0) <> @isRepair
        OR ISNULL(IsReproses, 0) <> @isReproses
        OR ISNULL(CONVERT(time(0), Jam), '00:00:00') <> ISNULL(TRY_CONVERT(time(0), @jam), '00:00:00')
      )
  `);

  return { noS4S };
}

/* ============================================================
 * UPDATE DETAIL (selektif per NoUrut: UPDATE / INSERT / DELETE)
 * ==========================================================*/

async function updateDetail(noS4S, details, tx) {
  const readReq = await newRequest(tx);
  readReq.input("noS4S", sql.VarChar(50), noS4S);
  const existing = (
    await readReq.query(`
      SELECT NoUrut,
             CONVERT(decimal(18,3), Tebal)   AS Tebal,
             CONVERT(decimal(18,3), Lebar)   AS Lebar,
             CONVERT(decimal(18,3), Panjang) AS Panjang,
             JmlhBatang
      FROM ${DETAIL_TABLE}
      WHERE ${KEY_COLUMN} = @noS4S
    `)
  ).recordset;
  const byUrut = new Map(existing.map((r) => [Number(r.NoUrut), r]));
  const num = (v) => Number(v || 0);

  for (let i = 0; i < details.length; i++) {
    const d = details[i];
    const noUrut = i + 1;
    const cur = byUrut.get(noUrut);

    const same =
      cur &&
      num(cur.Tebal) === num(d.tebal) &&
      num(cur.Lebar) === num(d.lebar) &&
      num(cur.Panjang) === num(d.panjang) &&
      Number(cur.JmlhBatang || 0) === Number(d.jmlhBatang || 0);
    if (same) continue;

    const wReq = await newRequest(tx);
    wReq.input("noS4S", sql.VarChar(50), noS4S);
    wReq.input("noUrut", sql.Int, noUrut);
    wReq.input("tebal", sql.Decimal(18, 3), d.tebal || 0);
    wReq.input("lebar", sql.Decimal(18, 3), d.lebar || 0);
    wReq.input("panjang", sql.Decimal(18, 3), d.panjang || 0);
    wReq.input("jmlhBatang", sql.Int, d.jmlhBatang || 0);
    if (cur) {
      await wReq.query(`
        UPDATE ${DETAIL_TABLE}
        SET Tebal = @tebal, Lebar = @lebar, Panjang = @panjang, JmlhBatang = @jmlhBatang
        WHERE ${KEY_COLUMN} = @noS4S AND NoUrut = @noUrut
      `);
    } else {
      await wReq.query(`
        INSERT INTO ${DETAIL_TABLE} (${KEY_COLUMN}, NoUrut, Tebal, Lebar, Panjang, JmlhBatang)
        VALUES (@noS4S, @noUrut, @tebal, @lebar, @panjang, @jmlhBatang)
      `);
    }
  }

  // Baris berlebih (daftar baru lebih pendek)
  if (existing.length > details.length) {
    const delReq = await newRequest(tx);
    delReq.input("noS4S", sql.VarChar(50), noS4S);
    delReq.input("maxUrut", sql.Int, details.length);
    await delReq.query(
      `DELETE FROM ${DETAIL_TABLE} WHERE ${KEY_COLUMN} = @noS4S AND NoUrut > @maxUrut`,
    );
  }

  return { noS4S, detailCount: details.length };
}

/* ============================================================
 * DELETE LABEL (header + detail + output refs)
 * ==========================================================*/

async function deleteLabel(noS4S, tx) {
  await assertPeriodeTerbuka(await getTanggalLabel(noS4S));

  const statements = [
    `DELETE FROM S4SProduksiOutput WHERE NoS4S = @noS4S`,
    `DELETE FROM CCAkhirProduksiOutputS4S WHERE NoS4S = @noS4S`,
    `DELETE FROM ${DETAIL_TABLE} WHERE ${KEY_COLUMN} = @noS4S`,
    `DELETE FROM ${MASTER_TABLE} WHERE ${KEY_COLUMN} = @noS4S`,
  ];
  for (const q of statements) {
    const r = await newRequest(tx);
    r.input("noS4S", sql.VarChar(50), noS4S);
    await r.query(q);
  }

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

function formatNoSPK(header) {
  const noSPK = (header.NoSPK || "").trim();
  const buyer = (header.Buyer || "").trim();
  if (!noSPK) return buyer || "-";
  return buyer ? `${noSPK} - ${buyer}` : noSPK;
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
    noSPK: formatNoSPK(header),
    mesinSusun: resolveMesinSusun(header),
    remark: (header.Remark || "").trim(),
    isReject: truthy(header.IsReject),
    isLembur: truthy(header.IsLembur),
    isRepair: truthy(header.IsRepair),
    isReproses: truthy(header.IsReproses),
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

/** Tambah hitungan cetak label (S4S_h.HasBeenPrinted) + waktu cetak terakhir. */
/** Klaim 1 jatah cetak (maks MAX_PRINT); 403 bila batas tercapai. */
function incrementPrintStatus(no, req) {
  return claimPrint({ table: MASTER_TABLE, keyCol: KEY_COLUMN, no, req });
}

/** Kembalikan jatah bila PDF gagal dibuat. */
function releasePrintStatus(no, req) {
  return releasePrint({ table: MASTER_TABLE, keyCol: KEY_COLUMN, no, req });
}

module.exports = {
  releasePrintStatus,
  incrementPrintStatus,
  getLabelData,
  getAllLabels,
  getDetailByNo,
  getHeaderForEdit,
  updateLabel,
  updateDetail,
  deleteLabel,
};
