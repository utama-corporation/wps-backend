const { sql, poolPromise } = require("../../../core/config/db");
const { assertPeriodeTerbuka } = require("../../../core/utils/periode-lock");

/** Tanggal produksi (SandingProduksi_h.Tanggal) — dasar cek kunci periode. */
async function getTanggalProduksi(noProduksi) {
  if (!noProduksi) return null;
  const pool = await poolPromise;
  const r = await pool
    .request()
    .input("np", sql.VarChar(20), noProduksi)
    .query("SELECT Tanggal FROM SandingProduksi_h WHERE NoProduksi = @np");
  return r.recordset[0]?.Tanggal ?? null;
}

async function getMesinList() {
  const pool = await poolPromise;
  const result = await pool.request().query(`
    SELECT
      M.IdMesin,
      M.NamaMesin,
      CASE WHEN P.NoProduksi IS NULL THEN 0 ELSE 1 END AS IsJalanHariIni,
      ISNULL(P.Shift, '') AS Shift,
      ISNULL(P.NoProduksi, '') AS NoProduksi,
      ISNULL(CAST(P.JamKerja AS varchar(10)), '') AS JamKerja,
      ISNULL(P.JmlhAnggota, 0) AS JmlhAnggota,
      ISNULL(C.NamaOperator, '') AS OperatorName,
      M.DefaultOprator,
      ISNULL(D.NamaOperator, '') AS DefaultOperatorName
    FROM MstMesin M
    INNER JOIN MstBagian B ON B.IdBagian = M.IdBagian
    OUTER APPLY (
      SELECT TOP 1 H.NoProduksi, H.Shift, H.JamKerja, H.JmlhAnggota, H.IdOperator
      FROM SandingProduksi_h H
      WHERE H.IdMesin = M.IdMesin
        AND H.Tanggal = CONVERT(date, GETDATE())
      ORDER BY H.NoProduksi DESC
    ) P
    LEFT JOIN MstOperator C ON C.IdOperator = P.IdOperator
    LEFT JOIN MstOperator D ON D.IdOperator = M.DefaultOprator
    WHERE M.Enable = 1
      AND M.IdBagian = 6
    ORDER BY CASE WHEN P.NoProduksi IS NULL THEN 1 ELSE 0 END, M.NamaMesin
  `);
  return result.recordset;
}

async function getHistory({ page = 1, pageSize = 50, idMesin = null, tanggal = null, shift = null } = {}) {
  const pool = await poolPromise;
  const p = Math.max(1, Number(page) || 1);
  const ps = Math.min(200, Math.max(1, Number(pageSize) || 50));
  const offset = (p - 1) * ps;

  const filters = [];
  if (idMesin != null && idMesin !== "") {
    filters.push({
      sql: "A.IdMesin = @idm",
      input: (r) => r.input("idm", sql.Int, Number(idMesin)),
    });
  }
  if (tanggal != null && tanggal !== "") {
    filters.push({
      sql: "A.Tanggal = @tgl",
      input: (r) => r.input("tgl", sql.VarChar(10), String(tanggal).slice(0, 10)),
    });
  }
  if (shift != null && shift !== "") {
    filters.push({
      sql: "A.Shift = @shf",
      input: (r) => r.input("shf", sql.VarChar(5), String(shift)),
    });
  }
  const where = filters.length ? `WHERE ${filters.map((f) => f.sql).join(" AND ")}` : "";

  const countReq = pool.request();
  filters.forEach((f) => f.input(countReq));
  const countRes = await countReq.query(
    `SELECT COUNT(*) AS Total FROM SandingProduksi_h A ${where}`
  );
  const total = countRes.recordset[0] ? countRes.recordset[0].Total : 0;
  const totalPages = Math.max(1, Math.ceil(total / ps));

  const req = pool.request();
  filters.forEach((f) => f.input(req));
  req.input("off", sql.Int, offset);
  req.input("ps", sql.Int, ps);

  const headers = await req.query(`
    SELECT
      A.NoProduksi, A.Tanggal, A.Shift,
      A.IdMesin,
      ISNULL(B.NamaMesin, '-') AS NamaMesin,
      A.JamKerja, A.JmlhAnggota, A.HourMeter, A.JamLembur,
      A.IdOperator,
      ISNULL(C.NamaOperator, '-') AS OperatorName
    FROM SandingProduksi_h A
    LEFT JOIN MstMesin B ON B.IdMesin = A.IdMesin
    LEFT JOIN MstOperator C ON C.IdOperator = A.IdOperator
    ${where}
    ORDER BY A.Tanggal DESC, A.NoProduksi DESC
    OFFSET @off ROWS FETCH NEXT @ps ROWS ONLY
  `);

  const rows = headers.recordset;
  if (!rows.length) return { items: [], page: p, pageSize: ps, total, totalPages };

  // Output hanya untuk NoProduksi di halaman ini (maks 200 parameter, aman dari
  // limit 2100 parameter SQL Server).
  const outReq = pool.request();
  const inList = rows
    .map((r, i) => {
      outReq.input("NP" + i, sql.VarChar(20), r.NoProduksi);
      return "@NP" + i;
    })
    .join(", ");
  const outputs = await outReq.query(`
    SELECT O.NoProduksi, J.Jenis
    FROM SandingProduksiOutput O
    INNER JOIN Sanding_h H ON H.NoSanding = O.NoSanding
    INNER JOIN MstJenisKayu J ON J.IdJenisKayu = H.IdJenisKayu
    INNER JOIN SandingProduksi_h P ON P.NoProduksi = O.NoProduksi
    WHERE P.NoProduksi IN (${inList})
    GROUP BY O.NoProduksi, J.Jenis
    ORDER BY O.NoProduksi, J.Jenis
  `);

  const outputMap = new Map();
  for (const row of outputs.recordset) {
    const key = String(row.NoProduksi).toUpperCase();
    if (!outputMap.has(key)) outputMap.set(key, []);
    const list = outputMap.get(key);
    if (list.length < 2) list.push(row.Jenis);
  }

  return {
    items: rows.map((r) => ({
      ...r,
      JenisOutput: (outputMap.get(String(r.NoProduksi).toUpperCase()) || []).join(", "),
    })),
    page: p,
    pageSize: ps,
    total,
    totalPages,
  };
}

// ── Meta input: tabel riwayat, master label, detail ukuran + flag per tipe ──
// 6 tipe input sanding (WIP tidak didukung). BarangJadi_h tidak punya kolom
// grade/UOM → NamaGrade kosong & faktor skala m³ selalu 1 (uom null).
// Tabel Reproses memakai Reproses_h yang tidak punya IsRepair/IsReject.
const INPUT_TABLES = {
  BARANGJADI: "SandingProduksiInputBarangJadi",
  CCAKHIR: "SandingProduksiInputCCAkhir",
  FJ: "SandingProduksiInputFJ",
  MOULDING: "SandingProduksiInputMoulding",
  REPROSES: "SandingProduksiInputReproses",
  SANDING: "SandingProduksiInputSanding",
};

const MASTER_BY_KEY = {
  BARANGJADI: { master: "BarangJadi_h", col: "NoBJ", grade: false, repair: true, reject: true, lembur: true, warna: false, uomLebar: null, uomPanjang: null, hasSaved: true },
  CCAKHIR: { master: "CCAkhir_h", col: "NoCCAkhir", grade: true, repair: true, reject: true, lembur: true, warna: false, uomLebar: "IdUOMTblLebar", uomPanjang: "IdUOMPanjang", hasSaved: true },
  FJ: { master: "FJ_h", col: "NoFJ", grade: true, repair: true, reject: true, lembur: true, warna: false, uomLebar: "IdUOMTblLebar", uomPanjang: "IdUOMPanjang", hasSaved: true },
  MOULDING: { master: "Moulding_h", col: "NoMoulding", grade: true, repair: true, reject: true, lembur: true, warna: false, uomLebar: "IdUOMTblLebar", uomPanjang: "IdUOMPanjang", hasSaved: true },
  REPROSES: { master: "Reproses_h", col: "NoReproses", grade: true, repair: false, reject: false, lembur: true, warna: false, uomLebar: "IdUOMTblLebar", uomPanjang: "IdUOMPanjang", hasSaved: true },
  SANDING: { master: "Sanding_h", col: "NoSanding", grade: true, repair: true, reject: true, lembur: true, warna: false, uomLebar: "IdUOMTblLebar", uomPanjang: "IdUOMPanjang", hasSaved: true },
};

function INPUT_META() {
  return Object.fromEntries(
    Object.keys(INPUT_TABLES).map((tipe) => {
      const m = MASTER_BY_KEY[tipe];
      return [tipe, {
        input: INPUT_TABLES[tipe],
        master: m.master,
        key: m.col,
        detail: m.master.replace(/_h$/, "_d"),
        grade: m.grade,
        repair: m.repair,
        reject: m.reject,
        lembur: m.lembur,
        warna: m.warna,
        uomLebar: m.uomLebar,
        uomPanjang: m.uomPanjang,
        hasSaved: m.hasSaved,
      }];
    }),
  );
}

/**
 * Rumus M3 mengikuti modules/proses/s4s getLabels:
 * Tebal × Lebar × Panjang × JmlhBatang / 1e9, diskalakan UOM lebar (3 → 645.16)
 * dan UOM panjang (4 → 304.8), dibulatkan 4 desimal. Kolom UOM null → faktor 1.
 */
const M3_AGG = (rowAlias, headAlias, lebarCol = "IdUOMTblLebar", panjangCol = "IdUOMPanjang") => `
    ROUND(
      SUM(
        COALESCE(TRY_CONVERT(DECIMAL(18,4), ${rowAlias}.Tebal), 0) *
        COALESCE(TRY_CONVERT(DECIMAL(18,4), ${rowAlias}.Lebar), 0) *
        COALESCE(TRY_CONVERT(DECIMAL(18,4), ${rowAlias}.Panjang), 0) *
        COALESCE(TRY_CONVERT(DECIMAL(18,4), ${rowAlias}.JmlhBatang), 0) / 1000000000.0
      ) *
      ${lebarCol ? `CASE WHEN ${headAlias}.${lebarCol} = 3 THEN 645.16 ELSE 1 END *` : ""} 
      ${panjangCol ? `CASE WHEN ${headAlias}.${panjangCol} = 4 THEN 304.8 ELSE 1 END` : "1"}, 4, 1)`;

const DIMS_AGG = (detailTable, keyCol, keyExpr, headAlias, lebarCol, panjangCol) => `
    OUTER APPLY (
      SELECT
        ${M3_AGG("D2", headAlias, lebarCol, panjangCol)} AS M3,
        SUM(COALESCE(TRY_CONVERT(DECIMAL(18,4), D2.JmlhBatang), 0)) AS JmlhBatang,
        COUNT(D2.NoUrut) AS JmlhUkuran
      FROM ${detailTable} D2
      WHERE D2.${keyCol} = ${keyExpr}
    ) AGG`;

async function getDetail(noProduksi) {
  const pool = await poolPromise;
  const req = pool.request();
  req.input("np", sql.VarChar(20), noProduksi);

  const headerRes = await req.query(`
    SELECT
      A.NoProduksi, A.Tanggal, A.Shift, A.JamKerja, A.JmlhAnggota, A.HourMeter, A.JamLembur,
      A.IdMesin, ISNULL(B.NamaMesin, '-') AS NamaMesin,
      A.IdOperator, ISNULL(C.NamaOperator, '-') AS OperatorName
    FROM SandingProduksi_h A
    LEFT JOIN MstMesin B ON B.IdMesin = A.IdMesin
    LEFT JOIN MstOperator C ON C.IdOperator = A.IdOperator
    WHERE A.NoProduksi = @np
  `);

  if (!headerRes.recordset.length) {
    const err = new Error(`Produksi '${noProduksi}' tidak ditemukan`);
    err.status = 404;
    throw err;
  }

  const inputBranches = Object.entries(INPUT_META()).map(([tipe, m]) => `
    SELECT '${tipe}' AS Tipe, A.${m.key} AS NoLabel,
      ${m.hasSaved ? "A.DateTimeSaved" : "NULL AS DateTimeSaved"},
      D.Tebal, D.Lebar, D.Panjang,
      COALESCE(AGG.JmlhBatang, 0) AS JmlhBatang,
      AGG.M3,
      COALESCE(AGG.JmlhUkuran, 0) AS JmlhUkuran,
      ISNULL(J.Jenis, '') AS Jenis,
      ${m.grade ? "ISNULL(G.NamaGrade, '') AS NamaGrade" : "'' AS NamaGrade"},
      ${m.repair ? "ISNULL(H.IsRepair, 0)" : "0"} AS IsRepair,
      ${m.reject ? "ISNULL(H.IsReject, 0)" : "0"} AS IsReject,
      ${m.lembur ? "ISNULL(H.IsLembur, 0)" : "0"} AS IsLembur,
      NULL AS NamaWarna,
      CASE WHEN H.${m.key} IS NOT NULL AND H.DateUsage IS NULL THEN 1 ELSE 0 END AS IsTemporary
    FROM ${m.input} A
    LEFT JOIN ${m.master} H ON H.${m.key} = A.${m.key}
    LEFT JOIN MstJenisKayu J ON J.IdJenisKayu = H.IdJenisKayu
    ${m.grade ? "LEFT JOIN MstGrade G ON G.IdGrade = H.IdGrade" : ""}
    OUTER APPLY (
      SELECT TOP 1 Tebal, Lebar, Panjang
      FROM ${m.detail}
      WHERE ${m.key} = A.${m.key}
      ORDER BY NoUrut
    ) D
    ${DIMS_AGG(m.detail, m.key, `A.${m.key}`, "H", m.uomLebar, m.uomPanjang)}
    WHERE A.NoProduksi = @np`);

  const inputsRes = await req.query(`
    ${inputBranches.join("\n    UNION ALL\n")}
    ORDER BY DateTimeSaved DESC
  `);

  const outputsRes = await req.query(`
    SELECT
      O.NoSanding,
      ISNULL(J.Jenis, '') AS Jenis,
      ISNULL(G.NamaGrade, '') AS NamaGrade,
      D.Tebal, D.Lebar, D.Panjang,
      COALESCE(AGG.JmlhBatang, 0) AS JmlhBatang,
      AGG.M3,
      COALESCE(AGG.JmlhUkuran, 0) AS JmlhUkuran,
      ISNULL(H.IsRepair, 0) AS IsRepair,
      ISNULL(H.IsReject, 0) AS IsReject,
      ISNULL(H.IsLembur, 0) AS IsLembur,
      ISNULL(H.HasBeenPrinted, 0) AS HasBeenPrinted,
      NULL AS NamaWarna
    FROM SandingProduksiOutput O
    LEFT JOIN Sanding_h H ON H.NoSanding = O.NoSanding
    LEFT JOIN MstJenisKayu J ON J.IdJenisKayu = H.IdJenisKayu
    LEFT JOIN MstGrade G ON G.IdGrade = H.IdGrade
    OUTER APPLY (
      SELECT TOP 1 Tebal, Lebar, Panjang
      FROM Sanding_d
      WHERE NoSanding = O.NoSanding
      ORDER BY NoUrut
    ) D
    ${DIMS_AGG("Sanding_d", "NoSanding", "O.NoSanding", "H", "IdUOMTblLebar", "IdUOMPanjang")}
    WHERE O.NoProduksi = @np
    ORDER BY O.NoSanding
  `);

  const rejectsRes = await pool.request()
    .input("np", sql.VarChar(20), noProduksi)
    .query(`
      SELECT Tebal, Lebar, Panjang, JmlhBatang, M3, IdUOMTblLebar, IdUOMPanjang
      FROM SandingProduksi_Reject
      WHERE NoProduksi = @np
      ORDER BY Tebal, Lebar, Panjang
    `);

  return {
    header: headerRes.recordset[0],
    inputs: inputsRes.recordset,
    outputs: outputsRes.recordset,
    rejects: rejectsRes.recordset,
  };
}

async function getNextNoProduksi() {
  const pool = await poolPromise;
  const result = await pool.request().query(`
    SELECT 'WA.' + FORMAT(RIGHT(ISNULL(MAX(NoProduksi), 'WA.000000'), 6) + 1, '000000') AS NoProduksi
    FROM SandingProduksi_h
  `);
  return result.recordset[0] ? result.recordset[0].NoProduksi : "WA.000001";
}

async function getNextNoLabel() {
  const pool = await poolPromise;
  const result = await pool.request().query(`
    SELECT ISNULL('W.' + FORMAT(RIGHT(MAX(NoSanding), 6) + 1, '000000'), 'W.000001') AS NoSanding
    FROM Sanding_h
  `);
  return result.recordset[0] ? result.recordset[0].NoSanding : "W.000001";
}

async function getMasterOptions() {
  const pool = await poolPromise;
  const [jenisKayu, grade, spk] = await Promise.all([
    pool.request().query(`
      SELECT Jenis, IdJenisKayu
      FROM MstJenisKayu
      WHERE [Enable] = 1 AND IsInternal = 1 AND IsNonST = 1
      ORDER BY Jenis
    `),
    pool.request().query(`
      SELECT DISTINCT a.IdJenisKayu, c.IdGrade, c.NamaGrade
      FROM MstJenisKayu a
      INNER JOIN MstGrade_d b ON b.IdJenisKayu = a.IdJenisKayu AND b.Category = 'SANDING'
      INNER JOIN MstGrade c ON c.IdGrade = b.IdGrade
      WHERE a.[Enable] = 1 AND c.[Enable] = 1
      ORDER BY IdJenisKayu, NamaGrade
    `),
    pool.request().query(`
      SELECT NoSPK FROM MstSPK_h WHERE [Enable] = 1 ORDER BY NoSPK
    `),
  ]);

  return {
    jenisKayu: jenisKayu.recordset,
    grade: grade.recordset,
    spk: spk.recordset,
  };
}

async function getOperators() {
  const pool = await poolPromise;
  const result = await pool.request().query(`
    SELECT IdOperator, NamaOperator
    FROM MstOperator
    ORDER BY NamaOperator
  `);
  return result.recordset;
}

function numOrNull(v) {
  return v == null || v === "" ? null : Number(v);
}

function numOr(v, fallback) {
  return v == null || v === "" ? fallback : Number(v);
}

async function saveHeader({
  shift, tanggal, idMesin, idOperator, jamKerja, jmlhAnggota, hourMeter, jamLembur,
}) {
  await assertPeriodeTerbuka(tanggal || new Date());
  const pool = await poolPromise;
  const req = pool.request();
  req.input("sh", sql.Int, numOr(shift, 1));
  req.input("tgl", sql.Date, tanggal || new Date());
  req.input("idm", sql.Int, idMesin);
  req.input("ido", sql.Int, idOperator);
  req.input("jk", sql.Int, numOrNull(jamKerja));
  req.input("ja", sql.Int, numOr(jmlhAnggota, 0));
  req.input("hm", sql.Float, numOrNull(hourMeter));
  req.input("jl", sql.Int, numOrNull(jamLembur));

  const result = await req.query(`
    DECLARE @np VARCHAR(20);
    SELECT @np = 'WA.' + FORMAT(RIGHT(ISNULL(MAX(NoProduksi), 'WA.000000'), 6) + 1, '000000')
    FROM SandingProduksi_h;
    INSERT INTO SandingProduksi_h (NoProduksi, [Shift], Tanggal, IdMesin, IdOperator, JamKerja, JmlhAnggota, HourMeter, JamLembur)
    VALUES (@np, @sh, @tgl, @idm, @ido, @jk, @ja, @hm, @jl);
    SELECT @np AS NoProduksi;
  `);

  return result.recordset[0] ? result.recordset[0].NoProduksi : null;
}

async function getHeader(noProduksi) {
  const pool = await poolPromise;
  const result = await pool.request()
    .input("np", sql.VarChar(20), noProduksi)
    .query(`
      SELECT TOP 1
        h.NoProduksi,
        h.Shift,
        h.Tanggal,
        h.IdMesin,
        h.IdOperator,
        ISNULL(CAST(h.JamKerja AS varchar(10)), '') AS JamKerja,
        ISNULL(h.JmlhAnggota, 0) AS JmlhAnggota,
        ISNULL(CAST(h.HourMeter AS varchar(20)), '') AS HourMeter,
        ISNULL(h.JamLembur, 0) AS JamLembur,
        ISNULL(m.NamaMesin, '-') AS NamaMesin,
        ISNULL(o.NamaOperator, '-') AS NamaOperator
      FROM SandingProduksi_h h
      LEFT JOIN MstMesin m ON m.IdMesin = h.IdMesin
      LEFT JOIN MstOperator o ON o.IdOperator = h.IdOperator
      WHERE h.NoProduksi = @np
    `);
  return result.recordset[0] || null;
}

async function updateHeader(noProduksi, {
  shift, tanggal, idMesin, idOperator, jamKerja, jmlhAnggota, hourMeter, jamLembur,
}) {
  const pool = await poolPromise;
  const exists = await pool
    .request()
    .input("np", sql.VarChar(20), noProduksi)
    .query("SELECT Tanggal FROM SandingProduksi_h WHERE NoProduksi = @np");
  if (!exists.recordset.length) {
    const err = new Error(`Produksi '${noProduksi}' tidak ditemukan`);
    err.status = 404;
    throw err;
  }
  // Tanggal lama & tanggal baru sama-sama harus terbuka.
  await assertPeriodeTerbuka(exists.recordset[0].Tanggal);
  await assertPeriodeTerbuka(tanggal || exists.recordset[0].Tanggal);

  const req = pool.request();
  req.input("np", sql.VarChar(20), noProduksi);
  req.input("sh", sql.Int, numOr(shift, 1));
  req.input("tgl", sql.Date, tanggal || new Date());
  req.input("idm", sql.Int, idMesin);
  req.input("ido", sql.Int, idOperator);
  req.input("jk", sql.Int, numOrNull(jamKerja));
  req.input("ja", sql.Int, numOr(jmlhAnggota, 0));
  req.input("hm", sql.Float, numOrNull(hourMeter));
  req.input("jl", sql.Int, numOrNull(jamLembur));
  await req.query(`
    UPDATE SandingProduksi_h
    SET [Shift] = @sh, Tanggal = @tgl, IdMesin = @idm, IdOperator = @ido,
        JamKerja = @jk, JmlhAnggota = @ja, HourMeter = @hm, JamLembur = @jl
    WHERE NoProduksi = @np
  `);
  return { noProduksi };
}

/**
 * Ganti produksi: selalu membuat NoProduksi WA baru — header baru dengan
 * input & output kosong. Nomor lama beserta seluruh data input/output-nya
 * TETAP tersimpan (tidak dipindah, tidak dihapus).
 * Return { noProduksi, createdNew: true } — noProduksi = nomor baru untuk UI.
 */
async function gantiHeader(noProduksi, {
  shift, tanggal, idMesin, idOperator, jamKerja, jmlhAnggota, hourMeter, jamLembur,
}) {
  const pool = await poolPromise;
  const curRes = await pool
    .request()
    .input("np", sql.VarChar(20), noProduksi)
    .query("SELECT Tanggal, IdMesin, IdOperator FROM SandingProduksi_h WHERE NoProduksi = @np");
  if (!curRes.recordset.length) {
    const err = new Error(`Produksi '${noProduksi}' tidak ditemukan`);
    err.status = 404;
    throw err;
  }
  const cur = curRes.recordset[0];
  // Hanya tanggal nomor BARU yang harus terbuka — nomor lama tidak disentuh.
  await assertPeriodeTerbuka(tanggal || cur.Tanggal);

  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    const genReq = new sql.Request(tx);
    genReq.input("sh", sql.Int, numOr(shift, 1));
    genReq.input("tgl", sql.Date, tanggal || cur.Tanggal);
    genReq.input("idm", sql.Int, idMesin ?? cur.IdMesin);
    genReq.input("ido", sql.Int, idOperator ?? cur.IdOperator);
    genReq.input("jk", sql.Int, numOrNull(jamKerja));
    genReq.input("ja", sql.Int, numOr(jmlhAnggota, 0));
    genReq.input("hm", sql.Float, numOrNull(hourMeter));
    genReq.input("jl", sql.Int, numOrNull(jamLembur));
    const genRes = await genReq.query(`
      DECLARE @np VARCHAR(20);
      SELECT @np = 'WA.' + FORMAT(RIGHT(ISNULL(MAX(NoProduksi), 'WA.000000'), 6) + 1, '000000')
      FROM SandingProduksi_h WITH (UPDLOCK, HOLDLOCK);
      INSERT INTO SandingProduksi_h (NoProduksi, [Shift], Tanggal, IdMesin, IdOperator, JamKerja, JmlhAnggota, HourMeter, JamLembur)
      VALUES (@np, @sh, @tgl, @idm, @ido, @jk, @ja, @hm, @jl);
      SELECT @np AS NoProduksi;
    `);
    const newNo = genRes.recordset[0].NoProduksi;
    await tx.commit();
    return { noProduksi: newNo, createdNew: true };
  } catch (e) {
    await tx.rollback();
    throw e;
  }
}

async function deleteHeader(noProduksi) {
  const pool = await poolPromise;
  const check = await pool
    .request()
    .input("np", sql.VarChar(20), noProduksi)
    .query("SELECT Tanggal FROM SandingProduksi_h WHERE NoProduksi = @np");
  if (!check.recordset.length) {
    const err = new Error(`Produksi '${noProduksi}' tidak ditemukan`);
    err.status = 404;
    throw err;
  }
  await assertPeriodeTerbuka(check.recordset[0].Tanggal);

  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    for (const type of Object.keys(INPUT_TABLES)) {
      const inputTable = INPUT_TABLES[type];
      const mapping = MASTER_BY_KEY[type];
      const r = new sql.Request(tx);
      r.input("np", sql.VarChar(20), noProduksi);
      await r.query(`
        UPDATE ${mapping.master}
        SET DateUsage = NULL
        WHERE ${mapping.col} IN (SELECT ${mapping.col} FROM ${inputTable} WHERE NoProduksi = @np);
        DELETE FROM ${inputTable} WHERE NoProduksi = @np;
      `);
    }
    const r = new sql.Request(tx);
    r.input("np", sql.VarChar(20), noProduksi);
    await r.query(`
      DELETE FROM SandingProduksiOutput WHERE NoProduksi = @np;
      DELETE FROM SandingProduksi_Reject WHERE NoProduksi = @np;
      DELETE FROM SandingProduksi_h WHERE NoProduksi = @np;
    `);
    await tx.commit();
  } catch (e) {
    await tx.rollback();
    throw e;
  }
  return { noProduksi };
}

/**
 * Buat label output Sanding (W.xxxxxx). Daftar ukuran — satu label boleh punya
 * > 1 baris Sanding_d. IdOrgTelly dari user login; label yang dibuat dari
 * halaman produksi ikut tercatat sebagai output produksi tsb.
 */
async function createLabel({
  idJenisKayu, idGrade, noSPKAsal, noSPK, ukuran,
  tebal, lebar, panjang, jmlhBatang, idLokasi,
  isRepair, isReject, isLembur, noProduksi,
  idUsername,
}) {
  await assertPeriodeTerbuka(noProduksi ? await getTanggalProduksi(noProduksi) : new Date());

  const raw = Array.isArray(ukuran) && ukuran.length
    ? ukuran
    : [{ tebal, lebar, panjang, jmlhBatang }];
  const rows = raw
    .map((r) => ({
      tebal: String(r?.tebal ?? "").trim(),
      lebar: String(r?.lebar ?? "").trim(),
      panjang: String(r?.panjang ?? "").trim(),
      jmlhBatang: String(r?.jmlhBatang ?? "").trim(),
    }))
    .filter((r) => r.tebal || r.lebar || r.panjang || r.jmlhBatang);

  if (!rows.length) {
    const err = new Error("Minimal satu ukuran wajib diisi (tebal, lebar, panjang, jumlah batang)");
    err.status = 400;
    throw err;
  }
  if (rows.some((r) => !r.tebal || !r.lebar || !r.panjang || !r.jmlhBatang)) {
    const err = new Error("Setiap ukuran harus lengkap: tebal, lebar, panjang, dan jumlah batang");
    err.status = 400;
    throw err;
  }

  if (String(noSPK || "").length > 20 || String(noSPKAsal || "").length > 20) {
    const err = new Error("No SPK / No SPK Asal maksimal 20 karakter");
    err.status = 400;
    throw err;
  }
  const lokasi = idLokasi == null || idLokasi === "" ? null : String(idLokasi);
  if (lokasi && lokasi.length > 5) {
    const err = new Error("Lokasi tidak valid");
    err.status = 400;
    throw err;
  }

  const pool = await poolPromise;
  const req = pool.request();

  // IdOrgTelly dari user login: MstUsername → MstOrgTelly (FName = NamaOrgTelly).
  let idOrgTelly = null;
  if (idUsername != null && idUsername !== "") {
    const telly = await pool.request().input("idu", sql.Int, Number(idUsername)).query(`
      SELECT b.IdOrgTelly
      FROM MstUsername a
      LEFT JOIN MstOrgTelly b ON b.NamaOrgTelly = a.FName
      WHERE a.IdUsername = @idu
    `);
    idOrgTelly = telly.recordset[0]?.IdOrgTelly ?? null;
  }

  req.input("jk", sql.Int, idJenisKayu);
  req.input("gr", sql.Int, idGrade);
  req.input("stasal", sql.VarChar(20), noSPKAsal || "");
  req.input("nospk", sql.VarChar(20), noSPK || "");
  req.input("lok", sql.VarChar(5), lokasi);
  req.input("otel", sql.Int, idOrgTelly);
  req.input("isrep", sql.Bit, isRepair ? 1 : 0);
  req.input("isrej", sql.Bit, isReject ? 1 : 0);
  req.input("isleb", sql.Bit, isLembur ? 1 : 0);

  const dimTuples = rows.map((r, i) => {
    req.input(`t${i}`, sql.VarChar(20), r.tebal);
    req.input(`l${i}`, sql.VarChar(20), r.lebar);
    req.input(`p${i}`, sql.VarChar(20), r.panjang);
    req.input(`b${i}`, sql.VarChar(20), r.jmlhBatang);
    return `(@ns, ${i + 1}, @t${i}, @l${i}, @p${i}, @b${i})`;
  }).join(",\n      ");

  const result = await req.query(`
    BEGIN TRY
      DECLARE @ns VARCHAR(20);
      SELECT @ns = ISNULL('W.' + FORMAT(RIGHT(MAX(NoSanding), 6) + 1, '000000'), 'W.000001')
      FROM Sanding_h;
      INSERT INTO Sanding_h (NoSanding, IdJenisKayu, IdGrade, IdOrgTelly, DateCreate, DateUsage, IdUOMTblLebar, IdUOMPanjang, NoSPK, Jam, IsReject, IsLembur, IdWarehouse, IdFJProfile, NoSPKAsal, IdLokasi, HasBeenPrinted, IsRepair)
      VALUES (@ns, @jk, @gr, @otel, GETDATE(), NULL, 1, 1, NULLIF(@nospk, ''), FORMAT(GETDATE(), 'HH:mm'), @isrej, @isleb, 9, NULL, NULLIF(@stasal, ''), @lok, 0, @isrep);
      INSERT INTO Sanding_d (NoSanding, NoUrut, Tebal, Lebar, Panjang, JmlhBatang)
      VALUES
        ${dimTuples};
      SELECT @ns AS NoSanding;
    END TRY
    BEGIN CATCH
      THROW;
    END CATCH
  `);

  const noSanding = result.recordset[0] ? result.recordset[0].NoSanding : null;

  if (noSanding && noProduksi) {
    const attachReq = pool.request();
    attachReq.input("np", sql.VarChar(20), noProduksi);
    attachReq.input("ns", sql.VarChar(20), noSanding);
    await attachReq.query(`
      IF NOT EXISTS (SELECT 1 FROM SandingProduksiOutput WHERE NoProduksi = @np AND NoSanding = @ns)
        INSERT INTO SandingProduksiOutput (NoProduksi, NoSanding) VALUES (@np, @ns)
    `);
  }

  return noSanding;
}

function normalizeType(value) {
  return String(value || "").trim().toUpperCase();
}

/**
 * IdOrgTelly milik user login: MstUsername → MstOrgTelly (join b.NamaOrgTelly
 * = a.FName). Return null bila user tidak terhubung ke telly mana pun.
 */
async function getOrgTelly(idUsername) {
  if (idUsername == null || idUsername === "") return null;
  const pool = await poolPromise;
  const r = await pool.request().input("idu", sql.Int, Number(idUsername)).query(`
    SELECT a.IdUsername, a.Username, a.FName, b.IdOrgTelly, b.NamaOrgTelly
    FROM MstUsername a
    LEFT JOIN MstOrgTelly b ON b.NamaOrgTelly = a.FName
    WHERE a.IdUsername = @idu
  `);
  return r.recordset[0] || null;
}

async function addInput({ tipe, noProduksi, noLabel }) {
  const type = normalizeType(tipe);
  const inputTable = INPUT_TABLES[type];
  const mapping = MASTER_BY_KEY[type];
  if (!inputTable || !mapping) {
    const err = new Error("Tipe input tidak valid");
    err.status = 400;
    throw err;
  }
  await assertPeriodeTerbuka(await getTanggalProduksi(noProduksi));

  const pool = await poolPromise;
  const req = pool.request();
  req.input("lbl", sql.VarChar(50), noLabel);
  req.input("np", sql.VarChar(20), noProduksi);

  const exists = await req.query(
    `SELECT COUNT(*) AS Cnt FROM ${mapping.master} WHERE ${mapping.col} = @lbl`
  );
  if (!exists.recordset[0] || exists.recordset[0].Cnt === 0) {
    const err = new Error(`Label '${noLabel}' tidak terdaftar di ${mapping.master}`);
    err.status = 400;
    throw err;
  }

  const used = await req.query(
    `SELECT COUNT(*) AS Cnt FROM ${mapping.master} WHERE ${mapping.col} = @lbl AND DateUsage IS NOT NULL`
  );
  if (used.recordset[0].Cnt > 0) {
    const err = new Error(`Label '${noLabel}' sudah pernah dipakai (DateUsage terisi)`);
    err.status = 400;
    throw err;
  }

  // Temporary: label yang discan belum mengesahkan pemakaian (DateUsage masih
  // NULL) sehingga bisa dibatalkan. Karena itu cek dup harus lintas produksi.
  const duplicated = await req.query(
    `SELECT COUNT(*) AS Cnt FROM ${inputTable} WHERE ${mapping.col} = @lbl`
  );
  if (duplicated.recordset[0].Cnt > 0) {
    const err = new Error(`Label '${noLabel}' sudah ditambahkan ke input produksi`);
    err.status = 400;
    throw err;
  }

  if (mapping.hasSaved) {
    await req.query(`
      INSERT INTO ${inputTable} (${mapping.col}, NoProduksi, DateTimeSaved)
      VALUES (@lbl, @np, GETDATE());
    `);
  } else {
    // Tabel tanpa kolom DateTimeSaved — duplikat dicek di atas.
    await req.query(`
      INSERT INTO ${inputTable} (${mapping.col}, NoProduksi)
      VALUES (@lbl, @np);
    `);
  }

  return { noProduksi, noLabel, tipe: type };
}

async function removeInput({ tipe, noProduksi, noLabel }) {
  const type = normalizeType(tipe);
  const inputTable = INPUT_TABLES[type];
  const mapping = MASTER_BY_KEY[type];
  if (!inputTable || !mapping) {
    const err = new Error("Tipe input tidak valid");
    err.status = 400;
    throw err;
  }
  await assertPeriodeTerbuka(await getTanggalProduksi(noProduksi));

  const pool = await poolPromise;
  const req = pool.request();
  req.input("lbl", sql.VarChar(50), noLabel);
  req.input("np", sql.VarChar(20), noProduksi);

  await req.query(`
    DELETE FROM ${inputTable} WHERE NoProduksi = @np AND ${mapping.col} = @lbl;
    UPDATE ${mapping.master} SET DateUsage = NULL WHERE ${mapping.col} = @lbl;
  `);

  return { noProduksi, noLabel, tipe: type };
}

/**
 * Sahkan seluruh input temporary milik satu produksi. DateUsage = tanggal
 * SandingProduksi_h.Tanggal (bukan GETDATE()) supaya produksi backdate
 * mencantumkan tanggal produksinya sendiri. Dipanggil dari "Simpan Input".
 */
async function simpanInput({ noProduksi }) {
  if (!noProduksi) {
    const err = new Error("noProduksi wajib diisi");
    err.status = 400;
    throw err;
  }
  const tglProduksi = await getTanggalProduksi(noProduksi);
  await assertPeriodeTerbuka(tglProduksi);
  const pool = await poolPromise;
  let saved = 0;
  for (const [type, inputTable] of Object.entries(INPUT_TABLES)) {
    const mapping = MASTER_BY_KEY[type];
    if (!mapping) continue;
    const req = pool.request();
    req.input("np", sql.VarChar(20), noProduksi);
    req.input("tgl", sql.Date, tglProduksi);
    const r = await req.query(`
      UPDATE H
      SET H.DateUsage = @tgl
      FROM ${mapping.master} H
      INNER JOIN ${inputTable} I ON I.${mapping.col} = H.${mapping.col}
      WHERE I.NoProduksi = @np AND H.DateUsage IS NULL
    `);
    saved += r.rowsAffected?.[0] ?? 0;
  }
  return { noProduksi, saved };
}

/**
 * Batalkan (hapus) seluruh input temporary milik satu produksi — baris input
 * yang masternya belum punya DateUsage. Dipanggil dari tombol "Batal".
 */
async function batalInput({ noProduksi }) {
  if (!noProduksi) {
    const err = new Error("noProduksi wajib diisi");
    err.status = 400;
    throw err;
  }
  await assertPeriodeTerbuka(await getTanggalProduksi(noProduksi));
  const pool = await poolPromise;
  let batal = 0;
  for (const [type, inputTable] of Object.entries(INPUT_TABLES)) {
    const mapping = MASTER_BY_KEY[type];
    if (!mapping) continue;
    const req = pool.request();
    req.input("np", sql.VarChar(20), noProduksi);
    const r = await req.query(`
      DELETE I
      FROM ${inputTable} I
      INNER JOIN ${mapping.master} H ON H.${mapping.col} = I.${mapping.col}
      WHERE I.NoProduksi = @np AND H.DateUsage IS NULL
    `);
    batal += r.rowsAffected?.[0] ?? 0;
  }
  return { noProduksi, batal };
}

async function addOutput({ noProduksi, noSanding }) {
  await assertPeriodeTerbuka(await getTanggalProduksi(noProduksi));
  const pool = await poolPromise;
  const req = pool.request();
  req.input("np", sql.VarChar(20), noProduksi);
  req.input("ns", sql.VarChar(20), noSanding);

  await req.query(`
    INSERT INTO SandingProduksiOutput (NoProduksi, NoSanding)
    VALUES (@np, @ns)
  `);

  return { noProduksi, noSanding };
}

async function removeOutput({ noProduksi, noSanding }) {
  await assertPeriodeTerbuka(await getTanggalProduksi(noProduksi));
  const pool = await poolPromise;
  const req = pool.request();
  req.input("np", sql.VarChar(20), noProduksi);
  req.input("ns", sql.VarChar(20), noSanding);

  await req.query(`
    DELETE FROM SandingProduksiOutput WHERE NoProduksi = @np AND NoSanding = @ns
  `);

  return { noProduksi, noSanding };
}

// ── Stok Item: label input (master) yang belum dipakai, dikelompokkan per jenis ──
const STOK_MASTERS = {
  BARANGJADI: { table: "BarangJadi_h", col: "NoBJ", uomLebar: null, uomPanjang: null },
  CCAKHIR: { table: "CCAkhir_h", col: "NoCCAkhir", uomLebar: "IdUOMTblLebar", uomPanjang: "IdUOMPanjang" },
  FJ: { table: "FJ_h", col: "NoFJ", uomLebar: "IdUOMTblLebar", uomPanjang: "IdUOMPanjang" },
  MOULDING: { table: "Moulding_h", col: "NoMoulding", uomLebar: "IdUOMTblLebar", uomPanjang: "IdUOMPanjang" },
  REPROSES: { table: "Reproses_h", col: "NoReproses", uomLebar: "IdUOMTblLebar", uomPanjang: "IdUOMPanjang" },
  SANDING: { table: "Sanding_h", col: "NoSanding", uomLebar: "IdUOMTblLebar", uomPanjang: "IdUOMPanjang" },
};

function stokMaster(tipe) {
  const type = normalizeType(tipe);
  const mapping = STOK_MASTERS[type];
  if (!mapping) {
    const err = new Error("Tipe stok tidak valid");
    err.status = 400;
    throw err;
  }
  return { type, ...mapping };
}

/**
 * Berat (m³) per label: agregat seluruh baris *_d × faktor UOM header label
 * (paritas M3_AGG getDetail — 645.16 utk UOM lebar 3, 304.8 utk UOM panjang 4),
 * dibulatkan 4 desimal. Alias tabel master harus "A". Kolom UOM null → faktor 1.
 */
function stokM3Apply(m) {
  const detail = m.table.replace(/_h$/, "_d");
  return `
    OUTER APPLY (
      SELECT ISNULL(ROUND(
        SUM(
          COALESCE(TRY_CONVERT(DECIMAL(18,4), D.Tebal), 0) *
          COALESCE(TRY_CONVERT(DECIMAL(18,4), D.Lebar), 0) *
          COALESCE(TRY_CONVERT(DECIMAL(18,4), D.Panjang), 0) *
          COALESCE(TRY_CONVERT(DECIMAL(18,4), D.JmlhBatang), 0) / 1000000000.0
        ) *
        ${m.uomLebar ? `CASE WHEN A.${m.uomLebar} = 3 THEN 645.16 ELSE 1 END *` : ""} 
        ${m.uomPanjang ? `CASE WHEN A.${m.uomPanjang} = 4 THEN 304.8 ELSE 1 END` : "1"}, 4, 1), 0) AS M3
      FROM ${detail} D
      WHERE D.${m.col} = A.${m.col}
    ) AGG`;
}

async function getStok(tipe) {
  const m = stokMaster(tipe);
  const pool = await poolPromise;
  const result = await pool.request().query(`
    SELECT
      ISNULL(A.IdJenisKayu, 0) AS IdJenisKayu,
      ISNULL(B.Jenis, 'Tanpa Jenis') AS Jenis,
      COUNT(*) AS Jumlah,
      MIN(A.DateCreate) AS TanggalTertua,
      SUM(AGG.M3) AS BeratM3
    FROM ${m.table} A
    LEFT JOIN MstJenisKayu B ON B.IdJenisKayu = A.IdJenisKayu
    ${stokM3Apply(m)}
    WHERE A.DateUsage IS NULL
    GROUP BY ISNULL(A.IdJenisKayu, 0), ISNULL(B.Jenis, 'Tanpa Jenis')
    ORDER BY ISNULL(B.Jenis, 'Tanpa Jenis')
  `);
  return result.recordset;
}

async function getStokLabels(tipe, idJenis) {
  const m = stokMaster(tipe);
  const pool = await poolPromise;
  const req = pool.request();
  req.input("idj", sql.Int, idJenis == null || idJenis === "" ? 0 : Number(idJenis));
  const result = await req.query(`
    SELECT TOP 500
      A.${m.col} AS Label,
      A.DateCreate AS Tanggal,
      AGG.M3 AS BeratM3,
      ISNULL(SUM(AGG.M3) OVER(), 0) AS TotalM3,
      COUNT(*) OVER() AS TotalJumlah
    FROM ${m.table} A
    ${stokM3Apply(m)}
    WHERE A.DateUsage IS NULL
      AND ((@idj = 0 AND A.IdJenisKayu IS NULL) OR A.IdJenisKayu = @idj)
    ORDER BY A.DateCreate, A.${m.col}
  `);
  return result.recordset;
}

// ── Reject produksi (SandingProduksi_Reject: NoProduksi, Tebal, Lebar, Panjang, JmlhBatang, M3, IdUOMTblLebar, IdUOMPanjang) ──
// MstUOM: 1 = mm, 2 = cm, 3 = inch, 4 = feet, 5 = meter.
// Tebal/lebar: mm atau inch; panjang: mm (default), feet, atau meter.
const REJECT_UOM_LEBAR = [1, 3];
const REJECT_UOM_PANJANG = [1, 4, 5];

function parseRejectDims({ tebal, lebar, panjang, jmlhBatang, idUOMTblLebar, idUOMPanjang }, withJumlah = true) {
  const t = Number(tebal), l = Number(lebar), p = Number(panjang), j = Number(jmlhBatang);
  const uomL = Number(idUOMTblLebar ?? 1), uomP = Number(idUOMPanjang ?? 1);
  const bad = (v) => !Number.isInteger(v) || v <= 0;
  if (bad(t) || bad(l) || bad(p) || (withJumlah && bad(j))) {
    const err = new Error("Tebal, lebar, panjang, dan jumlah batang harus berupa bilangan bulat lebih dari 0");
    err.status = 400;
    throw err;
  }
  if (!REJECT_UOM_LEBAR.includes(uomL) || !REJECT_UOM_PANJANG.includes(uomP)) {
    const err = new Error("Satuan tebal/lebar atau panjang tidak valid");
    err.status = 400;
    throw err;
  }
  return { t, l, p, j, uomL, uomP };
}

/** Faktor UOM paritas M3_AGG: lebar 3 (inch) → 645.16, panjang 4 (feet) → 304.8; meter → 1000. */
const REJECT_FAKTOR = `CASE WHEN @ul = 3 THEN 645.16 ELSE 1 END
      * CASE @up WHEN 4 THEN 304.8 WHEN 5 THEN 1000 ELSE 1 END`;
const REJECT_M3_EXPR = `ROUND(@t * @l * @p * @j / 1000000000.0 * ${REJECT_FAKTOR}, 4)`;
const REJECT_M3_TOTAL_EXPR = `ROUND(@t * @l * @p * @tot / 1000000000.0 * ${REJECT_FAKTOR}, 4)`;

function rejectRequest(pool, noProduksi, { t, l, p, j, uomL, uomP }) {
  const req = pool.request();
  req.input("np", sql.VarChar(13), noProduksi);
  req.input("t", sql.Int, t);
  req.input("l", sql.Int, l);
  req.input("p", sql.Int, p);
  req.input("j", sql.Int, j ?? 0);
  req.input("ul", sql.Int, uomL);
  req.input("up", sql.Int, uomP);
  return req;
}

/** Tambah reject (M3 dihitung otomatis); ukuran + satuan yang sama digabung (batang ditambah). */
async function addReject(body) {
  const { noProduksi } = body;
  const d = parseRejectDims(body);
  const tanggal = await getTanggalProduksi(noProduksi);
  if (!tanggal) {
    const err = new Error(`Produksi '${noProduksi}' tidak ditemukan`);
    err.status = 404;
    throw err;
  }
  await assertPeriodeTerbuka(tanggal);
  const pool = await poolPromise;
  const req = rejectRequest(pool, noProduksi, d);
  await req.query(`
    DECLARE @tot INT;
    SELECT @tot = JmlhBatang + @j FROM SandingProduksi_Reject
    WHERE NoProduksi = @np AND Tebal = @t AND Lebar = @l AND Panjang = @p
      AND IdUOMTblLebar = @ul AND IdUOMPanjang = @up;
    IF @tot IS NOT NULL
      UPDATE SandingProduksi_Reject
      SET JmlhBatang = @tot,
          M3 = ${REJECT_M3_TOTAL_EXPR}
      WHERE NoProduksi = @np AND Tebal = @t AND Lebar = @l AND Panjang = @p
        AND IdUOMTblLebar = @ul AND IdUOMPanjang = @up
    ELSE
      INSERT INTO SandingProduksi_Reject (NoProduksi, Tebal, Lebar, Panjang, JmlhBatang, M3, IdUOMTblLebar, IdUOMPanjang)
      VALUES (@np, @t, @l, @p, @j, ${REJECT_M3_EXPR}, @ul, @up);
  `);
    return { noProduksi, tebal: d.t, lebar: d.l, panjang: d.p, jmlhBatang: d.j, idUOMTblLebar: d.uomL, idUOMPanjang: d.uomP };
}

async function removeReject(body) {
  const { noProduksi } = body;
  const d = parseRejectDims({ ...body, idUOMTblLebar: 1, idUOMPanjang: 1 }, false); // UOM tidak divalidasi saat hapus
  await assertPeriodeTerbuka(await getTanggalProduksi(noProduksi));
  const pool = await poolPromise;
  const req = rejectRequest(pool, noProduksi, d);
  // Baris lama bisa ber-UOM NULL (dibuat sebelum kolom UOM dipakai) → cocokkan null-safe,
  // dan pakai UOM apa adanya dari body (tanpa default) agar NULL tetap NULL.
  const rawUom = (v) => (v == null || v === "" ? null : Number(v));
  req.parameters.ul.value = rawUom(body.idUOMTblLebar);
  req.parameters.up.value = rawUom(body.idUOMPanjang);
  await req.query(`
    DELETE FROM SandingProduksi_Reject
    WHERE NoProduksi = @np AND Tebal = @t AND Lebar = @l AND Panjang = @p
      AND ISNULL(IdUOMTblLebar, 0) = ISNULL(@ul, 0)
      AND ISNULL(IdUOMPanjang, 0) = ISNULL(@up, 0)
  `);
  return { noProduksi };
}

module.exports = {
  getMesinList,
  getHistory,
  getDetail,
  getStok,
  getStokLabels,
  getNextNoProduksi,
  getNextNoLabel,
  getMasterOptions,
  getOperators,
  saveHeader,
  createLabel,
  getOrgTelly,
  addInput,
  removeInput,
  simpanInput,
  batalInput,
  addOutput,
  removeOutput,
  addReject,
  removeReject,
  updateHeader,
  gantiHeader,
  deleteHeader,
  getHeader,
};
