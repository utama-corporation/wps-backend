const express = require("express");
const verifyToken = require("../../core/middleware/verify-token");
const moment = require("moment");
const { sql, poolPromise } = require("../../core/config/db");
const router = express.Router();

const formatDate = (date) => {
  return moment(date).format("DD MMM YYYY");
};

// Route untuk mendapatkan daftar Bongkar KD
router.get("/kd-bongkar", verifyToken, async (req, res) => {
  try {
    const pool = await poolPromise; // ← await poolPromise
    const request = pool.request(); // ← pool.request()

    // baca query param, default = false
    const isPending = req.query.isPending === "true";

    let whereClause = "";
    if (isPending) {
      whereClause = "WHERE [TglKeluar] IS NULL"; // belum keluar
    } else {
      whereClause = "WHERE [TglKeluar] IS NOT NULL"; // sudah keluar
    }

    const result = await request.query(`
      SELECT TOP 20 [NoProcKD], [NoRuangKD], [TglMasuk], [TglKeluar]
      FROM [dbo].[KD_h]
      ${whereClause}
      ORDER BY [TglMasuk] DESC
    `);

    if (!result.recordset || result.recordset.length === 0) {
      return res.status(404).json({ message: "Tidak ada data Bongkar KD." });
    }

    const formattedData = result.recordset.map((item) => ({
      NoProcKD: item.NoProcKD,
      NoRuangKD: item.NoRuangKD,
      TglMasuk: formatDate(item.TglMasuk),
      TglKeluar: item.TglKeluar ? formatDate(item.TglKeluar) : null,
      isPending: item.TglKeluar ? false : true,
    }));

    res.json(formattedData);
  } catch (error) {
    console.error("Error:", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// GET /kd-bongkar/:noProcKD/detail
router.get("/kd-bongkar/:noProcKD/detail", verifyToken, async (req, res) => {
  const { noProcKD } = req.params;

  if (!noProcKD || noProcKD.trim() === "") {
    return res.status(400).json({
      success: false,
      message: "Parameter noProcKD harus diisi.",
    });
  }

  try {
    const pool = await poolPromise; // ← await poolPromise
    const request = pool.request(); // ← pool.request()

    request.input("noProcKD", sql.VarChar, noProcKD);

    // Ambil data label header (ST_h)
    const labelHeaderQuery = `
      SELECT KD.[NoProcKD], KD.[NoST], ST.[DateCreate], ST.[IdUOMTblLebar], ST.[IdUOMPanjang], ST.[IdLokasi],
             JK.Jenis AS JenisKayu
      FROM KD_d KD
      LEFT JOIN ST_h ST ON KD.NoST = ST.NoST
      LEFT JOIN MstJenisKayu JK ON JK.IdJenisKayu = ST.IdJenisKayu
      WHERE KD.NoProcKD = @noProcKD
        AND (
          ST.IdLokasi LIKE '%J%' OR
          ST.IdLokasi LIKE '%L%' OR
          ST.IdLokasi LIKE '%KD%' OR
          ST.IdLokasi IS NULL
        )
        AND EXISTS (
          SELECT 1 FROM ST_d STD 
          WHERE STD.NoST = ST.NoST
        )
    `;

    // Ambil total label
    const totalQuery = `
      SELECT COUNT(*) AS totalLabel
      FROM KD_d KD
      LEFT JOIN ST_h ST ON KD.NoST = ST.NoST
      WHERE KD.NoProcKD = @noProcKD
        AND (
          ST.IdLokasi LIKE '%J%' OR
          ST.IdLokasi LIKE '%L%' OR
          ST.IdLokasi LIKE '%KD%' OR
          ST.IdLokasi IS NULL
        )
        AND EXISTS (
          SELECT 1 FROM ST_d STD 
          WHERE STD.NoST = ST.NoST
        )
    `;

    const [labelHeaderResult, totalResult] = await Promise.all([
      request.query(labelHeaderQuery),
      request.query(totalQuery),
    ]);

    const labelHeaders = labelHeaderResult.recordset;
    const totalLabel = totalResult.recordset[0]?.totalLabel || 0;

    if (labelHeaders.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Data detail KD tidak ditemukan.",
        data: {
          labels: [],
          totalLabel: 0,
          summary: {
            totalM3: "0.0000",
            totalJumlah: 0,
          },
        },
      });
    }

    // Ambil semua NoST untuk query detail
    const noSTList = labelHeaders.map((l) => `'${l.NoST}'`).join(",");

    // Query untuk mengambil data detail dari ST_d
    const detailQuery = `
      SELECT ST.NoST, ST.DateCreate, ST.IdUOMTblLebar, ST.IdUOMPanjang, ST.IdLokasi,
             STD.NoUrut, STD.Tebal, STD.Lebar, STD.Panjang, STD.JmlhBatang
      FROM ST_h ST
      LEFT JOIN ST_d STD ON ST.NoST = STD.NoST
      WHERE ST.NoST IN (${noSTList})
      AND STD.NoUrut IS NOT NULL
      ORDER BY ST.NoST, STD.NoUrut
    `;

    // Grade ST tersimpan di STStick (NamaGradeStick), bukan di ST_h.
    const gradeQuery = `
      SELECT S.NoST, G.NamaGradeStick
      FROM STStick S
      INNER JOIN MstGradeStick G ON G.IdGradeStick = S.IdGradeStick
      WHERE S.NoST IN (${noSTList})
      ORDER BY S.NoST, G.NamaGradeStick
    `;

    const [detailResult, gradeResult] = await Promise.all([
      request.query(detailQuery),
      request.query(gradeQuery),
    ]);

    const gradesByNoST = {};
    gradeResult.recordset.forEach((row) => {
      const name = row.NamaGradeStick == null ? "" : String(row.NamaGradeStick).trim();
      if (!name) return;
      if (!gradesByNoST[row.NoST]) gradesByNoST[row.NoST] = new Set();
      gradesByNoST[row.NoST].add(name);
    });

    // Group data berdasarkan NoST
    const groupedData = {};
    const labelOrder = [];

    // Initialize summary variables
    let summaryTotalM3 = 0;
    let summaryTotalJumlah = 0;

    // Initialize grouped data structure
    labelHeaders.forEach((h) => {
      groupedData[h.NoST] = {
        NoProcKD: h.NoProcKD,
        NoST: h.NoST,
        DateCreate: formatDate(h.DateCreate),
        IdUOMTblLebar: h.IdUOMTblLebar,
        IdUOMPanjang: h.IdUOMPanjang,
        IdLokasi: h.IdLokasi,
        JenisKayu: h.JenisKayu == null ? "-" : String(h.JenisKayu).trim() || "-",
        Grade: gradesByNoST[h.NoST]?.size
          ? [...gradesByNoST[h.NoST]].join(", ")
          : "-",
        Details: [],
      };
      labelOrder.push(h.NoST);
    });

    // Populate detail data
    detailResult.recordset.forEach((row) => {
      if (groupedData[row.NoST]) {
        groupedData[row.NoST].Details.push({
          NoUrut: row.NoUrut,
          Tebal: row.Tebal,
          Lebar: row.Lebar,
          Panjang: row.Panjang,
          JmlhBatang: row.JmlhBatang,
        });
      }
    });

    // Process each label and calculate totals
    const processedLabels = labelOrder.map((noST) => {
      const label = groupedData[noST];
      label.Details.sort((a, b) => a.NoUrut - b.NoUrut);

      // Calculate M3 for each label (using ST calculation logic)
      let labelM3 = 0;
      let labelJumlah = 0;

      const formattedDetailData = label.Details.map((item) => {
        const tebal = item.Tebal;
        const lebar = item.Lebar;
        const panjang = item.Panjang;
        const pcs = item.JmlhBatang;
        const idUOMTblLebar = label.IdUOMTblLebar;

        let rowM3 = 0;

        // ST (Sawn Timber) calculation
        if (idUOMTblLebar === 1) {
          // Jika menggunakan milimeter
          rowM3 =
            ((((tebal * lebar * panjang * pcs * 304.8) / 1000000000 / 1.416) *
              10000) /
              10000) *
            1.416;
        } else {
          // Satuan lainnya
          rowM3 =
            ((((tebal * lebar * panjang * pcs) / 7200.8) * 10000) / 10000) *
            1.416;
        }

        // Membulatkan ke 4 desimal
        rowM3 = Math.floor(rowM3 * 10000) / 10000;

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

      // Add to summary totals
      summaryTotalM3 += labelM3;
      summaryTotalJumlah += labelJumlah;

      return {
        ...label,
        Details: formattedDetailData,
        LabelM3: labelM3.toFixed(4),
        LabelJumlah: labelJumlah,
      };
    });

    res.json({
      success: true,
      message: "Data detail KD berhasil diambil.",
      data: {
        labels: processedLabels,
        totalLabel,
        summary: {
          totalM3: summaryTotalM3.toFixed(4),
          totalJumlah: summaryTotalJumlah,
        },
      },
    });
  } catch (error) {
    console.error("Error fetching KD detail:", error);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
  // ← HAPUS finally block
});

//DATA LABEL YANG TELAH DI MAPPING
router.get(
  "/kd-bongkar/:noProcKD/detail-checked",
  verifyToken,
  async (req, res) => {
    const { noProcKD } = req.params;

    if (!noProcKD || noProcKD.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Parameter noProcKD harus diisi.",
      });
    }

    try {
      const pool = await poolPromise; // ← await poolPromise
      const request = pool.request(); // ← pool.request()

      request.input("noProcKD", sql.VarChar, noProcKD);

      // Ambil data label header (sudah dicek) - ST_h
      const labelHeaderQuery = `
      SELECT KD.[NoProcKD], KD.[NoST], ST.[DateCreate], ST.[IdUOMTblLebar], ST.[IdUOMPanjang], ST.[IdLokasi],
             JK.Jenis AS JenisKayu
      FROM KD_d KD
      LEFT JOIN ST_h ST ON KD.NoST = ST.NoST
      LEFT JOIN MstJenisKayu JK ON JK.IdJenisKayu = ST.IdJenisKayu
      WHERE KD.NoProcKD = @noProcKD
        AND ST.IdLokasi NOT LIKE '%J%'
        AND ST.IdLokasi NOT LIKE '%L%'
        AND ST.IdLokasi NOT LIKE '%KD%'
        AND ST.IdLokasi IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM ST_d STD 
          WHERE STD.NoST = ST.NoST
        )
    `;

      // Ambil total label (sudah dicek)
      const totalQuery = `
      SELECT COUNT(*) AS totalLabel
      FROM KD_d KD
      LEFT JOIN ST_h ST ON KD.NoST = ST.NoST
      WHERE KD.NoProcKD = @noProcKD
        AND ST.IdLokasi NOT LIKE '%J%'
        AND ST.IdLokasi NOT LIKE '%L%'
        AND ST.IdLokasi NOT LIKE '%KD%'
        AND ST.IdLokasi IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM ST_d STD 
          WHERE STD.NoST = ST.NoST
        )
    `;

      const [labelHeaderResult, totalResult] = await Promise.all([
        request.query(labelHeaderQuery),
        request.query(totalQuery),
      ]);

      const labelHeaders = labelHeaderResult.recordset;
      const totalLabel = totalResult.recordset[0]?.totalLabel || 0;

      if (labelHeaders.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Data detail KD (sudah dicek) tidak ditemukan.",
          data: {
            labels: [],
            totalLabel: 0,
            summary: {
              totalM3: "0.0000",
              totalJumlah: 0,
            },
          },
        });
      }

      // Ambil semua NoST untuk query detail
      const noSTList = labelHeaders.map((l) => `'${l.NoST}'`).join(",");

      // Query untuk mengambil data detail dari ST_d
      const detailQuery = `
      SELECT ST.NoST, ST.DateCreate, ST.IdUOMTblLebar, ST.IdUOMPanjang, ST.IdLokasi,
             STD.NoUrut, STD.Tebal, STD.Lebar, STD.Panjang, STD.JmlhBatang
      FROM ST_h ST
      LEFT JOIN ST_d STD ON ST.NoST = STD.NoST
      WHERE ST.NoST IN (${noSTList})
      AND STD.NoUrut IS NOT NULL
      ORDER BY ST.NoST, STD.NoUrut
    `;

      // Grade ST tersimpan di STStick (NamaGradeStick), bukan di ST_h.
      const gradeQuery = `
      SELECT S.NoST, G.NamaGradeStick
      FROM STStick S
      INNER JOIN MstGradeStick G ON G.IdGradeStick = S.IdGradeStick
      WHERE S.NoST IN (${noSTList})
      ORDER BY S.NoST, G.NamaGradeStick
    `;

      const [detailResult, gradeResult] = await Promise.all([
        request.query(detailQuery),
        request.query(gradeQuery),
      ]);

      const gradesByNoST = {};
      gradeResult.recordset.forEach((row) => {
        const name = row.NamaGradeStick == null ? "" : String(row.NamaGradeStick).trim();
        if (!name) return;
        if (!gradesByNoST[row.NoST]) gradesByNoST[row.NoST] = new Set();
        gradesByNoST[row.NoST].add(name);
      });

      // Group data berdasarkan NoST
      const groupedData = {};
      const labelOrder = [];

      // Initialize summary variables
      let summaryTotalM3 = 0;
      let summaryTotalJumlah = 0;

      // Initialize grouped data structure
      labelHeaders.forEach((h) => {
        groupedData[h.NoST] = {
          NoProcKD: h.NoProcKD,
          NoST: h.NoST,
          DateCreate: formatDate(h.DateCreate),
          IdUOMTblLebar: h.IdUOMTblLebar,
          IdUOMPanjang: h.IdUOMPanjang,
          IdLokasi: h.IdLokasi,
          JenisKayu: h.JenisKayu == null ? "-" : String(h.JenisKayu).trim() || "-",
          Grade: gradesByNoST[h.NoST]?.size
            ? [...gradesByNoST[h.NoST]].join(", ")
            : "-",
          Details: [],
        };
        labelOrder.push(h.NoST);
      });

      // Populate detail data
      detailResult.recordset.forEach((row) => {
        if (groupedData[row.NoST]) {
          groupedData[row.NoST].Details.push({
            NoUrut: row.NoUrut,
            Tebal: row.Tebal,
            Lebar: row.Lebar,
            Panjang: row.Panjang,
            JmlhBatang: row.JmlhBatang,
          });
        }
      });

      // Process each label and calculate totals
      const processedLabels = labelOrder.map((noST) => {
        const label = groupedData[noST];
        label.Details.sort((a, b) => a.NoUrut - b.NoUrut);

        // Calculate M3 for each label (using ST calculation logic)
        let labelM3 = 0;
        let labelJumlah = 0;

        const formattedDetailData = label.Details.map((item) => {
          const tebal = item.Tebal;
          const lebar = item.Lebar;
          const panjang = item.Panjang;
          const pcs = item.JmlhBatang;
          const idUOMTblLebar = label.IdUOMTblLebar;

          let rowM3 = 0;

          // ST (Sawn Timber) calculation
          if (idUOMTblLebar === 1) {
            // Jika menggunakan milimeter
            rowM3 =
              ((((tebal * lebar * panjang * pcs * 304.8) / 1000000000 / 1.416) *
                10000) /
                10000) *
              1.416;
          } else {
            // Satuan lainnya
            rowM3 =
              ((((tebal * lebar * panjang * pcs) / 7200.8) * 10000) / 10000) *
              1.416;
          }

          // Membulatkan ke 4 desimal
          rowM3 = Math.floor(rowM3 * 10000) / 10000;

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

        // Add to summary totals
        summaryTotalM3 += labelM3;
        summaryTotalJumlah += labelJumlah;

        return {
          ...label,
          Details: formattedDetailData,
          LabelM3: labelM3.toFixed(4),
          LabelJumlah: labelJumlah,
        };
      });

      res.json({
        success: true,
        message: "Data detail KD (sudah dicek) berhasil diambil.",
        data: {
          labels: processedLabels,
          totalLabel,
          summary: {
            totalM3: summaryTotalM3.toFixed(4),
            totalJumlah: summaryTotalJumlah,
          },
        },
      });
    } catch (error) {
      console.error("Error fetching KD detail (checked):", error);
      res.status(500).json({
        success: false,
        message: "Internal Server Error",
        error: error.message,
      });
    }
    // ← HAPUS finally block
  },
);

router.post("/kd-bongkar/check", verifyToken, async (req, res) => {
  const { noST, noProcKD } = req.body;

  if (!noST || !noProcKD) {
    return res.status(400).json({
      success: false,
      message: "Parameter noST dan noProcKD wajib diisi.",
    });
  }

  try {
    const pool = await poolPromise; // ← await poolPromise

    // Step 1: Cek DateUsage di ST_h
    const checkDateUsageRequest = pool.request(); // ← pool.request()
    checkDateUsageRequest.input("noST", sql.VarChar, noST);

    const dateUsageResult = await checkDateUsageRequest.query(`
      SELECT DateUsage FROM ST_h WHERE NoST = @noST
    `);

    const dateUsageRow = dateUsageResult.recordset[0];

    // Jika NoST tidak ditemukan di ST_h
    if (!dateUsageRow) {
      return res.status(404).json({
        success: false,
        message: "NoST tidak ditemukan.",
      });
    }

    // Jika DateUsage sudah terisi
    if (dateUsageRow.DateUsage !== null) {
      return res.status(200).json({
        success: false,
        message: "Label ini telah diproses.",
      });
    }

    // Step 2: Cek apakah NoST ada di KD_d
    const checkKDRequest = pool.request(); // ← pool.request()
    checkKDRequest.input("noST", sql.VarChar, noST);
    checkKDRequest.input("noProcKD", sql.VarChar, noProcKD);

    const kdResult = await checkKDRequest.query(`
      SELECT 1 FROM KD_d WHERE NoST = @noST AND NoProcKD = @noProcKD
    `);

    if (kdResult.recordset.length > 0) {
      return res.status(200).json({
        success: true,
        message: "NoST valid dan belum diproses.",
      });
    } else {
      return res.status(200).json({
        success: false,
        requireConfirmation: true,
        message:
          "Label bukan bagian dari NoKD ini, yakin ingin lanjut perbaharui lokasi?",
      });
    }
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      success: false,
      message: "Gagal memvalidasi NoST.",
      error: err.message,
    });
  }
});

router.post("/kd-bongkar/scan", verifyToken, async (req, res) => {
  const { noST, idLokasi } = req.body;
  const { username } = req;

  if (!noST || !idLokasi) {
    return res.status(400).json({
      success: false,
      message: "Parameter noST dan idlokasi wajib diisi.",
    });
  }

  try {
    const pool = await poolPromise; // ← await poolPromise
    const request = pool.request(); // ← pool.request()

    request.input("noST", sql.VarChar, noST);
    request.input("idlokasi", sql.VarChar, idLokasi);

    const result = await request.query(`
      UPDATE ST_h
      SET IdLokasi = @idLokasi
      WHERE NoST = @noST
    `);

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({
        success: false,
        message: "NoST tidak ditemukan atau tidak ada perubahan.",
      });
    }

    console.log(
      `[${new Date().toISOString()}] ${username} update lokasi ST: ${noST} → ${idLokasi}`,
    );

    return res.status(200).json({
      success: true,
      message: "Lokasi berhasil diperbarui.",
    });
  } catch (error) {
    console.error("Error update lokasi:", error);
    return res.status(500).json({
      success: false,
      message: "Gagal mengupdate lokasi.",
      error: error.message,
    });
  }
  // ← HAPUS finally block
});

module.exports = router;
