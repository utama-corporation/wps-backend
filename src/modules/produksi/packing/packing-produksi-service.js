const { sql, poolPromise } = require("../../../core/config/db");

function normalizeType(value) {
  return String(value || "").trim().toUpperCase();
}

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
      FROM PackingProduksi_h H
      WHERE H.IdMesin = M.IdMesin
        AND H.Tanggal = CONVERT(date, GETDATE())
      ORDER BY H.NoProduksi DESC
    ) P
    WHERE M.Enable = 1
      AND M.IdBagian = 7
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
    FROM PackingProduksi_h A
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
    FROM PackingProduksiOutput O
    INNER JOIN BarangJadi_h H ON H.NoBJ = O.NoBJ
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
    SELECT 'X.' + FORMAT(RIGHT(ISNULL(MAX(NoProduksi), 'X.000000'), 6) + 1, '000000') AS NoProduksi
    FROM PackingProduksi_h
  `);
  return result.recordset[0] ? result.recordset[0].NoProduksi : "X.000001";
}

async function getNextNoLabel() {
  const pool = await poolPromise;
  const result = await pool.request().query(`
    SELECT ISNULL('I.' + FORMAT(RIGHT(MAX(NoBJ), 6) + 1, '000000'), 'I.000001') AS NoBJ
    FROM BarangJadi_h
  `);
  return result.recordset[0] ? result.recordset[0].NoBJ : "I.000001";
}

async function getMasterOptions() {
  const pool = await poolPromise;
  const [jenisKayu, barangJadi, fjProfile, spk] = await Promise.all([
    pool.request().query(`
      SELECT Jenis, IdJenisKayu
      FROM MstJenisKayu
      WHERE [Enable] = 1 AND IsInternal = 1 AND IsNonST = 1
      ORDER BY Jenis
    `),
    pool.request().query(`
      SELECT NamaBarangJadi, IdBarangJadi
      FROM MstBarangJadi
      WHERE [Enable] = 1
      ORDER BY NamaBarangJadi
    `),
    pool.request().query(`
      SELECT [Profile], IdFJProfile
      FROM MstFJProfile
      WHERE IdFJProfile <> 0
      ORDER BY IdFJProfile
    `),
    pool.request().query(`
      SELECT NoSPK FROM MstSPK_h WHERE [Enable] = 1 ORDER BY NoSPK
    `),
  ]);

  return {
    jenisKayu: jenisKayu.recordset,
    barangJadi: barangJadi.recordset,
    fjProfile: fjProfile.recordset,
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
    SELECT @np = 'X.' + FORMAT(RIGHT(ISNULL(MAX(NoProduksi), 'X.000000'), 6) + 1, '000000')
    FROM PackingProduksi_h;
    INSERT INTO PackingProduksi_h (NoProduksi, [Shift], Tanggal, IdMesin, IdOperator, JamKerja, JmlhAnggota, HourMeter, JamLembur)
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
        ISNULL(h.JamKerja, 0) AS JamKerja,
        ISNULL(h.JmlhAnggota, 0) AS JmlhAnggota,
        ISNULL(h.HourMeter, 0) AS HourMeter,
        ISNULL(h.JamLembur, 0) AS JamLembur,
        ISNULL(m.NamaMesin, '-') AS NamaMesin,
        ISNULL(o.NamaOperator, '-') AS NamaOperator
      FROM PackingProduksi_h h
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
    UPDATE PackingProduksi_h SET
      Shift = @sh,
      JmlhAnggota = @ja,
      JamKerja = @jk,
      JamLembur = @jl,
      HourMeter = @hm
    WHERE NoProduksi = @np
  `);

  return { noProduksi };
}

async function createLabel({
  idJenisKayu, idBarangJadi, idFJProfile, noSPK, noSPKAsal, noWIPAsal, noMouldingAsal, noSandingAsal, idWarehouse, tebal, lebar, panjang, jmlhBatang,
}) {
  const pool = await poolPromise;
  const req = pool.request();

  req.input("jk", sql.Int, idJenisKayu);
  req.input("bj", sql.Int, idBarangJadi);
  req.input("fj", sql.Int, idFJProfile);
  req.input("nospk", sql.VarChar(50), noSPK || "");
  req.input("stasal", sql.VarChar(50), noSPKAsal || "");
  req.input("nwip", sql.VarChar(50), noWIPAsal || "");
  req.input("nmou", sql.VarChar(50), noMouldingAsal || "");
  req.input("nsan", sql.VarChar(50), noSandingAsal || "");
  req.input("wh", sql.Int, idWarehouse);
  req.input("tb", sql.VarChar(20), tebal);
  req.input("lb", sql.VarChar(20), lebar);
  req.input("pj", sql.VarChar(20), panjang);
  req.input("bt", sql.VarChar(20), jmlhBatang);

  const result = await req.query(`
    DECLARE @ns VARCHAR(20);
    SELECT @ns = ISNULL('I.' + FORMAT(RIGHT(MAX(NoBJ), 6) + 1, '000000'), 'I.000001')
    FROM BarangJadi_h;
    INSERT INTO BarangJadi_h (NoBJ, IdJenisKayu, IdBarangJadi, DateCreate, DateUsage, IdOrgTelly, IdFJProfile, NoSPK, Jam, IsReject, IsSisa, NoWIPAsal, NoMouldingAsal, NoSandingAsal, IdWarehouse, IsLembur)
    VALUES (@ns, @jk, @bj, GETDATE(), NULL, 1, ISNULL(@fj, 1), NULLIF(@nospk, ''), FORMAT(GETDATE(), 'HH:mm'), 0, 0, NULLIF(@nwip, ''), NULLIF(@nmou, ''), NULLIF(@nsan, ''), @wh, 0);
    INSERT INTO BarangJadi_d (NoBJ, NoUrut, Tebal, Lebar, Panjang, JmlhBatang)
    VALUES (@ns, 1, @tb, @lb, @pj, @bt);
    SELECT @ns AS NoBJ;
  `);

  return result.recordset[0] ? result.recordset[0].NoBJ : null;
}

const INPUT_TABLES = {
  BARANGJADI: "PackingProduksiInputBarangJadi",
  CCAKHIR: "PackingProduksiInputCCAkhir",
  MOULDING: "PackingProduksiInputMoulding",
  SANDING: "PackingProduksiInputSanding",
  WIP: "PackingProduksiInputWIP",
};

const MASTER_BY_KEY = {
  BARANGJADI: { master: "BarangJadi_h", col: "NoBJ" },
  CCAKHIR: { master: "CCAkhir_h", col: "NoCCAkhir" },
  MOULDING: { master: "Moulding_h", col: "NoMoulding" },
  SANDING: { master: "Sanding_h", col: "NoSanding" },
  WIP: { master: "WIP_h", col: "NoWIP" },
};

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

  if (type === "WIP") {
    await req.query(`
      INSERT INTO ${inputTable} (${mapping.col}, NoProduksi)
      VALUES (@lbl, @np);
      UPDATE ${mapping.master} SET DateUsage = GETDATE() WHERE ${mapping.col} = @lbl;
    `);
  } else {
    await req.query(`
      INSERT INTO ${inputTable} (${mapping.col}, NoProduksi, DateTimeSaved)
      VALUES (@lbl, @np, GETDATE());
      UPDATE ${mapping.master} SET DateUsage = GETDATE() WHERE ${mapping.col} = @lbl;
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

async function addOutput({ noProduksi, noBJ }) {
  const pool = await poolPromise;
  const req = pool.request();
  req.input("np", sql.VarChar(20), noProduksi);
  req.input("ns", sql.VarChar(20), noBJ);

  const exists = await req.query(
    "SELECT COUNT(*) AS Cnt FROM BarangJadi_h WHERE NoBJ = @ns"
  );
  if (!exists.recordset[0] || exists.recordset[0].Cnt === 0) {
    const err = new Error(`Label '${noBJ}' tidak terdaftar di BarangJadi_h`);
    err.status = 400;
    throw err;
  }

  await req.query(`
    INSERT INTO PackingProduksiOutput (NoProduksi, NoBJ)
    VALUES (@np, @ns)
  `);

  return { noProduksi, noBJ };
}

async function removeOutput({ noProduksi, noBJ }) {
  const pool = await poolPromise;
  const req = pool.request();
  req.input("np", sql.VarChar(20), noProduksi);
  req.input("ns", sql.VarChar(20), noBJ);

  await req.query(`
    DELETE FROM PackingProduksiOutput WHERE NoProduksi = @np AND NoBJ = @ns
  `);

  return { noProduksi, noBJ };
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
