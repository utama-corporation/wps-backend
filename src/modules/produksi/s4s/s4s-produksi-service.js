const { sql, poolPromise } = require("../../../core/config/db");

async function getMesinList() {
  console.log('mesin list');

  const pool = await poolPromise;
  const result = await pool.request().query(`
    SELECT
      M.IdMesin,
      M.NamaMesin,
      CASE WHEN P.NoProduksi IS NULL THEN 0 ELSE 1 END AS IsJalanHariIni,
      ISNULL(P.Shift, '') AS Shift,
      ISNULL(P.NoProduksi, '') AS NoProduksi
    FROM MstMesin M
    INNER JOIN MstBagian B ON B.IdBagian = M.IdBagian
    OUTER APPLY (
      SELECT TOP 1 H.NoProduksi, H.Shift
      FROM S4SProduksi_h H
      WHERE H.IdMesin = M.IdMesin
        AND H.Tanggal = CONVERT(date, GETDATE())
      ORDER BY H.NoProduksi DESC
    ) P
    WHERE M.Enable = 1
      AND B.NamaBagian LIKE '%S4S%'
    ORDER BY M.NamaMesin
  `);
  return result.recordset;
}

async function getHistory() {
  const pool = await poolPromise;
  const headers = await pool.request().query(`
    SELECT TOP 40
      A.NoProduksi, A.Tanggal, A.Shift,
      ISNULL(B.NamaMesin, '-') AS NamaMesin,
      A.JamKerja, A.JmlhAnggota,
      ISNULL(C.NamaOperator, '-') AS OperatorName
    FROM S4SProduksi_h A
    LEFT JOIN MstMesin B ON B.IdMesin = A.IdMesin
    LEFT JOIN MstOperator C ON C.IdOperator = A.IdOperator
    ORDER BY A.Tanggal DESC, A.NoProduksi DESC
  `);

  const rows = headers.recordset;
  if (!rows.length) return [];

  const noProduksiList = rows.map((r) => r.NoProduksi);
  const params = [];
  const whereParams = noProduksiList
    .map((_, index) => {
      const paramName = "NP" + index;
      params.push({ paramName, value: noProduksiList[index] });
      return "@" + paramName;
    })
    .join(", ");

  const req = pool.request();
  params.forEach(({ paramName, value }) => {
    req.input(paramName, sql.VarChar(20), value);
  });

  const outputs = await req.query(`
    SELECT O.NoProduksi, J.Jenis
    FROM S4SProduksiOutput O
    INNER JOIN S4S_h H ON H.NoS4S = O.NoS4S
    INNER JOIN MstJenisKayu J ON J.IdJenisKayu = H.IdJenisKayu
    WHERE O.NoProduksi IN (${whereParams})
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

  return rows.map((r) => ({
    ...r,
    JenisOutput: (outputMap.get(String(r.NoProduksi).toUpperCase()) || []).join(", "),
  }));
}

async function getNextNoProduksi() {
  const pool = await poolPromise;
  const result = await pool.request().query(`
    SELECT 'RA.' + FORMAT(RIGHT(ISNULL(MAX(NoProduksi), 'RA.000000'), 6) + 1, '000000') AS NoProduksi
    FROM S4SProduksi_h
  `);
  return result.recordset[0] ? result.recordset[0].NoProduksi : "RA.000001";
}

async function getNextNoLabel() {
  const pool = await poolPromise;
  const result = await pool.request().query(`
    SELECT ISNULL('R.' + FORMAT(RIGHT(MAX(NoS4S), 6) + 1, '000000'), 'R.000001') AS NoS4S
    FROM S4S_h
  `);
  return result.recordset[0] ? result.recordset[0].NoS4S : "R.000001";
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
      SELECT A.NamaGrade, A.IdGrade
      FROM MstGrade A
      LEFT JOIN MstGrade_d B ON B.IdGrade = A.IdGrade
      LEFT JOIN MstJenisKayu C ON C.IdJenisKayu = B.IdJenisKayu
      WHERE A.[Enable] = 1 AND B.Category = 'S4S'
      ORDER BY A.NamaGrade
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

async function saveHeader({
  shift, tanggal, idMesin, idOperator, jamKerja, jmlhAnggota, hourMeter,
}) {
  const pool = await poolPromise;
  const req = pool.request();

  req.input("sh", sql.VarChar(20), shift || "");
  req.input("tgl", sql.Date, tanggal || new Date());
  req.input("idm", sql.Int, idMesin);
  req.input("ido", sql.Int, idOperator);
  req.input("jk", sql.VarChar(10), jamKerja || "");
  req.input("ja", sql.Int, jmlhAnggota || 0);
  req.input("hm", sql.VarChar(20), hourMeter || "");

  const result = await req.query(`
    DECLARE @np VARCHAR(20);
    SELECT @np = 'RA.' + FORMAT(RIGHT(ISNULL(MAX(NoProduksi), 'RA.000000'), 6) + 1, '000000')
    FROM S4SProduksi_h;
    INSERT INTO S4SProduksi_h (NoProduksi, [Shift], Tanggal, IdMesin, IdOperator, JamKerja, JmlhAnggota, HourMeter)
    VALUES (@np, @sh, @tgl, @idm, @ido, @jk, @ja, @hm);
    SELECT @np AS NoProduksi;
  `);

  return result.recordset[0] ? result.recordset[0].NoProduksi : null;
}

async function createLabel({
  idJenisKayu, idGrade, noSPKAsal, noSPK, tebal, lebar, panjang, jmlhBatang, idLokasi,
}) {
  const pool = await poolPromise;
  const req = pool.request();

  req.input("jk", sql.Int, idJenisKayu);
  req.input("gr", sql.Int, idGrade);
  req.input("stasal", sql.VarChar(50), noSPKAsal || "");
  req.input("nospk", sql.VarChar(50), noSPK || "");
  req.input("tb", sql.VarChar(20), tebal);
  req.input("lb", sql.VarChar(20), lebar);
  req.input("pj", sql.VarChar(20), panjang);
  req.input("bt", sql.VarChar(20), jmlhBatang);
  req.input("lok", sql.Int, idLokasi || null);

  const result = await req.query(`
    DECLARE @ns VARCHAR(20);
    SELECT @ns = ISNULL('R.' + FORMAT(RIGHT(MAX(NoS4S), 6) + 1, '000000'), 'R.000001')
    FROM S4S_h;
    INSERT INTO S4S_h (NoS4S, IdJenisKayu, IdGrade, IdOrgTelly, DateCreate, DateUsage, NoSTAsal, IdUOMTblLebar, IdUOMPanjang, NoSPK, Jam, IsReject, IsLembur, IdWarehouse, IdFisik, NoSPKAsal, IdLokasi, HasBeenPrinted)
    VALUES (@ns, @jk, @gr, 1, GETDATE(), NULL, NULLIF(@stasal, ''), 1, 1, NULLIF(@nospk, ''), FORMAT(GETDATE(), 'HH:mm'), 0, 0, 5, 5, NULL, @lok, 0);
    INSERT INTO S4S_d (NoS4S, NoUrut, Tebal, Lebar, Panjang, JmlhBatang)
    VALUES (@ns, 1, @tb, @lb, @pj, @bt);
    SELECT @ns AS NoS4S;
  `);

  return result.recordset[0] ? result.recordset[0].NoS4S : null;
}

const INPUT_TABLES = {
  ST: "S4SProduksiInputST",
  S4S: "S4SProduksiInputS4S",
  CCAKHIR: "S4SProduksiInputCCAkhir",
  FJ: "S4SProduksiInputFJ",
  MOULDING: "S4SProduksiInputMoulding",
};

const MASTER_BY_KEY = {
  ST: { master: "ST_h", detail: "ST_d", col: "NoST" },
  S4S: { master: "S4S_h", detail: "S4S_d", col: "NoS4S" },
  CCAKHIR: { master: "CCAkhir_h", detail: "CCAkhir_d", col: "NoCCAkhir" },
  FJ: { master: "FJ_h", detail: "FJ_d", col: "NoFJ" },
  MOULDING: { master: "Moulding_h", detail: "Moulding_d", col: "NoMoulding" },
};

function normalizeType(value) {
  return String(value || "").trim().toUpperCase();
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

  const duplicated = await req.query(
    `SELECT COUNT(*) AS Cnt FROM ${inputTable} WHERE ${mapping.col} = @lbl AND NoProduksi = @np`
  );
  if (duplicated.recordset[0].Cnt > 0) {
    const err = new Error(`Label '${noLabel}' sudah ditambahkan`);
    err.status = 400;
    throw err;
  }

  await req.query(`
    INSERT INTO ${inputTable} (${mapping.col}, NoProduksi, DateTimeSaved)
    VALUES (@lbl, @np, GETDATE());
    UPDATE ${mapping.master} SET DateUsage = GETDATE() WHERE ${mapping.col} = @lbl;
  `);

  return { noProduksi, noLabel, tipe: type };
}

async function getInputList({tipe, noProduksi}) {  
  const type = normalizeType(tipe);
  const inputTable = INPUT_TABLES[type];
  const mapping = MASTER_BY_KEY[type];
  if (!inputTable || !mapping) {
    const err = new Error("Tipe input tidak valid");
    err.status = 400;
    throw err;
  }

  const pool = await poolPromise;
  const req = pool.request();
  req.input('np', sql.VarChar(20), noProduksi);

  const result = await req.query(`
    SELECT 
      j.Jenis, 
      d.* 
    FROM ${inputTable} i
    LEFT OUTER JOIN ${mapping.master} h ON i.${mapping.col}=h.${mapping.col}
    LEFT OUTER JOIN ${mapping.detail} d ON i.${mapping.col}=d.${mapping.col} 
    LEFT OUTER JOIN MstJenisKayu j ON h.IdJenisKayu=j.IdJenisKayu
    WHERE i.NoProduksi=@np
  `);

  return result.recordset;
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

async function addOutput({ noProduksi, noS4S }) {
  const pool = await poolPromise;
  const req = pool.request();
  req.input("np", sql.VarChar(20), noProduksi);
  req.input("ns", sql.VarChar(20), noS4S);

  await req.query(`
    INSERT INTO S4SProduksiOutput (NoProduksi, NoS4S)
    VALUES (@np, @ns)
  `);

  return { noProduksi, noS4S };
}

async function removeOutput({ noProduksi, noS4S }) {
  const pool = await poolPromise;
  const req = pool.request();
  req.input("np", sql.VarChar(20), noProduksi);
  req.input("ns", sql.VarChar(20), noS4S);

  await req.query(`
    DELETE FROM S4SProduksiOutput WHERE NoProduksi = @np AND NoS4S = @ns
  `);

  return { noProduksi, noS4S };
}

module.exports = {
  getMesinList,
  getHistory,
  getNextNoProduksi,
  getNextNoLabel,
  getMasterOptions,
  saveHeader,
  createLabel,
  addInput,
  getInputList,
  removeInput,
  addOutput,
  removeOutput,
};
