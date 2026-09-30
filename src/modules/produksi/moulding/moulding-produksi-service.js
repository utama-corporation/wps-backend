const { sql, poolPromise } = require("../../../core/config/db");

async function getMesinList() {
  const pool = await poolPromise;
  const result = await pool.request().query(`
    SELECT
      M.IdMesin,
      M.NamaMesin,
      CASE WHEN P.NoProduksi IS NULL THEN 0 ELSE 1 END AS IsJalanHariIni,
      ISNULL(P.Shift, '') AS Shift,
      ISNULL(P.NoProduksi, '') AS NoProduksi
    FROM MstMesin M
    OUTER APPLY (
      SELECT TOP 1 H.NoProduksi, H.Shift
      FROM MouldingProduksi_h H
      WHERE H.IdMesin = M.IdMesin
        AND H.Tanggal = CONVERT(date, GETDATE())
      ORDER BY H.NoProduksi DESC
    ) P
    WHERE M.Enable = 1
      AND M.IdBagian = 3
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
    FROM MouldingProduksi_h A
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
    FROM MouldingProduksiOutput O
    INNER JOIN Moulding_h H ON H.NoMoulding = O.NoMoulding
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
    SELECT 'TA.' + FORMAT(RIGHT(ISNULL(MAX(NoProduksi), 'TA.000000'), 6) + 1, '000000') AS NoProduksi
    FROM MouldingProduksi_h
  `);
  return result.recordset[0] ? result.recordset[0].NoProduksi : "TA.000001";
}

async function getNextNoLabel() {
  const pool = await poolPromise;
  const result = await pool.request().query(`
    SELECT ISNULL('T.' + FORMAT(RIGHT(MAX(NoMoulding), 6) + 1, '000000'), 'T.000001') AS NoMoulding
    FROM Moulding_h
  `);
  return result.recordset[0] ? result.recordset[0].NoMoulding : "T.000001";
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
      WHERE A.[Enable] = 1 AND B.Category = 'MOULDING'
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
  shift, tanggal, idMesin, idOperator, jamKerja, jmlhAnggota, hourMeter, jamLembur,
}) {
  const pool = await poolPromise;
  const req = pool.request();
  req.input("sh", sql.Int, shift == null ? 1 : shift);
  req.input("tgl", sql.Date, tanggal || new Date());
  req.input("idm", sql.Int, idMesin);
  req.input("ido", sql.Int, idOperator);
  req.input("jk", sql.Int, jamKerja == null ? 0 : jamKerja);
  req.input("ja", sql.Int, jmlhAnggota == null ? 0 : jmlhAnggota);
  req.input("hm", sql.Float, hourMeter == null ? null : hourMeter);
  req.input("jl", sql.Decimal(5, 2), jamLembur == null ? null : jamLembur);

  const result = await req.query(`
    DECLARE @np VARCHAR(20);
    SELECT @np = 'TA.' + FORMAT(RIGHT(ISNULL(MAX(NoProduksi), 'TA.000000'), 6) + 1, '000000')
    FROM MouldingProduksi_h;
    INSERT INTO MouldingProduksi_h (NoProduksi, [Shift], Tanggal, IdMesin, IdOperator, JamKerja, JmlhAnggota, HourMeter, JamLembur)
    VALUES (@np, @sh, @tgl, @idm, @ido, @jk, @ja, @hm, @jl);
    SELECT @np AS NoProduksi;
  `);

  return result.recordset[0] ? result.recordset[0].NoProduksi : null;
}

async function createLabel({
  idJenisKayu, idGrade, noSPKAsal, noSPK, tebal, lebar, panjang, jmlhBatang,
}) {
  const pool = await poolPromise;
  const req = pool.request();

  req.input("jk", sql.Int, idJenisKayu);
  req.input("gr", sql.Int, idGrade);
  req.input("stasal", sql.VarChar(50), noSPKAsal || "");
  req.input("nospk", sql.VarChar(50), noSPK || "");
  req.input("tb", sql.VarChar(20), tebal == null ? null : String(tebal));
  req.input("lb", sql.VarChar(20), lebar == null ? null : String(lebar));
  req.input("pj", sql.VarChar(20), panjang == null ? null : String(panjang));
  req.input("bt", sql.VarChar(20), jmlhBatang == null ? null : String(jmlhBatang));

  const result = await req.query(`
    DECLARE @ns VARCHAR(20);
    SELECT @ns = ISNULL('T.' + FORMAT(RIGHT(MAX(NoMoulding), 6) + 1, '000000'), 'T.000001')
    FROM Moulding_h;
    INSERT INTO Moulding_h (NoMoulding, IdJenisKayu, IdGrade, IdOrgTelly, DateCreate, DateUsage, IdUOMTblLebar, IdUOMPanjang, NoSPK, Jam, IsReject, IdWarehouse, IdFisik, NoSPKAsal, IdLokasi, HasBeenPrinted)
    VALUES (@ns, @jk, @gr, 1, GETDATE(), NULL, 1, 1, NULLIF(@nospk, ''), FORMAT(GETDATE(), 'HH:mm'), 0, 5, 5, NULLIF(@stasal, ''), NULL, 0);
    INSERT INTO Moulding_d (NoMoulding, NoUrut, Tebal, Lebar, Panjang, JmlhBatang)
    VALUES (@ns, 1, @tb, @lb, @pj, @bt);
    SELECT @ns AS NoMoulding;
  `);

  return result.recordset[0] ? result.recordset[0].NoMoulding : null;
}

const INPUT_TABLES = {
  BARANGJADI: "MouldingProduksiInputBarangJadi",
  CCAKHIR: "MouldingProduksiInputCCAkhir",
  FJ: "MouldingProduksiInputFJ",
  LAMINATING: "MouldingProduksiInputLaminating",
  MOULDING: "MouldingProduksiInputMoulding",
  S4S: "MouldingProduksiInputS4S",
  SANDING: "MouldingProduksiInputSanding",
};

const MASTER_BY_KEY = {
  BARANGJADI: { master: "BarangJadi_h", col: "NoBJ" },
  CCAKHIR: { master: "CCAkhir_h", col: "NoCCAkhir" },
  FJ: { master: "FJ_h", col: "NoFJ" },
  LAMINATING: { master: "Laminating_h", col: "NoLaminating" },
  MOULDING: { master: "Moulding_h", col: "NoMoulding" },
  S4S: { master: "S4S_h", col: "NoS4S" },
  SANDING: { master: "Sanding_h", col: "NoSanding" },
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

async function addOutput({
  noProduksi, noMoulding, idJenisKayu, idGrade, noSPKAsal, noSPK,
  tebal, lebar, panjang, jmlhBatang,
}) {
  const pool = await poolPromise;
  const req = pool.request();
  req.input("np", sql.VarChar(20), noProduksi);
  req.input("nm", sql.VarChar(20), noMoulding);
  req.input("jk", sql.Int, idJenisKayu);
  req.input("gr", sql.Int, idGrade);
  req.input("stasal", sql.VarChar(50), noSPKAsal || "");
  req.input("nospk", sql.VarChar(50), noSPK || "");
  req.input("tb", sql.VarChar(20), tebal == null ? null : String(tebal));
  req.input("lb", sql.VarChar(20), lebar == null ? null : String(lebar));
  req.input("pj", sql.VarChar(20), panjang == null ? null : String(panjang));
  req.input("bt", sql.VarChar(20), jmlhBatang == null ? null : String(jmlhBatang));

  await req.query(`
    IF NOT EXISTS (SELECT 1 FROM Moulding_h WHERE NoMoulding = @nm)
    BEGIN
      INSERT INTO Moulding_h (NoMoulding, IdJenisKayu, IdGrade, IdOrgTelly, DateCreate, DateUsage, IdUOMTblLebar, IdUOMPanjang, NoSPK, Jam, IsReject, IdWarehouse, IdFisik, NoSPKAsal, IdLokasi, HasBeenPrinted)
      VALUES (@nm, @jk, @gr, 1, GETDATE(), NULL, 1, 1, NULLIF(@nospk, ''), FORMAT(GETDATE(), 'HH:mm'), 0, 5, 5, NULLIF(@stasal, ''), NULL, 0);
      INSERT INTO Moulding_d (NoMoulding, NoUrut, Tebal, Lebar, Panjang, JmlhBatang)
      VALUES (@nm, 1, @tb, @lb, @pj, @bt);
    END
    INSERT INTO MouldingProduksiOutput (NoProduksi, NoMoulding)
    VALUES (@np, @nm);
  `);

  return { noProduksi, noMoulding };
}

async function removeOutput({ noProduksi, noMoulding }) {
  const pool = await poolPromise;
  const req = pool.request();
  req.input("np", sql.VarChar(20), noProduksi);
  req.input("nm", sql.VarChar(20), noMoulding);

  await req.query(`
    DELETE FROM MouldingProduksiOutput WHERE NoProduksi = @np AND NoMoulding = @nm
  `);

  return { noProduksi, noMoulding };
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
        ISNULL(h.JamKerja, 0) AS JamKerja,
        ISNULL(h.JmlhAnggota, 0) AS JmlhAnggota,
        ISNULL(h.HourMeter, 0) AS HourMeter,
        ISNULL(h.JamLembur, 0) AS JamLembur,
        ISNULL(m.NamaMesin, '-') AS NamaMesin,
        ISNULL(o.NamaOperator, '-') AS NamaOperator
      FROM MouldingProduksi_h h
      LEFT JOIN MstMesin m ON m.IdMesin = h.IdMesin
      LEFT JOIN MstOperator o ON o.IdOperator = h.IdOperator
      WHERE h.NoProduksi = @np
    `);
  return result.recordset[0] || null;
}

async function updateHeader({
  noProduksi, shift, jmlhAnggota, jamKerja, jamLembur, hourMeter,
}) {
  const pool = await poolPromise;
  const req = pool.request();
  req.input("np", sql.VarChar(20), noProduksi);
  req.input("sh", sql.Int, shift == null ? 1 : shift);
  req.input("ja", sql.Int, jmlhAnggota == null ? 0 : jmlhAnggota);
  req.input("jk", sql.Int, jamKerja == null ? 0 : jamKerja);
  req.input("jl", sql.Decimal(5, 2), jamLembur == null ? null : jamLembur);
  req.input("hm", sql.Float, hourMeter == null ? null : hourMeter);

  await req.query(`
    UPDATE MouldingProduksi_h SET
      Shift = @sh,
      JmlhAnggota = @ja,
      JamKerja = @jk,
      JamLembur = @jl,
      HourMeter = @hm
    WHERE NoProduksi = @np
  `);

  return { noProduksi };
}

module.exports = {
  getMesinList,
  getHistory,
  getNextNoProduksi,
  getNextNoLabel,
  getMasterOptions,
  saveHeader,
  getHeader,
  updateHeader,
  createLabel,
  addInput,
  removeInput,
  addOutput,
  removeOutput,
};
