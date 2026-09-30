const express = require("express");
const verifyToken = require("../../core/middleware/verify-token");
const moment = require("moment");
const { sql, poolPromise } = require("../../core/config/db");
const crypto = require("crypto");
const router = express.Router();

const formatDate = (date) => {
  return moment(date).format("DD MMM YYYY");
};

// Hitung volume per baris detail label.
//  - Kategori "ST" (Sawn Timber)  -> satuan TON
//      * IdUOMTblLebar === 1 (milimeter): t*l*p*pcs*304.8 / 1e9 / 1.416
//      * selain itu (inch)             : t*l*p*pcs / 7200.8
//  - Kategori lain                -> satuan M3 : t*l*p*pcs / 1e9
// Hasil di-truncate 4 desimal (Math.floor), sama seperti perhitungan di mobile.
const calcRowVolume = (labelType, idUOMTblLebar, tebal, lebar, panjang, pcs) => {
  const t = Number(tebal) || 0;
  const l = Number(lebar) || 0;
  const p = Number(panjang) || 0;
  const q = Number(pcs) || 0;

  if (labelType === "ST") {
    let ton =
      Number(idUOMTblLebar) === 1
        ? (t * l * p * q * 304.8) / 1000000000 / 1.416
        : (t * l * p * q) / 7200.8;
    ton = Math.floor(ton * 10000) / 10000;
    return { ton, m3: 0 };
  }

  let m3 = (t * l * p * q) / 1000000000.0;
  m3 = Math.floor(m3 * 10000) / 10000;
  return { ton: 0, m3 };
};

// Route untuk mendapatkan data Label berdasarkan No Stock Opname
router.get("/label-list/", verifyToken, async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const pageSize = parseInt(req.query.pageSize) || 20;
  const filterBy = req.query.filterBy || null;
  const idlokasi = req.query.idlokasi || null;
  const offset = (page - 1) * pageSize;
  const { username } = req;

  console.log(
    `[${new Date().toISOString()}] Mapping Lokasi - ${username} mengakses : "${filterBy}"`,
  );

  if (page <= 0 || pageSize <= 0) {
    return res
      .status(400)
      .json({ message: "Page and pageSize must be positive numbers." });
  }

  try {
    const pool = await poolPromise; // ← await poolPromise
    const request = pool.request(); // ← pool.request()

    request.input("username", sql.VarChar, username);
    if (idlokasi) request.input("idlokasi", sql.VarChar, idlokasi);

    const filterMap = {
      st: { table: "ST_h", column: "NoST", type: "ST", hasUOM: true },
      sanding: {
        table: "Sanding_h",
        column: "NoSanding",
        type: "SND",
        hasUOM: true,
      },
      s4s: { table: "S4S_h", column: "NoS4S", type: "S4S", hasUOM: true },
      moulding: {
        table: "Moulding_h",
        column: "NoMoulding",
        type: "MLD",
        hasUOM: true,
      },
      laminating: {
        table: "Laminating_h",
        column: "NoLaminating",
        type: "LMT",
        hasUOM: true,
      },
      fj: { table: "FJ_h", column: "NoFJ", type: "FJ", hasUOM: true },
      ccakhir: {
        table: "CCAkhir_h",
        column: "NoCCAkhir",
        type: "CCA",
        hasUOM: true,
      },
      bj: { table: "BarangJadi_h", column: "NoBJ", type: "BJ", hasUOM: false },
    };

    let labelHeaders = [];
    let totalCountQuery = 0;

    if (filterBy && filterBy !== "all") {
      const selected = filterMap[filterBy];
      if (!selected)
        return res.status(400).json({ message: "Invalid filterBy value" });

      const whereClause = `WHERE h.DateUsage IS NULL 
                                ${idlokasi && idlokasi !== "all" ? "AND h.IdLokasi = @idlokasi" : ""} 
                                AND EXISTS (
                                    SELECT 1 FROM ${selected.table.replace("_h", "_d")} d 
                                    WHERE d.${selected.column} = h.${selected.column}
                                )`;

      const selectUOMLebar = selected.hasUOM
        ? "h.IdUOMTblLebar"
        : "1 AS IdUOMTblLebar";
      const selectUOMPanjang = selected.hasUOM
        ? "h.IdUOMPanjang"
        : "1 AS IdUOMPanjang";

      const labelHeaderQuery = `
                SELECT h.${selected.column} AS CombinedLabel, '${selected.type}' AS LabelType,
                       h.IdLokasi AS LabelLocation, h.DateCreate,
                       ${selectUOMLebar}, ${selectUOMPanjang}
                FROM ${selected.table} h
                ${whereClause}
                ORDER BY h.DateCreate DESC
                OFFSET ${offset} ROWS FETCH NEXT ${pageSize} ROWS ONLY;
            `;

      const totalQuery = `SELECT COUNT(*) AS total FROM ${selected.table} h ${whereClause};`;

      const [labelHeaderResult, totalResult] = await Promise.all([
        request.query(labelHeaderQuery),
        request.query(totalQuery),
      ]);

      labelHeaders = labelHeaderResult.recordset;
      totalCountQuery = totalResult.recordset[0].total;
    } else {
      const allLabelQueries = Object.values(filterMap).map((f) => {
        const selectUOMLebar = f.hasUOM
          ? "h.IdUOMTblLebar"
          : "1 AS IdUOMTblLebar";
        const selectUOMPanjang = f.hasUOM
          ? "h.IdUOMPanjang"
          : "1 AS IdUOMPanjang";
        return `
                    SELECT h.${f.column} AS CombinedLabel, '${f.type}' AS LabelType,
                           h.IdLokasi AS LabelLocation, h.DateCreate,
                           ${selectUOMLebar}, ${selectUOMPanjang}
                    FROM ${f.table} h
                    WHERE h.DateUsage IS NULL
                    ${idlokasi && idlokasi !== "all" ? "AND h.IdLokasi = @idlokasi" : ""}
                    AND EXISTS (
                        SELECT 1 FROM ${f.table.replace("_h", "_d")} d 
                        WHERE d.${f.column} = h.${f.column}
                    )
                `;
      });

      const combinedQuery = `
                SELECT * FROM (
                    ${allLabelQueries.join(" UNION ALL ")}
                ) AS combinedLabels
                ORDER BY DateCreate DESC
                OFFSET ${offset} ROWS FETCH NEXT ${pageSize} ROWS ONLY;
            `;

      const totalQuery = `
                SELECT SUM(total) AS total FROM (
                    ${Object.values(filterMap)
                      .map(
                        (f) => `
                        SELECT COUNT(*) AS total FROM ${f.table} h 
                        WHERE h.DateUsage IS NULL 
                        ${idlokasi && idlokasi !== "all" ? "AND h.IdLokasi = @idlokasi" : ""}
                        AND EXISTS (
                            SELECT 1 FROM ${f.table.replace("_h", "_d")} d 
                            WHERE d.${f.column} = h.${f.column}
                        )
                    `,
                      )
                      .join(" UNION ALL ")}
                ) AS total_counts;
            `;

      const [labelHeaderResult, totalResult] = await Promise.all([
        request.query(combinedQuery),
        request.query(totalQuery),
      ]);

      labelHeaders = labelHeaderResult.recordset;
      totalCountQuery = totalResult.recordset[0].total;
    }

    if (labelHeaders.length === 0) {
      return res.json({
        noLabelList: [],
        noLabelFound: false,
        currentPage: page,
        pageSize,
        totalData: 0,
        totalPages: 0,
        summary: {
          totalM3: "0.0000",
          totalJumlah: 0,
        },
      });
    }

    const labelNos = labelHeaders.map((l) => `'${l.CombinedLabel}'`).join(",");

    const allDetailQueries = Object.values(filterMap).map((f) => {
      return `
                SELECT h.${f.column} AS CombinedLabel, '${f.type}' AS LabelType,
                       h.IdLokasi AS LabelLocation, h.DateCreate,
                       d.NoUrut, d.Tebal, d.Lebar, d.Panjang, d.JmlhBatang
                FROM ${f.table} h
                LEFT JOIN ${f.table.replace("_h", "_d")} d ON h.${f.column} = d.${f.column}
                WHERE h.DateUsage IS NULL AND h.${f.column} IN (${labelNos})
                ${idlokasi && idlokasi !== "all" ? "AND h.IdLokasi = @idlokasi" : ""}
            `;
    });

    const allDetailQueriesForSummary = Object.values(filterMap).map((f) => {
      const whereClause = `WHERE h.DateUsage IS NULL 
                               ${idlokasi && idlokasi !== "all" ? "AND h.IdLokasi = @idlokasi" : ""}
                               AND EXISTS (
                                   SELECT 1 FROM ${f.table.replace("_h", "_d")} d2 
                                   WHERE d2.${f.column} = h.${f.column}
                               )`;
      const selectUOMLebar = f.hasUOM
        ? "h.IdUOMTblLebar"
        : "1 AS IdUOMTblLebar";

      return `
                SELECT h.${f.column} AS CombinedLabel, '${f.type}' AS LabelType,
                       ${selectUOMLebar},
                       d.Tebal, d.Lebar, d.Panjang, d.JmlhBatang
                FROM ${f.table} h
                LEFT JOIN ${f.table.replace("_h", "_d")} d ON h.${f.column} = d.${f.column}
                ${whereClause}
                AND d.NoUrut IS NOT NULL
            `;
    });

    let summaryDetailQuery = "";
    if (filterBy && filterBy !== "all") {
      const selected = filterMap[filterBy];
      const whereClause = `WHERE h.DateUsage IS NULL 
                               ${idlokasi && idlokasi !== "all" ? "AND h.IdLokasi = @idlokasi" : ""}
                               AND EXISTS (
                                   SELECT 1 FROM ${selected.table.replace("_h", "_d")} d2 
                                   WHERE d2.${selected.column} = h.${selected.column}
                               )`;
      const selectUOMLebar = selected.hasUOM
        ? "h.IdUOMTblLebar"
        : "1 AS IdUOMTblLebar";

      summaryDetailQuery = `
                SELECT h.${selected.column} AS CombinedLabel, '${selected.type}' AS LabelType,
                       ${selectUOMLebar},
                       d.Tebal, d.Lebar, d.Panjang, d.JmlhBatang
                FROM ${selected.table} h
                LEFT JOIN ${selected.table.replace("_h", "_d")} d ON h.${selected.column} = d.${selected.column}
                ${whereClause}
                AND d.NoUrut IS NOT NULL
            `;
    } else {
      summaryDetailQuery = allDetailQueriesForSummary.join(" UNION ALL ");
    }

    const detailQuery = allDetailQueries.join(" UNION ALL ");

    const [detailResult, summaryDetailResult] = await Promise.all([
      request.query(detailQuery),
      request.query(summaryDetailQuery),
    ]);

    const groupedData = {};
    const labelOrder = [];

    let totalM3Overall = 0;
    let totalJumlahOverall = 0;
    let summaryTotalM3 = 0;
    let summaryTotalJumlah = 0;

    summaryDetailResult.recordset.forEach((row) => {
      const tebal = row.Tebal;
      const lebar = row.Lebar;
      const panjang = row.Panjang;
      const pcs = row.JmlhBatang;
      const idUOMTblLebar = row.IdUOMTblLebar;

      let rowM3 = 0;

      if (row.LabelType === "Sawn Timber") {
        if (idUOMTblLebar === 1) {
          rowM3 =
            ((((tebal * lebar * panjang * pcs * 304.8) / 1000000000 / 1.416) *
              10000) /
              10000) *
            1.416;
        } else {
          rowM3 =
            ((((tebal * lebar * panjang * pcs) / 7200.8) * 10000) / 10000) *
            1.416;
        }
        rowM3 = Math.floor(rowM3 * 10000) / 10000;
      } else {
        rowM3 = (tebal * lebar * panjang * pcs) / 1000000000.0;
        rowM3 = Math.floor(rowM3 * 10000) / 10000;
      }

      summaryTotalM3 += rowM3;
      summaryTotalJumlah += pcs;
    });

    labelHeaders.forEach((h) => {
      groupedData[h.CombinedLabel] = {
        CombinedLabel: h.CombinedLabel,
        LabelType: h.LabelType,
        LabelLocation: h.LabelLocation,
        DateCreate: formatDate(h.DateCreate),
        IdUOMTblLebar: h.IdUOMTblLebar,
        IdUOMPanjang: h.IdUOMPanjang,
        Details: [],
      };
      labelOrder.push(h.CombinedLabel);
    });

    detailResult.recordset.forEach((row) => {
      if (groupedData[row.CombinedLabel] && row.NoUrut !== null) {
        groupedData[row.CombinedLabel].Details.push({
          NoUrut: row.NoUrut,
          Tebal: row.Tebal,
          Lebar: row.Lebar,
          Panjang: row.Panjang,
          JmlhBatang: row.JmlhBatang,
        });
      }
    });

    const noLabelList = labelOrder.map((labelKey) => {
      const label = groupedData[labelKey];
      label.Details.sort((a, b) => a.NoUrut - b.NoUrut);

      let labelM3 = 0;
      let labelJumlah = 0;

      const formattedDetailData = label.Details.map((item) => {
        const tebal = item.Tebal;
        const lebar = item.Lebar;
        const panjang = item.Panjang;
        const pcs = item.JmlhBatang;
        const idUOMTblLebar = label.IdUOMTblLebar;

        let rowM3 = 0;

        if (label.LabelType === "Sawn Timber") {
          if (idUOMTblLebar === 1) {
            rowM3 =
              ((((tebal * lebar * panjang * pcs * 304.8) / 1000000000 / 1.416) *
                10000) /
                10000) *
              1.416;
          } else {
            rowM3 =
              ((((tebal * lebar * panjang * pcs) / 7200.8) * 10000) / 10000) *
              1.416;
          }
          rowM3 = Math.floor(rowM3 * 10000) / 10000;
        } else {
          rowM3 = (tebal * lebar * panjang * pcs) / 1000000000.0;
          rowM3 = Math.floor(rowM3 * 10000) / 10000;
        }

        labelM3 += rowM3;
        labelJumlah += pcs;

        return {
          NoUrut: item.NoUrut,
          Tebal: item.Tebal,
          Lebar: item.Lebar,
          Panjang: item.Panjang,
          JmlhBatang: item.JmlhBatang,
        };
      });

      totalM3Overall += labelM3;
      totalJumlahOverall += labelJumlah;

      return {
        ...label,
        Details: formattedDetailData,
        LabelM3: labelM3.toFixed(4),
        LabelJumlah: labelJumlah,
      };
    });

    res.json({
      noLabelList,
      noLabelFound: noLabelList.length > 0,
      currentPage: page,
      pageSize,
      totalData: totalCountQuery,
      totalPages: Math.ceil(totalCountQuery / pageSize),
      summary: {
        totalM3: summaryTotalM3.toFixed(4),
        totalJumlah: summaryTotalJumlah,
      },
    });
  } catch (error) {
    console.error("Error in label-list endpoint:", error);
    res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
  // ← HAPUS finally block
});

// Fungsi untuk pengecekan lanjutan di tabel lain berdasarkan tipe resultscanned
const checkInOtherTables = async (request, resultscanned) => {
  let tablesToCheck = [];
  let columnToSearch = "";

  const firstChar = resultscanned.charAt(0).toUpperCase();

  if (firstChar === "E") {
    tablesToCheck = [
      { tableName: "S4SProduksiInputST", column: "NoProduksi" },
      { tableName: "AdjustmentInputST", column: "NoAdjustment" },
      { tableName: "BongkarSusunInputST", column: "NoBongkarSusun" },
    ];
    columnToSearch = "NoST";
  } else if (firstChar === "R") {
    tablesToCheck = [
      { tableName: "S4SProduksiInputS4S", column: "NoProduksi" },
      { tableName: "FJProduksiInputS4S", column: "NoProduksi" },
      { tableName: "MouldingProduksiInputS4S", column: "NoProduksi" },
      { tableName: "AdjustmentInputS4S", column: "NoAdjustment" },
      { tableName: "BongkarSusunInputS4S", column: "NoBongkarSusun" },
    ];
    columnToSearch = "NoS4S";
  } else if (firstChar === "S") {
    tablesToCheck = [
      { tableName: "SandingProduksiInputFJ", column: "NoProduksi" },
      { tableName: "S4SProduksiInputFJ", column: "NoProduksi" },
      { tableName: "MouldingProduksiInputFJ", column: "NoProduksi" },
      { tableName: "CCAkhirProduksiInputFJ", column: "NoProduksi" },
      { tableName: "AdjustmentInputFJ", column: "NoAdjustment" },
      { tableName: "BongkarSusunInputFJ", column: "NoBongkarSusun" },
    ];
    columnToSearch = "NoFJ";
  } else if (firstChar === "T") {
    tablesToCheck = [
      { tableName: "S4SProduksiInputMoulding", column: "NoProduksi" },
      { tableName: "SandingProduksiInputMoulding", column: "NoProduksi" },
      { tableName: "PackingProduksiInputMoulding", column: "NoProduksi" },
      { tableName: "MouldingProduksiInputMoulding", column: "NoProduksi" },
      { tableName: "LaminatingProduksiInputMoulding", column: "NoProduksi" },
      { tableName: "CCAkhirProduksiInputMoulding", column: "NoProduksi" },
      { tableName: "AdjustmentInputMoulding", column: "NoAdjustment" },
      { tableName: "BongkarSusunInputMoulding", column: "NoBongkarSusun" },
    ];
    columnToSearch = "NoMoulding";
  } else if (firstChar === "U") {
    tablesToCheck = [
      { tableName: "MouldingProduksiInputLaminating", column: "NoProduksi" },
      { tableName: "CCAkhirProduksiInputLaminating", column: "NoProduksi" },
      { tableName: "AdjustmentInputLaminating", column: "NoAdjustment" },
      { tableName: "BongkarSusunInputLaminating", column: "NoBongkarSusun" },
    ];
    columnToSearch = "NoLaminating";
  } else if (firstChar === "V") {
    tablesToCheck = [
      { tableName: "S4SProduksiInputCCAkhir", column: "NoProduksi" },
      { tableName: "FJProduksiInputCCAkhir", column: "NoProduksi" },
      { tableName: "MouldingProduksiInputCCAkhir", column: "NoProduksi" },
      { tableName: "LaminatingProduksiInputCCAkhir", column: "NoProduksi" },
      { tableName: "SandingProduksiInputCCAkhir", column: "NoProduksi" },
      { tableName: "AdjustmentInputCCAkhir", column: "NoAdjustment" },
      { tableName: "BongkarSusunInputCCAkhir", column: "NoBongkarSusun" },
    ];
    columnToSearch = "NoCCAkhir";
  } else if (firstChar === "W") {
    tablesToCheck = [
      { tableName: "LaminatingProduksiInputSanding", column: "NoProduksi" },
      { tableName: "PackingProduksiInputSanding", column: "NoProduksi" },
      { tableName: "AdjustmentInputSanding", column: "NoAdjustment" },
      { tableName: "BongkarSusunInputSanding", column: "NoBongkarSusun" },
    ];
    columnToSearch = "NoSanding";
  } else if (firstChar === "I") {
    tablesToCheck = [
      { tableName: "MouldingProduksiInputBarangJadi", column: "NoProduksi" },
      { tableName: "LaminatingProduksiInputBarangJadi", column: "NoProduksi" },
      { tableName: "CCAkhirProduksiInputBarangJadi", column: "NoProduksi" },
      { tableName: "PackingProduksiInputBarangJadi", column: "NoProduksi" },
      { tableName: "BongkarSusunInputBarangJadi", column: "NoBongkarSusun" },
    ];
    columnToSearch = "NoBJ";
  } else {
    return { message: "Invalid resultscanned type", status: 400 };
  }

  for (let table of tablesToCheck) {
    const checkQuery = `
            SELECT ${table.column}
            FROM ${table.tableName}
            WHERE ${columnToSearch} = @resultscanned;
        `;

    const resultCheck = await request.query(checkQuery);

    if (resultCheck.recordset.length > 0) {
      const value = resultCheck.recordset[0][table.column];
      return {
        message: `Label sudah di Proses pada Nomor ${value}. Yakin ingin menyimpan?`,
        status: 409,
        value: value,
      };
    }
  }

  return null;
};

// Route untuk pengecekan data berdasarkan No Stock Opname
router.post("/label-list/check", verifyToken, async (req, res) => {
  const { resultscanned, idlokasi } = req.body;
  const { username } = req;

  if (!resultscanned || !idlokasi) {
    return res
      .status(400)
      .json({ message: "Resultscanned, and idlokasi are required." });
  }

  try {
    const pool = await poolPromise; // ← await poolPromise
    const request = pool.request(); // ← pool.request()

    request.input("resultscanned", sql.VarChar, resultscanned);
    request.input("idlokasi", sql.VarChar, idlokasi);
    request.input("username", sql.VarChar, username);

    const validPattern = /^[ERSTUVWIA]\.\d{6}$/;
    if (!validPattern.test(resultscanned)) {
      return res
        .status(400)
        .json({ message: 'Format harus berupa "Kode.xxxxxx"' });
    }

    const firstChar = resultscanned.charAt(0).toUpperCase();
    const tableMap = {
      E: { columnName: "NoST", tableH: "ST_h", isColumn: "IsST" },
      R: { columnName: "NoS4S", tableH: "S4S_h", isColumn: "IsS4S" },
      S: { columnName: "NoFJ", tableH: "FJ_h", isColumn: "IsFJ" },
      T: {
        columnName: "NoMoulding",
        tableH: "Moulding_h",
        isColumn: "IsMoulding",
      },
      U: {
        columnName: "NoLaminating",
        tableH: "Laminating_h",
        isColumn: "IsLaminating",
      },
      V: {
        columnName: "NoCCAkhir",
        tableH: "CCAkhir_h",
        isColumn: "IsCCAkhir",
      },
      W: {
        columnName: "NoSanding",
        tableH: "Sanding_h",
        isColumn: "IsSanding",
      },
      I: { columnName: "NoBJ", tableH: "BarangJadi_h", isColumn: "IsBJ" },
    };

    const tableInfo = tableMap[firstChar];

    if (!tableInfo) {
      return res
        .status(400)
        .json({ message: "Invalid starting character for resultscanned." });
    }

    const { columnName, tableH, isColumn } = tableInfo;

    const checkResultScannedQuery = `
            SELECT COUNT(*) AS count, MAX(dateusage) AS dateusage
            FROM ${tableH}
            WHERE ${columnName} = @resultscanned;
        `;
    const resultScannedCheck = await request.query(checkResultScannedQuery);
    const resultScannedCount = resultScannedCheck.recordset[0].count;
    const dateusage = resultScannedCheck.recordset[0].dateusage;

    if (resultScannedCount === 0) {
      return res
        .status(404)
        .json({ message: "Label tidak ada di sistem. Yakin ingin menyimpan?" });
    }

    if (dateusage !== null) {
      const otherTableCheck = await checkInOtherTables(request, resultscanned);
      if (otherTableCheck) {
        return res
          .status(otherTableCheck.status)
          .json({ message: otherTableCheck.message });
      }
    }

    return res
      .status(200)
      .json({ message: "Pengecekan berhasil, label ada di sistem." });
  } catch (error) {
    console.error("Error checking data:", error);
    res
      .status(500)
      .json({ message: "Failed to check data.", error: error.message });
  }
  // ← HAPUS finally block
});

router.post("/label-list/save-changes", verifyToken, async (req, res) => {
  const { resultscannedList, idlokasi } = req.body;
  const { username, idUsername } = req;
  const actorId = String(idUsername ?? username ?? "");
  const requestId = crypto.randomUUID();

  if (!resultscannedList || resultscannedList.length === 0 || !idlokasi) {
    return res
      .status(400)
      .json({ message: "Resultscanned list and idlokasi are required." });
  }

  try {
    const pool = await poolPromise;

    for (let i = 0; i < resultscannedList.length; i++) {
      const resultscanned = resultscannedList[i];
      const validPattern = /^[ERSTUVWIA]\.\d{6}$/;

      if (!validPattern.test(resultscanned)) {
        return res.status(400).json({
          message: `Format untuk ${resultscanned} harus berupa "Kode.xxxxxx"`,
        });
      }

      const firstChar = resultscanned.charAt(0).toUpperCase();
      const tableMap = {
        E: { columnName: "NoST", tableH: "ST_h" },
        R: { columnName: "NoS4S", tableH: "S4S_h" },
        S: { columnName: "NoFJ", tableH: "FJ_h" },
        T: { columnName: "NoMoulding", tableH: "Moulding_h" },
        U: { columnName: "NoLaminating", tableH: "Laminating_h" },
        V: { columnName: "NoCCAkhir", tableH: "CCAkhir_h" },
        W: { columnName: "NoSanding", tableH: "Sanding_h" },
        I: { columnName: "NoBJ", tableH: "BarangJadi_h" },
      };

      const tableInfo = tableMap[firstChar];

      if (!tableInfo) {
        return res.status(400).json({
          message: `Invalid starting character for ${resultscanned}.`,
        });
      }

      const { columnName, tableH } = tableInfo;

      const selectResult = await pool
        .request()
        .input("resultscanned", sql.VarChar, resultscanned).query(`
            SELECT IdLokasi
            FROM ${tableH}
            WHERE ${columnName} = @resultscanned;
        `);

      if (selectResult.recordset.length === 0) {
        return res.status(404).json({
          message: `Label ${resultscanned} tidak ditemukan di ${tableH}.`,
        });
      }

      await pool
        .request()
        .input("actorId", sql.VarChar, actorId)
        .input("requestId", sql.VarChar, requestId)
        .input("idlokasi", sql.VarChar, idlokasi)
        .input("resultscanned", sql.VarChar, resultscanned).query(`
                EXEC sp_set_session_context N'actor_id', @actorId;
                EXEC sp_set_session_context N'request_id', @requestId;
                UPDATE ${tableH}
                SET IdLokasi = @idlokasi
                WHERE ${columnName} = @resultscanned;
            `);
    }

    console.log(
      `[${new Date().toISOString()}] Mapping Lokasi - ${actorId} scan label : "${resultscannedList}" ke  ${idlokasi}`,
    );

    return res.status(201).json({ message: "Data berhasil disimpan!" });
  } catch (error) {
    console.error("Error inserting data:", error);
    res
      .status(500)
      .json({ message: "Failed to insert data.", error: error.message });
  }
  // ← HAPUS finally block
});

// GET /mapping/lokasi-summary
// Menampilkan setiap blok lokasi beserta jumlah label yang masih berada di
// lokasi tersebut (DateUsage IS NULL) dari 8 modul label.
router.get("/mapping/lokasi-summary", verifyToken, async (req, res) => {
  const { username } = req;
  console.log(
    `[${new Date().toISOString()}] Mapping Lokasi Summary - diakses oleh ${username}`,
  );

  const labelTables = [
    { table: "ST_h", column: "NoST" },
    { table: "S4S_h", column: "NoS4S" },
    { table: "FJ_h", column: "NoFJ" },
    { table: "Moulding_h", column: "NoMoulding" },
    { table: "Laminating_h", column: "NoLaminating" },
    { table: "CCAkhir_h", column: "NoCCAkhir" },
    { table: "Sanding_h", column: "NoSanding" },
    { table: "BarangJadi_h", column: "NoBJ" },
  ];

  // Satu baris = satu label yang masih "hidup" di sebuah IdLokasi.
  const labelUnion = labelTables
    .map(
      (t) => `
        SELECT h.IdLokasi
        FROM ${t.table} h
        WHERE h.DateUsage IS NULL
          AND h.IdLokasi IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM ${t.table.replace("_h", "_d")} d
            WHERE d.${t.column} = h.${t.column}
          )`,
    )
    .join(" UNION ALL ");

  const query = `
    SELECT l.IdLokasi, l.Blok, l.Description, ISNULL(c.JumlahLabel, 0) AS JumlahLabel
    FROM MstLokasi l
    LEFT JOIN (
      SELECT IdLokasi, COUNT(*) AS JumlahLabel
      FROM ( ${labelUnion} ) AS labels
      GROUP BY IdLokasi
    ) c ON c.IdLokasi = l.IdLokasi
    WHERE l.Enable = 1
    ORDER BY l.Blok ASC, l.IdLokasi ASC
  `;

  try {
    const pool = await poolPromise;
    const result = await pool.request().query(query);

    return res.json({
      success: true,
      message: "Data ringkasan lokasi berhasil diambil",
      data: result.recordset,
      totalData: result.recordset.length,
    });
  } catch (error) {
    console.error("Error fetching lokasi-summary:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
});

// GET /mapping/lokasi-labels?idlokasi=<IdLokasi>
// Daftar label pada satu lokasi, lengkap dengan nama jenis kayu (join
// MstJenisKayu via IdJenisKayu) dan detail ukuran (tebal/lebar/panjang).
router.get("/mapping/lokasi-labels", verifyToken, async (req, res) => {
  const idlokasi = req.query.idlokasi;
  const { username } = req;

  if (!idlokasi) {
    return res
      .status(400)
      .json({ success: false, message: "Parameter idlokasi wajib diisi." });
  }

  console.log(
    `[${new Date().toISOString()}] Mapping Lokasi Labels - ${username} membuka lokasi ${idlokasi}`,
  );

  const tables = [
    { table: "ST_h", column: "NoST" },
    { table: "S4S_h", column: "NoS4S" },
    { table: "FJ_h", column: "NoFJ" },
    { table: "Moulding_h", column: "NoMoulding" },
    { table: "Laminating_h", column: "NoLaminating" },
    { table: "CCAkhir_h", column: "NoCCAkhir" },
    { table: "Sanding_h", column: "NoSanding" },
    { table: "BarangJadi_h", column: "NoBJ" },
  ];
  const typeOf = {
    ST_h: "ST",
    S4S_h: "S4S",
    FJ_h: "FJ",
    Moulding_h: "MLD",
    Laminating_h: "LMT",
    CCAkhir_h: "CCA",
    Sanding_h: "SND",
    BarangJadi_h: "BJ",
  };

  const headerUnion = tables
    .map(
      (t) => `
        SELECT h.${t.column} AS LabelNo, '${typeOf[t.table]}' AS LabelType,
               h.IdJenisKayu, h.DateCreate,
               ${t.table === "BarangJadi_h" ? "1 AS IdUOMTblLebar" : "h.IdUOMTblLebar"}
        FROM ${t.table} h
        WHERE h.DateUsage IS NULL AND h.IdLokasi = @idlokasi
          AND EXISTS (SELECT 1 FROM ${t.table.replace("_h", "_d")} d WHERE d.${t.column} = h.${t.column})`,
    )
    .join(" UNION ALL ");

  const detailUnion = tables
    .map(
      (t) => `
        SELECT h.${t.column} AS LabelNo, d.NoUrut, d.Tebal, d.Lebar, d.Panjang, d.JmlhBatang
        FROM ${t.table} h
        JOIN ${t.table.replace("_h", "_d")} d ON d.${t.column} = h.${t.column}
        WHERE h.DateUsage IS NULL AND h.IdLokasi = @idlokasi`,
    )
    .join(" UNION ALL ");

  try {
    const pool = await poolPromise;
    const request = pool.request();
    request.input("idlokasi", sql.VarChar, idlokasi);

    const headerQuery = `
      SELECT lbl.LabelNo, lbl.LabelType, lbl.DateCreate, lbl.IdUOMTblLebar,
             jk.Jenis, jk.Singkatan
      FROM ( ${headerUnion} ) AS lbl
      LEFT JOIN MstJenisKayu jk ON jk.IdJenisKayu = lbl.IdJenisKayu
      ORDER BY lbl.DateCreate DESC
    `;

    const [headerResult, detailResult] = await Promise.all([
      request.query(headerQuery),
      request.query(detailUnion),
    ]);

    const detailMap = new Map();
    detailResult.recordset.forEach((d) => {
      if (!detailMap.has(d.LabelNo)) detailMap.set(d.LabelNo, []);
      detailMap.get(d.LabelNo).push({
        NoUrut: d.NoUrut,
        Tebal: d.Tebal,
        Lebar: d.Lebar,
        Panjang: d.Panjang,
        JmlhBatang: d.JmlhBatang,
      });
    });

    let totalJumlah = 0;
    let totalTonOverall = 0;
    let totalM3Overall = 0;

    const data = headerResult.recordset.map((h) => {
      const details = (detailMap.get(h.LabelNo) || []).sort(
        (a, b) => (a.NoUrut || 0) - (b.NoUrut || 0),
      );
      const jumlah = details.reduce((s, x) => s + (x.JmlhBatang || 0), 0);

      let labelTon = 0;
      let labelM3 = 0;
      details.forEach((x) => {
        const { ton, m3 } = calcRowVolume(
          h.LabelType,
          h.IdUOMTblLebar,
          x.Tebal,
          x.Lebar,
          x.Panjang,
          x.JmlhBatang,
        );
        labelTon += ton;
        labelM3 += m3;
      });

      totalJumlah += jumlah;
      totalTonOverall += labelTon;
      totalM3Overall += labelM3;

      const isST = h.LabelType === "ST";
      return {
        LabelNo: h.LabelNo,
        LabelType: h.LabelType,
        Jenis: h.Jenis || null,
        Singkatan: h.Singkatan || null,
        DateCreate: formatDate(h.DateCreate),
        Jumlah: jumlah,
        VolumeType: isST ? "TON" : "M3",
        Ton: labelTon.toFixed(4),
        M3: labelM3.toFixed(4),
        Volume: (isST ? labelTon : labelM3).toFixed(4),
        Details: details,
      };
    });

    return res.json({
      success: true,
      message: "Data label lokasi berhasil diambil",
      data,
      totalData: data.length,
      summary: {
        totalJumlah,
        totalTon: totalTonOverall.toFixed(4),
        totalM3: totalM3Overall.toFixed(4),
      },
    });
  } catch (error) {
    console.error("Error fetching lokasi-labels:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
});

module.exports = router;
