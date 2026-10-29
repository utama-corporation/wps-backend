const { sql, poolPromise } = require("../../../core/config/db");
const { assertPeriodeTerbuka } = require("../../../core/utils/periode-lock");

/** Tanggal produksi (FJProduksi_h.Tanggal) — dasar cek kunci periode. */
async function getTanggalProduksi(noProduksi) {
  if (!noProduksi) return null;
  const pool = await poolPromise;
  const r = await pool
    .request()
    .input("np", sql.VarChar(20), noProduksi)
    .query("SELECT Tanggal FROM FJProduksi_h WHERE NoProduksi = @np");
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
      FROM FJProduksi_h H
      WHERE H.IdMesin = M.IdMesin
        AND H.Tanggal = CONVERT(date, GETDATE())
      ORDER BY H.NoProduksi DESC
    ) P
    LEFT JOIN MstOperator C ON C.IdOperator = P.IdOperator
    LEFT JOIN MstOperator D ON D.IdOperator = M.DefaultOprator
    WHERE M.Enable = 1
      AND B.NamaBagian LIKE '%FINGER%'
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
    `SELECT COUNT(*) AS Total FROM FJProduksi_h A ${where}`
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
    FROM FJProduksi_h A
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
    FROM FJProduksiOutput O
    INNER JOIN FJ_h H ON H.NoFJ = O.NoFJ
    INNER JOIN MstJenisKayu J ON J.IdJenisKayu = H.IdJenisKayu
    INNER JOIN FJProduksi_h P ON P.NoProduksi = O.NoProduksi
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
// (WIP_h tidak punya IsRepair/IsLembur; S4S_h tidak punya kolom lain.)
const INPUT_TABLES = {
  S4S: "FJProduksiInputS4S",
  WIP: "FJProduksiInputWIP",
  CCAKHIR: "FJProduksiInputCCAkhir",
};

const MASTER_BY_KEY = {
  // WIP_h memakai ejaan kolom berbeda: IdUOMTlbLebar (bukan IdUOMTblLebar).
  S4S: { master: "S4S_h", col: "NoS4S", grade: true, repair: true, reject: true, lembur: true, warna: true, uomLebar: "IdUOMTblLebar" },
  WIP: { master: "WIP_h", col: "NoWIP", grade: true, repair: false, reject: true, lembur: false, warna: false, uomLebar: "IdUOMTlbLebar" },
  CCAKHIR: { master: "CCAkhir_h", col: "NoCCAkhir", grade: true, repair: true, reject: true, lembur: true, warna: false, uomLebar: "IdUOMTblLebar" },
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
      }];
    }),
  );
}

/**
 * Rumus M3 mengikuti modules/proses/s4s getLabels:
 * Tebal × Lebar × Panjang × JmlhBatang / 1e9, diskalakan UOM lebar (3 → 645.16)
 * dan UOM panjang (4 → 304.8), dibulatkan 4 desimal.
 */
const M3_EXPR = (dimsAlias, headAlias) => `
    ROUND(
      COALESCE(TRY_CONVERT(DECIMAL(18,4), ${dimsAlias}.Tebal), 0) *
      COALESCE(TRY_CONVERT(DECIMAL(18,4), ${dimsAlias}.Lebar), 0) *
      COALESCE(TRY_CONVERT(DECIMAL(18,4), ${dimsAlias}.Panjang), 0) *
      COALESCE(TRY_CONVERT(DECIMAL(18,4), ${dimsAlias}.JmlhBatang), 0) / 1000000000.0 *
      CASE WHEN ${headAlias}.IdUOMTblLebar = 3 THEN 645.16 ELSE 1 END *
      CASE WHEN ${headAlias}.IdUOMPanjang = 4 THEN 304.8 ELSE 1 END, 4, 1)`;

const M3_AGG = (rowAlias, headAlias, lebarCol = "IdUOMTblLebar") => `
    ROUND(
      SUM(
        COALESCE(TRY_CONVERT(DECIMAL(18,4), ${rowAlias}.Tebal), 0) *
        COALESCE(TRY_CONVERT(DECIMAL(18,4), ${rowAlias}.Lebar), 0) *
        COALESCE(TRY_CONVERT(DECIMAL(18,4), ${rowAlias}.Panjang), 0) *
        COALESCE(TRY_CONVERT(DECIMAL(18,4), ${rowAlias}.JmlhBatang), 0) / 1000000000.0
      ) *
      CASE WHEN ${headAlias}.${lebarCol} = 3 THEN 645.16 ELSE 1 END *
      CASE WHEN ${headAlias}.IdUOMPanjang = 4 THEN 304.8 ELSE 1 END, 4, 1)`;

const DIMS_AGG = (detailTable, keyCol, keyExpr, headAlias, lebarCol) => `
    OUTER APPLY (
      SELECT
        ${M3_AGG("D2", headAlias, lebarCol)} AS M3,
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
    FROM FJProduksi_h A
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
    SELECT '${tipe}' AS Tipe, A.${m.key} AS NoLabel, A.DateTimeSaved,
      D.Tebal, D.Lebar, D.Panjang,
      COALESCE(AGG.JmlhBatang, 0) AS JmlhBatang,
      AGG.M3,
      COALESCE(AGG.JmlhUkuran, 0) AS JmlhUkuran,
      ISNULL(J.Jenis, '') AS Jenis,
      ${m.grade ? "ISNULL(G.NamaGrade, '') AS NamaGrade" : "'' AS NamaGrade"},
      ${m.repair ? "ISNULL(H.IsRepair, 0)" : "0"} AS IsRepair,
      ${m.reject ? "ISNULL(H.IsReject, 0)" : "0"} AS IsReject,
      ${m.lembur ? "ISNULL(H.IsLembur, 0)" : "0"} AS IsLembur,
      ${m.warna ? "W.NamaWarna" : "NULL AS NamaWarna"},
      CASE WHEN H.${m.key} IS NOT NULL AND H.DateUsage IS NULL THEN 1 ELSE 0 END AS IsTemporary
    FROM ${m.input} A
    LEFT JOIN ${m.master} H ON H.${m.key} = A.${m.key}
    LEFT JOIN MstJenisKayu J ON J.IdJenisKayu = H.IdJenisKayu
    ${m.grade ? "LEFT JOIN MstGrade G ON G.IdGrade = H.IdGrade" : ""}
    ${m.warna ? "LEFT JOIN MstWarna W ON W.IdWarna = H.IdWarna" : ""}
    OUTER APPLY (
      SELECT TOP 1 Tebal, Lebar, Panjang
      FROM ${m.detail}
      WHERE ${m.key} = A.${m.key}
      ORDER BY NoUrut
    ) D
    ${DIMS_AGG(m.detail, m.key, `A.${m.key}`, "H", m.uomLebar)}
    WHERE A.NoProduksi = @np`);

  const inputsRes = await req.query(`
    ${inputBranches.join("\n    UNION ALL\n")}
    ORDER BY DateTimeSaved DESC
  `);

  const outputsRes = await req.query(`
    SELECT
      O.NoFJ,
      ISNULL(J.Jenis, '') AS Jenis,
      ISNULL(G.NamaGrade, '') AS NamaGrade,
      D.Tebal, D.Lebar, D.Panjang,
      COALESCE(AGG.JmlhBatang, 0) AS JmlhBatang,
      AGG.M3,
      COALESCE(AGG.JmlhUkuran, 0) AS JmlhUkuran,
      ISNULL(H.IsRepair, 0) AS IsRepair,
      ISNULL(H.IsReject, 0) AS IsReject,
      ISNULL(H.IsLembur, 0) AS IsLembur,
      ISNULL(H.NoS4SAsal, '') AS NoS4SAsal,
      ISNULL(H.HasBeenPrinted, 0) AS HasBeenPrinted,
      NULL AS NamaWarna
    FROM FJProduksiOutput O
    LEFT JOIN FJ_h H ON H.NoFJ = O.NoFJ
    LEFT JOIN MstJenisKayu J ON J.IdJenisKayu = H.IdJenisKayu
    LEFT JOIN MstGrade G ON G.IdGrade = H.IdGrade
    OUTER APPLY (
      SELECT TOP 1 Tebal, Lebar, Panjang
      FROM FJ_d
      WHERE NoFJ = O.NoFJ
      ORDER BY NoUrut
    ) D
    ${DIMS_AGG("FJ_d", "NoFJ", "O.NoFJ", "H")}
    WHERE O.NoProduksi = @np
    ORDER BY O.NoFJ
  `);

  const rejectsRes = await pool.request()
    .input("np", sql.VarChar(20), noProduksi)
    .query(`
      SELECT Tebal, Lebar, Panjang, JmlhBatang, M3, IdUOMTblLebar, IdUOMPanjang
      FROM FJProduksi_Reject
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
    SELECT 'SA.' + FORMAT(RIGHT(ISNULL(MAX(NoProduksi), 'SA.000000'), 6) + 1, '000000') AS NoProduksi
    FROM FJProduksi_h
  `);
  return result.recordset[0] ? result.recordset[0].NoProduksi : "SA.000001";
}

async function getNextNoLabel() {
  const pool = await poolPromise;
  const result = await pool.request().query(`
    SELECT ISNULL('S.' + FORMAT(RIGHT(MAX(NoFJ), 6) + 1, '000000'), 'S.000001') AS NoFJ
    FROM FJ_h
  `);
  return result.recordset[0] ? result.recordset[0].NoFJ : "S.000001";
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
    // Grade per jenis kayu: MstJenisKayu → MstGrade_d (relasi jenis↔grade,
    // kategori FINGERJOIN) → MstGrade. Dipakai dialog Buat Label (grade terfilter jenis).
    pool.request().query(`
      SELECT DISTINCT a.IdJenisKayu, c.IdGrade, c.NamaGrade
      FROM MstJenisKayu a
      INNER JOIN MstGrade_d b ON b.IdJenisKayu = a.IdJenisKayu AND b.Category = 'FINGERJOIN'
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

async function saveHeader({
  shift, tanggal, idMesin, idOperator, jamKerja, jmlhAnggota, hourMeter, jamLembur,
}) {
  await assertPeriodeTerbuka(tanggal || new Date());
  const pool = await poolPromise;
  const req = pool.request();
  req.input("sh", sql.VarChar(20), shift || "");
  req.input("tgl", sql.Date, tanggal || new Date());
  req.input("idm", sql.Int, idMesin);
  req.input("ido", sql.Int, idOperator);
  req.input("jk", sql.VarChar(10), jamKerja || "");
  req.input("ja", sql.Int, jmlhAnggota || 0);
  req.input("hm", sql.VarChar(20), hourMeter || "");
  req.input("jl", sql.Int, jamLembur || null);

  const result = await req.query(`
    DECLARE @np VARCHAR(20);
    SELECT @np = 'SA.' + FORMAT(RIGHT(ISNULL(MAX(NoProduksi), 'SA.000000'), 6) + 1, '000000')
    FROM FJProduksi_h;
    INSERT INTO FJProduksi_h (NoProduksi, [Shift], Tanggal, IdMesin, IdOperator, JamKerja, JmlhAnggota, HourMeter, JamLembur)
    VALUES (@np, @sh, @tgl, @idm, @ido, @jk, @ja, NULLIF(@hm, ''), @jl);
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
        ISNULL(h.JamKerja, '') AS JamKerja,
        ISNULL(h.JmlhAnggota, 0) AS JmlhAnggota,
        ISNULL(h.HourMeter, '') AS HourMeter,
        ISNULL(h.JamLembur, 0) AS JamLembur,
        ISNULL(m.NamaMesin, '-') AS NamaMesin,
        ISNULL(o.NamaOperator, '-') AS NamaOperator
      FROM FJProduksi_h h
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
    .query("SELECT Tanggal FROM FJProduksi_h WHERE NoProduksi = @np");
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
  req.input("sh", sql.VarChar(20), String(shift ?? ""));
  req.input("tgl", sql.Date, tanggal || new Date());
  req.input("idm", sql.Int, idMesin);
  req.input("ido", sql.Int, idOperator);
  req.input("jk", sql.VarChar(10), String(jamKerja ?? ""));
  req.input("ja", sql.Int, jmlhAnggota || 0);
  req.input("hm", sql.VarChar(20), String(hourMeter ?? ""));
  req.input("jl", sql.Int, jamLembur == null || jamLembur === "" ? null : Number(jamLembur));
  await req.query(`
    UPDATE FJProduksi_h
    SET [Shift] = @sh, Tanggal = @tgl, IdMesin = @idm, IdOperator = @ido,
        JamKerja = @jk, JmlhAnggota = @ja, HourMeter = NULLIF(@hm, ''), JamLembur = @jl
    WHERE NoProduksi = @np
  `);
  return { noProduksi };
}

/**
 * Ganti produksi: selalu membuat NoProduksi SA baru — header baru dengan
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
    .query("SELECT Tanggal, IdMesin, IdOperator FROM FJProduksi_h WHERE NoProduksi = @np");
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
    genReq.input("sh", sql.VarChar(20), String(shift ?? ""));
    genReq.input("tgl", sql.Date, tanggal || cur.Tanggal);
    genReq.input("idm", sql.Int, idMesin ?? cur.IdMesin);
    genReq.input("ido", sql.Int, idOperator ?? cur.IdOperator);
    genReq.input("jk", sql.VarChar(10), String(jamKerja ?? ""));
    genReq.input("ja", sql.Int, jmlhAnggota || 0);
    genReq.input("hm", sql.VarChar(20), String(hourMeter ?? ""));
    genReq.input("jl", sql.Int, jamLembur == null || jamLembur === "" ? null : Number(jamLembur));
    const genRes = await genReq.query(`
      DECLARE @np VARCHAR(20);
      SELECT @np = 'SA.' + FORMAT(RIGHT(ISNULL(MAX(NoProduksi), 'SA.000000'), 6) + 1, '000000')
      FROM FJProduksi_h WITH (UPDLOCK, HOLDLOCK);
      INSERT INTO FJProduksi_h (NoProduksi, [Shift], Tanggal, IdMesin, IdOperator, JamKerja, JmlhAnggota, HourMeter, JamLembur)
      VALUES (@np, @sh, @tgl, @idm, @ido, @jk, @ja, NULLIF(@hm, ''), @jl);
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
    .query("SELECT Tanggal FROM FJProduksi_h WHERE NoProduksi = @np");
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
      DELETE FROM FJProduksiOutput WHERE NoProduksi = @np;
      DELETE FROM FJProduksi_Reject WHERE NoProduksi = @np;
      DELETE FROM FJProduksi_h WHERE NoProduksi = @np;
    `);
    await tx.commit();
  } catch (e) {
    await tx.rollback();
    throw e;
  }
  return { noProduksi };
}

/**
 * Buat label output FJ (S.xxxxxx). Daftar ukuran — satu label boleh punya > 1
 * baris FJ_d. IdOrgTelly dari user login; label yang dibuat dari halaman
 * produksi ikut tercatat sebagai output produksi tsb.
 */
async function createLabel({
  idJenisKayu, idGrade, noS4SAsal, noSPKAsal, noSPK, ukuran,
  tebal, lebar, panjang, jmlhBatang, idLokasi,
  isRepair, isReject, isLembur, noProduksi,
  noBongkarSusun, dateCreate, tanggal, rawDate, jam,
  idUOMTblLebar, idUOMPanjang,
  idUsername,
}) {
  const effectiveDate = dateCreate || tanggal || rawDate || new Date();
  await assertPeriodeTerbuka(noProduksi ? await getTanggalProduksi(noProduksi) : effectiveDate);

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

  // FJ_h.NoSPK/NoSPKAsal varchar(20), NoS4SAsal varchar(13), IdLokasi varchar(5).
  if (String(noSPK || "").length > 20 || String(noSPKAsal || "").length > 20) {
    const err = new Error("No SPK / No SPK Asal maksimal 20 karakter");
    err.status = 400;
    throw err;
  }
  if (String(noS4SAsal || "").length > 13) {
    const err = new Error("No S4S Asal maksimal 13 karakter");
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
  req.input("s4sasal", sql.VarChar(13), noS4SAsal || "");
  req.input("stasal", sql.VarChar(20), noSPKAsal || "");
  req.input("nospk", sql.VarChar(20), noSPK || "");
  req.input("lok", sql.VarChar(5), lokasi);
  req.input("otel", sql.Int, idOrgTelly);
  req.input("isrep", sql.Bit, isRepair ? 1 : 0);
  req.input("isrej", sql.Bit, isReject ? 1 : 0);
  req.input("isleb", sql.Bit, isLembur ? 1 : 0);
  req.input("date", sql.Date, effectiveDate);
  req.input("jam", sql.VarChar(8), jam || new Date().toTimeString().slice(0, 5));
  req.input("uomLebar", sql.Int, Number(idUOMTblLebar) || 1);
  req.input("uomPanjang", sql.Int, Number(idUOMPanjang) || 1);

  const dimTuples = rows.map((r, i) => {
    req.input(`t${i}`, sql.VarChar(20), r.tebal);
    req.input(`l${i}`, sql.VarChar(20), r.lebar);
    req.input(`p${i}`, sql.VarChar(20), r.panjang);
    req.input(`b${i}`, sql.VarChar(20), r.jmlhBatang);
    return `(@ns, ${i + 1}, @t${i}, @l${i}, @p${i}, @b${i})`;
  }).join(",\n      ");

  // TRY/CATCH: tanpa ini, kegagalan INSERT FJ_h (statement-level) tetap
  // dilanjuti INSERT FJ_d sehingga error aslinya tertutupi.
  const result = await req.query(`
    BEGIN TRY
      DECLARE @ns VARCHAR(20);
      SELECT @ns = ISNULL('S.' + FORMAT(RIGHT(MAX(NoFJ), 6) + 1, '000000'), 'S.000001')
      FROM FJ_h;
      INSERT INTO FJ_h (NoFJ, IdJenisKayu, IdGrade, IdOrgTelly, DateCreate, DateUsage, NoS4SAsal, IdUOMTblLebar, IdUOMPanjang, NoSPK, Jam, IsReject, IsLembur, IdWarehouse, IdFisik, NoSPKAsal, IdLokasi, HasBeenPrinted, IsRepair)
      VALUES (@ns, @jk, @gr, @otel, @date, NULL, NULLIF(@s4sasal, ''), @uomLebar, @uomPanjang, NULLIF(@nospk, ''), @jam, @isrej, @isleb, 5, NULL, NULLIF(@stasal, ''), @lok, 0, @isrep);
      INSERT INTO FJ_d (NoFJ, NoUrut, Tebal, Lebar, Panjang, JmlhBatang)
      VALUES
        ${dimTuples};
      SELECT @ns AS NoFJ;
    END TRY
    BEGIN CATCH
      THROW;
    END CATCH
  `);

  const noFJ = result.recordset[0] ? result.recordset[0].NoFJ : null;

  if (noFJ && noProduksi) {
    const attachReq = pool.request();
    attachReq.input("np", sql.VarChar(20), noProduksi);
    attachReq.input("ns", sql.VarChar(20), noFJ);
    await attachReq.query(`
      IF NOT EXISTS (SELECT 1 FROM FJProduksiOutput WHERE NoProduksi = @np AND NoFJ = @ns)
        INSERT INTO FJProduksiOutput (NoProduksi, NoFJ) VALUES (@np, @ns)
    `);
  }

  if (noFJ && noBongkarSusun) {
    const attachReq = pool.request();
    attachReq.input("nbs", sql.VarChar(20), noBongkarSusun);
    attachReq.input("nfj", sql.VarChar(20), noFJ);
    await attachReq.query(`
      IF NOT EXISTS (SELECT 1 FROM BongkarSusunOutputFJ WHERE NoBongkarSusun = @nbs AND NoFJ = @nfj)
        INSERT INTO BongkarSusunOutputFJ (NoFJ, NoBongkarSusun) VALUES (@nfj, @nbs)
    `);
  }

  return noFJ;
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

  await req.query(`
    INSERT INTO ${inputTable} (${mapping.col}, NoProduksi, DateTimeSaved)
    VALUES (@lbl, @np, GETDATE());
  `);

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
 * FJProduksi_h.Tanggal (bukan GETDATE()) supaya produksi backdate mencantumkan
 * tanggal produksinya sendiri. Dipanggil dari tombol "Simpan Input".
 */
async function simpanInput({ noProduksi, spkTujuan }) {
  if (!noProduksi) {
    const err = new Error("noProduksi wajib diisi");
    err.status = 400;
    throw err;
  }
  const tglProduksi = await getTanggalProduksi(noProduksi);
  await assertPeriodeTerbuka(tglProduksi);
  const pool = await poolPromise;

  // SPK tujuan per label (dipilih di popup setelah scan) diisi ke NoSPKTujuan header label
  // hanya saat Simpan Input — dan hanya untuk label temporary milik produksi ini.
  const items = Array.isArray(spkTujuan) ? spkTujuan : [];
  if (items.length) {
    const spkSet = new Set(
      (await pool.request().query(`SELECT NoSPK FROM MstSPK_h WHERE [Enable] = 1`)).recordset.map((r) => r.NoSPK),
    );
    const hasCol = {};
    for (const it of items) {
      const type = normalizeType(it?.tipe);
      const mapping = MASTER_BY_KEY[type];
      const noSpk = String(it?.noSpk ?? "").trim();
      const noLabel = String(it?.noLabel ?? "").trim();
      if (!mapping || !noLabel || !noSpk) continue;
      if (!spkSet.has(noSpk)) {
        const err = new Error(`SPK tujuan '${noSpk}' tidak valid / tidak aktif`);
        err.status = 400;
        throw err;
      }
      if (hasCol[type] === undefined) {
        const c = await pool
          .request()
          .query(`SELECT COL_LENGTH('${mapping.master}', 'NoSPKTujuan') AS L`);
        hasCol[type] = c.recordset[0].L !== null;
      }
      if (!hasCol[type]) continue;
      await pool
        .request()
        .input("np", sql.VarChar(20), noProduksi)
        .input("lbl", sql.VarChar(50), noLabel)
        .input("spk", sql.VarChar(20), noSpk)
        .query(`
          UPDATE H SET H.NoSPKTujuan = @spk
          FROM ${mapping.master} H
          INNER JOIN ${INPUT_TABLES[type]} I ON I.${mapping.col} = H.${mapping.col}
          WHERE I.NoProduksi = @np AND H.${mapping.col} = @lbl AND H.DateUsage IS NULL
        `);
    }
  }

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

async function addOutput({ noProduksi, noFJ }) {
  await assertPeriodeTerbuka(await getTanggalProduksi(noProduksi));
  const pool = await poolPromise;
  const req = pool.request();
  req.input("np", sql.VarChar(20), noProduksi);
  req.input("ns", sql.VarChar(20), noFJ);

  await req.query(`
    INSERT INTO FJProduksiOutput (NoProduksi, NoFJ)
    VALUES (@np, @ns)
  `);

  return { noProduksi, noFJ };
}

async function removeOutput({ noProduksi, noFJ }) {
  await assertPeriodeTerbuka(await getTanggalProduksi(noProduksi));
  const pool = await poolPromise;
  const req = pool.request();
  req.input("np", sql.VarChar(20), noProduksi);
  req.input("ns", sql.VarChar(20), noFJ);

  await req.query(`
    DELETE FROM FJProduksiOutput WHERE NoProduksi = @np AND NoFJ = @ns
  `);

  return { noProduksi, noFJ };
}

// ── Stok Item: label input (master) yang belum dipakai, dikelompokkan per jenis ──
const STOK_MASTERS = {
  S4S: { table: "S4S_h", col: "NoS4S", uomLebar: "IdUOMTblLebar" },
  // WIP_h memakai ejaan kolom berbeda: IdUOMTlbLebar (bukan IdUOMTblLebar).
  WIP: { table: "WIP_h", col: "NoWIP", uomLebar: "IdUOMTlbLebar" },
  CCAKHIR: { table: "CCAkhir_h", col: "NoCCAkhir", uomLebar: "IdUOMTblLebar" },
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
 * dibulatkan 4 desimal. Alias tabel master harus "A".
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
        CASE WHEN A.${m.uomLebar} = 3 THEN 645.16 ELSE 1 END *
        CASE WHEN A.IdUOMPanjang = 4 THEN 304.8 ELSE 1 END, 4, 1), 0) AS M3
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

// ── Reject produksi (FJProduksi_Reject: NoProduksi, Tebal, Lebar, Panjang, JmlhBatang, M3, IdUOMTblLebar, IdUOMPanjang) ──
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
    SELECT @tot = JmlhBatang + @j FROM FJProduksi_Reject
    WHERE NoProduksi = @np AND Tebal = @t AND Lebar = @l AND Panjang = @p
      AND IdUOMTblLebar = @ul AND IdUOMPanjang = @up;
    IF @tot IS NOT NULL
      UPDATE FJProduksi_Reject
      SET JmlhBatang = @tot,
          M3 = ${REJECT_M3_TOTAL_EXPR}
      WHERE NoProduksi = @np AND Tebal = @t AND Lebar = @l AND Panjang = @p
        AND IdUOMTblLebar = @ul AND IdUOMPanjang = @up
    ELSE
      INSERT INTO FJProduksi_Reject (NoProduksi, Tebal, Lebar, Panjang, JmlhBatang, M3, IdUOMTblLebar, IdUOMPanjang)
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
    DELETE FROM FJProduksi_Reject
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
