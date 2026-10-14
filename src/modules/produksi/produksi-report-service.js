const { sql, poolPromise } = require("../../core/config/db");

/**
 * Laporan produksi per nomor produksi - satu implementasi untuk semua proses.
 *
 * Bentuk data tiap proses memang seragam (header + junction input + junction
 * output + master/detail label), jadi yang berbeda antar proses hanya nama
 * tabelnya. Semua itu dideskripsikan di REPORT_CONFIGS, lalu query-nya
 * disusun dari config tersebut.
 *
 * Catatan kubik mengikuti SPWps_LapProduksi*: faktor 645.16 (IdUOMTblLebar=3,
 * inci) dan 304.8 (IdUOMPanjang=4, kaki) menormalkan ke mm sebelum perkalian.
 *
 * Karena tidak semua master label punya kolom yang sama, kolom optional
 * (IsReject, IsRepair, IdUOMTblLebar, IdUOMPanjang) dicek dulu lewat katalog
 * sys.columns. Contoh yang berbeda: ST_h tidak punya IsReject/IsRepair,
 * BarangJadi_h tidak punya IdUOMTblLebar/IdUOMPanjang, dan WIP_h tidak punya
 * IsRepair - kolom yang tidak ada diganti NULL, bukan 0 seperti dibuat-buat di
 * SP lama.
 *
 * UNION ALL (bukan UNION) supaya baris identik tidak ikut ter-dedup.
 */

// Config per proses.
//   nama        : tampil di sub-judul laporan
//   filePrefix  : prefix nama file PDF
//   headerTable : tabel header produksi
//   inputs      : [{ grp, junction, master, detail, col }]
//   outputs     : [{ grp, junction, master, detail, col }]
// Urutan array = urutan tampil tabel di laporan (setiap grup dapat baris
// pemisah sendiri).
const REPORT_CONFIGS = {
  s4s: {
    nama: "S4S",
    filePrefix: "ProduksiS4S",
    headerTable: "S4SProduksi_h",
    inputs: [
      { grp: "ST", junction: "S4SProduksiInputST", master: "ST_h", detail: "ST_d", col: "NoST" },
      { grp: "S4S", junction: "S4SProduksiInputS4S", master: "S4S_h", detail: "S4S_d", col: "NoS4S" },
      { grp: "CCAkhir", junction: "S4SProduksiInputCCAkhir", master: "CCAkhir_h", detail: "CCAkhir_d", col: "NoCCAkhir" },
      { grp: "FJ", junction: "S4SProduksiInputFJ", master: "FJ_h", detail: "FJ_d", col: "NoFJ" },
      { grp: "Moulding", junction: "S4SProduksiInputMoulding", master: "Moulding_h", detail: "Moulding_d", col: "NoMoulding" },
    ],
    outputs: [
      { grp: "S4S", junction: "S4SProduksiOutput", master: "S4S_h", detail: "S4S_d", col: "NoS4S" },
    ],
  },

  "finger-join": {
    nama: "Finger Join",
    filePrefix: "ProduksiFJ",
    headerTable: "FJProduksi_h",
    inputs: [
      { grp: "CCAkhir", junction: "FJProduksiInputCCAkhir", master: "CCAkhir_h", detail: "CCAkhir_d", col: "NoCCAkhir" },
      { grp: "S4S", junction: "FJProduksiInputS4S", master: "S4S_h", detail: "S4S_d", col: "NoS4S" },
      { grp: "WIP", junction: "FJProduksiInputWIP", master: "WIP_h", detail: "WIP_d", col: "NoWIP" },
    ],
    outputs: [
      { grp: "FJ", junction: "FJProduksiOutput", master: "FJ_h", detail: "FJ_d", col: "NoFJ" },
    ],
  },

  moulding: {
    nama: "Moulding",
    filePrefix: "ProduksiMld",
    headerTable: "MouldingProduksi_h",
    inputs: [
      { grp: "BarangJadi", junction: "MouldingProduksiInputBarangJadi", master: "BarangJadi_h", detail: "BarangJadi_d", col: "NoBJ" },
      { grp: "CCAkhir", junction: "MouldingProduksiInputCCAkhir", master: "CCAkhir_h", detail: "CCAkhir_d", col: "NoCCAkhir" },
      { grp: "FJ", junction: "MouldingProduksiInputFJ", master: "FJ_h", detail: "FJ_d", col: "NoFJ" },
      { grp: "Laminating", junction: "MouldingProduksiInputLaminating", master: "Laminating_h", detail: "Laminating_d", col: "NoLaminating" },
      { grp: "Moulding", junction: "MouldingProduksiInputMoulding", master: "Moulding_h", detail: "Moulding_d", col: "NoMoulding" },
      { grp: "S4S", junction: "MouldingProduksiInputS4S", master: "S4S_h", detail: "S4S_d", col: "NoS4S" },
      { grp: "Sanding", junction: "MouldingProduksiInputSanding", master: "Sanding_h", detail: "Sanding_d", col: "NoSanding" },
    ],
    outputs: [
      { grp: "Moulding", junction: "MouldingProduksiOutput", master: "Moulding_h", detail: "Moulding_d", col: "NoMoulding" },
    ],
  },

  laminating: {
    nama: "Laminating",
    filePrefix: "ProduksiLmt",
    headerTable: "LaminatingProduksi_h",
    inputs: [
      { grp: "BarangJadi", junction: "LaminatingProduksiInputBarangJadi", master: "BarangJadi_h", detail: "BarangJadi_d", col: "NoBJ" },
      { grp: "CCAkhir", junction: "LaminatingProduksiInputCCAkhir", master: "CCAkhir_h", detail: "CCAkhir_d", col: "NoCCAkhir" },
      { grp: "Moulding", junction: "LaminatingProduksiInputMoulding", master: "Moulding_h", detail: "Moulding_d", col: "NoMoulding" },
      { grp: "Sanding", junction: "LaminatingProduksiInputSanding", master: "Sanding_h", detail: "Sanding_d", col: "NoSanding" },
    ],
    outputs: [
      { grp: "Laminating", junction: "LaminatingProduksiOutput", master: "Laminating_h", detail: "Laminating_d", col: "NoLaminating" },
    ],
  },

  ccakhir: {
    nama: "Cross Cut Akhir",
    filePrefix: "ProduksiCca",
    headerTable: "CCAkhirProduksi_h",
    inputs: [
      { grp: "BarangJadi", junction: "CCAkhirProduksiInputBarangJadi", master: "BarangJadi_h", detail: "BarangJadi_d", col: "NoBJ" },
      { grp: "CCAkhir", junction: "CCAkhirProduksiInputCCAkhir", master: "CCAkhir_h", detail: "CCAkhir_d", col: "NoCCAkhir" },
      { grp: "FJ", junction: "CCAkhirProduksiInputFJ", master: "FJ_h", detail: "FJ_d", col: "NoFJ" },
      { grp: "Laminating", junction: "CCAkhirProduksiInputLaminating", master: "Laminating_h", detail: "Laminating_d", col: "NoLaminating" },
      { grp: "Moulding", junction: "CCAkhirProduksiInputMoulding", master: "Moulding_h", detail: "Moulding_d", col: "NoMoulding" },
      { grp: "Sanding", junction: "CCAkhirProduksiInputSanding", master: "Sanding_h", detail: "Sanding_d", col: "NoSanding" },
    ],
    // Cross Cut Akhir punya dua output: label CCAkhir dan label S4S.
    outputs: [
      { grp: "CCAkhir", junction: "CCAkhirProduksiOutput", master: "CCAkhir_h", detail: "CCAkhir_d", col: "NoCCAkhir" },
      { grp: "S4S", junction: "CCAkhirProduksiOutputS4S", master: "S4S_h", detail: "S4S_d", col: "NoS4S" },
    ],
  },

  sanding: {
    nama: "Sanding",
    filePrefix: "ProduksiSnd",
    headerTable: "SandingProduksi_h",
    inputs: [
      { grp: "BarangJadi", junction: "SandingProduksiInputBarangJadi", master: "BarangJadi_h", detail: "BarangJadi_d", col: "NoBJ" },
      { grp: "CCAkhir", junction: "SandingProduksiInputCCAkhir", master: "CCAkhir_h", detail: "CCAkhir_d", col: "NoCCAkhir" },
      { grp: "FJ", junction: "SandingProduksiInputFJ", master: "FJ_h", detail: "FJ_d", col: "NoFJ" },
      { grp: "Moulding", junction: "SandingProduksiInputMoulding", master: "Moulding_h", detail: "Moulding_d", col: "NoMoulding" },
      { grp: "Sanding", junction: "SandingProduksiInputSanding", master: "Sanding_h", detail: "Sanding_d", col: "NoSanding" },
    ],
    outputs: [
      { grp: "Sanding", junction: "SandingProduksiOutput", master: "Sanding_h", detail: "Sanding_d", col: "NoSanding" },
    ],
  },

  packing: {
    nama: "Barang Jadi",
    filePrefix: "ProduksiBJ",
    headerTable: "PackingProduksi_h",
    inputs: [
      { grp: "BarangJadi", junction: "PackingProduksiInputBarangJadi", master: "BarangJadi_h", detail: "BarangJadi_d", col: "NoBJ" },
      { grp: "CCAkhir", junction: "PackingProduksiInputCCAkhir", master: "CCAkhir_h", detail: "CCAkhir_d", col: "NoCCAkhir" },
      { grp: "Moulding", junction: "PackingProduksiInputMoulding", master: "Moulding_h", detail: "Moulding_d", col: "NoMoulding" },
      { grp: "Sanding", junction: "PackingProduksiInputSanding", master: "Sanding_h", detail: "Sanding_d", col: "NoSanding" },
      { grp: "WIP", junction: "PackingProduksiInputWIP", master: "WIP_h", detail: "WIP_d", col: "NoWIP" },
    ],
    outputs: [
      { grp: "BarangJadi", junction: "PackingProduksiOutput", master: "BarangJadi_h", detail: "BarangJadi_d", col: "NoBJ" },
    ],
  },
};

/**
 * Baca daftar kolom nyata dari katalog SQL Server untuk seluruh tabel yang
 * dipakai config, supaya query laporan tidak gagal saat sebuah master memang
 * tidak punya kolom tertentu.
 *
 * @param {string[]} tableNames
 * @returns {Promise<Map<string, Set<string>>>} tableName -> set nama kolom
 */
async function loadColumnMap(tableNames) {
  const names = Array.from(new Set(tableNames.filter(Boolean)));
  if (names.length === 0) return new Map();

  const pool = await poolPromise;
  const req = pool.request();
  const placeholders = names.map((name, i) => {
    req.input(`t${i}`, sql.VarChar(128), name);
    return `@t${i}`;
  });

  const result = await req.query(`
    SELECT t.name AS TableName, c.name AS ColumnName
    FROM sys.tables t
    INNER JOIN sys.columns c ON c.object_id = t.object_id
    WHERE t.name IN (${placeholders.join(", ")})
  `);

  const map = new Map();
  for (const row of result.recordset || []) {
    if (!map.has(row.TableName)) map.set(row.TableName, new Set());
    map.get(row.TableName).add(row.ColumnName);
  }
  return map;
}

function hasCol(cols, table, column) {
  const set = cols.get(table);
  return !!set && set.has(column);
}

/** Nama tabel/label berasal dari config sendiri, tapi tetap diamankan dari kutip. */
function lit(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

/** Satu cabang UNION: input (seq 1) atau output (seq 2). */
function buildBranchSql(branch, seq, ord, cols) {
  const m = branch.master;
  const tipe = seq === 1 ? "Input" : "Output";

  const isReject = hasCol(cols, m, "IsReject") ? "C.IsReject" : "CAST(NULL AS BIT)";
  const isRepair = hasCol(cols, m, "IsRepair") ? "C.IsRepair" : "CAST(NULL AS BIT)";

  // Output selalu dibuat dalam mm (createLabel menulis IdUOMTblLebar=1 dan
  // IdUOMPanjang=1), jadi faktor konversi hanya dipakai untuk INPUT yang bisa
  // berasal dari sawmill dengan satuan inci/feet.
  let fLebar = "1";
  let fPanjang = "1";
  if (seq === 1) {
    if (hasCol(cols, m, "IdUOMTblLebar")) {
      fLebar = "CASE WHEN C.IdUOMTblLebar = 3 THEN 645.16 ELSE 1 END";
    }
    if (hasCol(cols, m, "IdUOMPanjang")) {
      fPanjang = "CASE WHEN C.IdUOMPanjang = 4 THEN 304.8 ELSE 1 END";
    }
  }

  return `
    SELECT ${lit(branch.grp)} AS Grp, ${lit(tipe)} AS Tipe, A.${branch.col} AS NoLabel,
           B.Tebal, B.Lebar, B.Panjang, B.JmlhBatang,
           CAST(ROUND(B.Tebal * B.Lebar * B.Panjang * B.JmlhBatang / 1000000000.0
                * ${fLebar} * ${fPanjang}, 4, 1) AS DECIMAL(18,4)) AS Kubik,
           ${isReject} AS IsReject, ${isRepair} AS IsRepair,
           ${seq} AS Seq, ${ord} AS GrpOrd
    FROM ${branch.junction} A
    INNER JOIN ${branch.detail} B ON B.${branch.col} = A.${branch.col}
    INNER JOIN ${m} C ON C.${branch.col} = A.${branch.col}
    WHERE A.NoProduksi = @np`;
}

function buildHeaderSql(config, cols) {
  const h = config.headerTable;
  // Shift/JamKerja/HourMeter/JamLembur tidak seragam: sebagian module menyimpannya
  // sebagai varchar, sebagian sebagai int/float, dan tidak semuanya punya
  // JamLembur. Semuanya diseragamkan ke varchar supaya template tinggal menampilkan.
  const shift = hasCol(cols, h, "Shift") ? "h.Shift" : "''";
  const jamKerja = hasCol(cols, h, "JamKerja") ? "h.JamKerja" : "''";
  const jamLembur = hasCol(cols, h, "JamLembur") ? "h.JamLembur" : "''";
  const hourMeter = hasCol(cols, h, "HourMeter") ? "h.HourMeter" : "''";
  const anggota = hasCol(cols, h, "JmlhAnggota") ? "ISNULL(h.JmlhAnggota, 0)" : "0";

  return `
    SELECT TOP 1
      h.NoProduksi,
      h.Tanggal,
      CAST(${shift} AS VARCHAR(20)) AS Shift,
      CAST(${jamKerja} AS VARCHAR(20)) AS JamKerja,
      CAST(${hourMeter} AS VARCHAR(20)) AS HourMeter,
      CAST(${jamLembur} AS VARCHAR(20)) AS JamLembur,
      CAST(${anggota} AS INT) AS JmlhAnggota,
      ISNULL(m.NamaMesin, '-') AS NamaMesin,
      ISNULL(o.NamaOperator, '-') AS NamaOperator
    FROM ${h} h
    LEFT JOIN MstMesin m ON m.IdMesin = h.IdMesin
    LEFT JOIN MstOperator o ON o.IdOperator = h.IdOperator
    WHERE h.NoProduksi = @np`;
}

function buildRowsSql(config, cols) {
  const branches = [];
  config.inputs.forEach((b, i) => branches.push(buildBranchSql(b, 1, i + 1, cols)));
  config.outputs.forEach((b, i) => branches.push(buildBranchSql(b, 2, i + 1, cols)));

  if (branches.length === 0) {
    return "SELECT TOP 0 CAST(NULL AS VARCHAR(50)) AS Grp, CAST(NULL AS VARCHAR(50)) AS Tipe, CAST(NULL AS VARCHAR(50)) AS NoLabel, CAST(NULL AS DECIMAL(18,3)) AS Tebal, CAST(NULL AS DECIMAL(18,3)) AS Lebar, CAST(NULL AS DECIMAL(18,3)) AS Panjang, CAST(NULL AS INT) AS JmlhBatang, CAST(NULL AS DECIMAL(18,4)) AS Kubik, CAST(NULL AS BIT) AS IsReject, CAST(NULL AS BIT) AS IsRepair";
  }

  return `
WITH RowsAll AS (
${branches.join("\n  UNION ALL\n")}
)
SELECT Grp, Tipe, NoLabel, Tebal, Lebar, Panjang, JmlhBatang, Kubik, IsReject, IsRepair
FROM RowsAll
ORDER BY Seq, GrpOrd, Grp, NoLabel`;
}

function collectTableNames(config) {
  const names = [config.headerTable];
  [...(config.inputs || []), ...(config.outputs || [])].forEach((b) => {
    names.push(b.junction, b.master, b.detail);
  });
  return names;
}

/**
 * Header produksi + seluruh baris input/output beserta totalnya.
 *
 * @param {object} config salah satu entri REPORT_CONFIGS
 * @param {string} noProduksi
 */
async function getProduksiReport(config, noProduksi) {
  if (!config) {
    const err = new Error("Konfigurasi laporan produksi tidak valid");
    err.status = 500;
    throw err;
  }

  const pool = await poolPromise;
  const cols = await loadColumnMap(collectTableNames(config));

  const headerSql = buildHeaderSql(config, cols);
  const rowsSql = buildRowsSql(config, cols);

  const [headerResult, rowsResult] = await Promise.all([
    pool.request().input("np", sql.VarChar(20), noProduksi).query(headerSql),
    pool.request().input("np", sql.VarChar(20), noProduksi).query(rowsSql),
  ]);

  const header = headerResult.recordset[0] || null;
  const rows = rowsResult.recordset || [];

  const inputs = rows.filter((r) => r.Tipe === "Input");
  const outputs = rows.filter((r) => r.Tipe === "Output");

  const sum = (list) =>
    list.reduce((acc, r) => acc + (Number(r.JmlhBatang) || 0), 0);
  const sumKubik = (list) =>
    list.reduce((acc, r) => acc + (Number(r.Kubik) || 0), 0);

  const inputBatang = sum(inputs);
  const inputKubik = sumKubik(inputs);
  const outputBatang = sum(outputs);
  const outputKubik = sumKubik(outputs);

  // Tabel Repair & Afkir hanya berisi output yang flag-nya true.
  // IsReject = kolom "Afkir" di laporan.
  const repairs = outputs.filter((r) => r.IsRepair === true);
  const afkirs = outputs.filter((r) => r.IsReject === true);

  // Baris yang sudah repair/afkir tidak ditampilkan lagi di tabel OUTPUT
  // karena punya tabelnya sendiri. Tapi Rendemen tetap memakai SELURUH output
  // (total.output), bukan hanya yang bersih.
  const cleanOutputs = outputs.filter(
    (r) => r.IsRepair !== true && r.IsReject !== true,
  );

  // Rendemen berbasis volume (kubik) = total output / total input.
  const rendemen = inputKubik > 0 ? (outputKubik / inputKubik) * 100 : null;

  return {
    header,
    inputs,
    outputs,
    cleanOutputs,
    repairs,
    afkirs,
    total: {
      input: { rows: inputs.length, batang: inputBatang, kubik: inputKubik },
      // Seluruh output - dipakai untuk Rendemen.
      output: { rows: outputs.length, batang: outputBatang, kubik: outputKubik },
      // Output tanpa baris repair/afkir - dipakai untuk tabel OUTPUT.
      outputClean: {
        rows: cleanOutputs.length,
        batang: sum(cleanOutputs),
        kubik: sumKubik(cleanOutputs),
      },
      repair: { rows: repairs.length, batang: sum(repairs), kubik: sumKubik(repairs) },
      afkir: { rows: afkirs.length, batang: sum(afkirs), kubik: sumKubik(afkirs) },
      rendemen,
    },
  };
}

module.exports = { REPORT_CONFIGS, getProduksiReport };