const { sql, poolPromise } = require("../../../core/config/db");

/* ============================================================
 * GET ALL (header list with buyer name)
 * ==========================================================*/
async function getAll({ search, topRow }) {
  const pool = await poolPromise;
  const req = pool.request();
  const top = parseInt(topRow, 10) || 100;
  req.input("top", sql.Int, top);

  let where = "";
  if (search) {
    req.input("search", sql.VarChar(50), `%${search}%`);
    where = "WHERE A.NoBJJual LIKE @search OR A.NoSPK LIKE @search OR C.Buyer LIKE @search";
  }

  const result = await req.query(`
    SELECT TOP (${top})
      A.NoBJJual,
      A.TglJual,
      A.NoSPK,
      C.Buyer,
      A.Keterangan
    FROM BJJual_h A
    INNER JOIN MstSPK_h B ON B.NoSPK = A.NoSPK
    INNER JOIN MstBuyer C ON C.IdBuyer = B.IdBuyer
    ${where}
    ORDER BY A.NoBJJual DESC
  `);
  return result.recordset;
}

/* ============================================================
 * GET DETAIL (detail rows for a NoBJJual)
 * ==========================================================*/
async function getDetail(noBJJual) {
  const pool = await poolPromise;
  const req = pool.request();
  req.input("noBJJual", sql.VarChar(50), noBJJual);

  const result = await req.query(`
    SELECT
      A.NoBJ,
      B.Tebal,
      B.Lebar,
      B.Panjang,
      B.JmlhBatang,
      D.NamaBarangJadi,
      E.Jenis
    FROM BJJual_d A
    INNER JOIN BarangJadi_h C ON C.NoBJ = A.NoBJ
    INNER JOIN BarangJadi_d B ON B.NoBJ = A.NoBJ
    INNER JOIN MstBarangJadi D ON D.IdBarangJadi = C.IdBarangJadi
    INNER JOIN MstJenisKayu E ON E.IdJenisKayu = C.IdJenisKayu
    WHERE A.NoBJJual = @noBJJual
    ORDER BY A.NoBJ
  `);
  return result.recordset;
}

/* ============================================================
 * GENERATE NO
 * ==========================================================*/
async function generateNo() {
  const pool = await poolPromise;
  const req = pool.request();
  const result = await req.query(`
    SELECT 'J.' + FORMAT(ISNULL(RIGHT(MAX(NoBJJual), 6), 0) + 1, '000000') AS NoBJJual
    FROM BJJual_h
  `);
  return result.recordset[0].NoBJJual;
}

/* ============================================================
 * GET SPK LIST (for combo)
 * ==========================================================*/
async function getSpkList() {
  const pool = await poolPromise;
  const req = pool.request();
  const result = await req.query(`
    SELECT A.NoSPK, B.Buyer
    FROM MstSPK_h A
    INNER JOIN MstBuyer B ON B.IdBuyer = A.IdBuyer
    ORDER BY A.NoSPK DESC
  `);
  return result.recordset;
}

/* ============================================================
 * LOOKUP BJ LABEL (validate + get info)
 * ==========================================================*/
async function lookupBJ(noBJ) {
  const pool = await poolPromise;
  const req = pool.request();
  req.input("noBJ", sql.VarChar(50), noBJ);

  const result = await req.query(`
    SELECT
      A.NoBJ,
      B.Tebal,
      B.Lebar,
      B.Panjang,
      B.JmlhBatang,
      C.NamaBarangJadi,
      D.Jenis,
      A.DateUsage,
      A.IdBarangJadi,
      A.IdJenisKayu
    FROM BarangJadi_h A
    INNER JOIN BarangJadi_d B ON B.NoBJ = A.NoBJ
    INNER JOIN MstBarangJadi C ON C.IdBarangJadi = A.IdBarangJadi
    INNER JOIN MstJenisKayu D ON D.IdJenisKayu = A.IdJenisKayu
    WHERE A.NoBJ = @noBJ
  `);

  const row = result.recordset[0] || null;
  if (!row) return { found: false, reason: "Label BJ " + noBJ + " tidak ditemukan." };

  if (row.DateUsage) {
    const checkUsed = await pool.request().input("noBJ", sql.VarChar(50), noBJ).query(`
      SELECT A.NoBJJual, C.Buyer
      FROM BJJual_d X
      INNER JOIN BJJual_h A ON A.NoBJJual = X.NoBJJual
      INNER JOIN MstSPK_h B ON B.NoSPK = A.NoSPK
      INNER JOIN MstBuyer C ON C.IdBuyer = B.IdBuyer
      WHERE X.NoBJ = @noBJ
    `);
    if (checkUsed.recordset.length > 0) {
      return {
        found: false,
        reason: "Label BJ " + noBJ + " sudah dijual ke " + checkUsed.recordset[0].Buyer + " (No: " + checkUsed.recordset[0].NoBJJual + ")."
      };
    }
    return { found: false, reason: "Label BJ " + noBJ + " sudah pernah dipakai (DateUsage terisi)." };
  }

  return { found: true, data: row };
}

/* ============================================================
 * CREATE (insert header + detail + set DateUsage)
 * ==========================================================*/
async function createBJJual(data) {
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const req = new sql.Request(transaction);
    req.input("noBJJual", sql.VarChar(50), data.noBJJual);
    req.input("tglJual", sql.Date, data.tglJual || new Date());
    req.input("noSPK", sql.VarChar(50), data.noSPK);
    req.input("keterangan", sql.VarChar(200), data.keterangan || null);

    await req.query(`
      INSERT INTO BJJual_h (NoBJJual, TglJual, NoSPK, Keterangan)
      VALUES (@noBJJual, @tglJual, @noSPK, @keterangan)
    `);

    if (data.details && Array.isArray(data.details)) {
      for (const noBJ of data.details) {
        const detReq = new sql.Request(transaction);
        detReq.input("noBJJual", sql.VarChar(50), data.noBJJual);
        detReq.input("noBJ", sql.VarChar(50), noBJ);
        await detReq.query(`
          INSERT INTO BJJual_d (NoBJJual, NoBJ) VALUES (@noBJJual, @noBJ)
        `);

        const updReq = new sql.Request(transaction);
        updReq.input("noBJ", sql.VarChar(50), noBJ);
        updReq.input("tglJual", sql.Date, data.tglJual || new Date());
        await updReq.query(`
          UPDATE BarangJadi_h SET DateUsage = @tglJual WHERE NoBJ = @noBJ
        `);
      }
    }

    const auditReq = new sql.Request(transaction);
    auditReq.input("nip", sql.VarChar(50), data.user || "admin");
    auditReq.input("aktifitas", sql.VarChar(500),
      "Menyimpan Nomor " + data.noBJJual + " Pada Barang Jadi (Pemjualan)");
    await auditReq.query(`
      INSERT INTO Riwayat ([Nip], [Tgl], [Aktivitas])
      VALUES (@nip, GETDATE(), @aktifitas)
    `);

    await transaction.commit();
    return { noBJJual: data.noBJJual };
  } catch (err) {
    console.error("BJJual Create Error:", err.message);
    await transaction.rollback();
    throw err;
  }
}

/* ============================================================
 * UPDATE (header + replace detail)
 * ==========================================================*/
async function updateBJJual(noBJJual, data) {
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    // Reset old detail DateUsage
    const oldDetails = await transaction.request().input("noBJJual", sql.VarChar(50), noBJJual).query(`
      SELECT NoBJ FROM BJJual_d WHERE NoBJJual = @noBJJual
    `);
    for (const row of oldDetails.recordset) {
      const r = new sql.Request(transaction);
      r.input("noBJ", sql.VarChar(50), row.NoBJ);
      await r.query(`UPDATE BarangJadi_h SET DateUsage = NULL WHERE NoBJ = @noBJ`);
    }

    // Delete old detail
    const delReq = new sql.Request(transaction);
    delReq.input("noBJJual", sql.VarChar(50), noBJJual);
    await delReq.query(`DELETE FROM BJJual_d WHERE NoBJJual = @noBJJual`);

    // Update header
    const updReq = new sql.Request(transaction);
    updReq.input("noBJJual", sql.VarChar(50), noBJJual);
    updReq.input("tglJual", sql.Date, data.tglJual || new Date());
    updReq.input("noSPK", sql.VarChar(50), data.noSPK);
    updReq.input("keterangan", sql.VarChar(200), data.keterangan || null);
    await updReq.query(`
      UPDATE BJJual_h
      SET TglJual = @tglJual, NoSPK = @noSPK, Keterangan = @keterangan
      WHERE NoBJJual = @noBJJual
    `);

    // Insert new detail + set DateUsage
    if (data.details && Array.isArray(data.details)) {
      for (const noBJ of data.details) {
        const detReq = new sql.Request(transaction);
        detReq.input("noBJJual", sql.VarChar(50), noBJJual);
        detReq.input("noBJ", sql.VarChar(50), noBJ);
        await detReq.query(`
          INSERT INTO BJJual_d (NoBJJual, NoBJ) VALUES (@noBJJual, @noBJ)
        `);

        const updBJ = new sql.Request(transaction);
        updBJ.input("noBJ", sql.VarChar(50), noBJ);
        updBJ.input("tglJual", sql.Date, data.tglJual || new Date());
        await updBJ.query(`UPDATE BarangJadi_h SET DateUsage = @tglJual WHERE NoBJ = @noBJ`);
      }
    }

    const auditReq = new sql.Request(transaction);
    auditReq.input("nip", sql.VarChar(50), data.user || "admin");
    auditReq.input("aktifitas", sql.VarChar(500),
      "Mengubah Nomor " + noBJJual + " Pada Barang Jadi (Pemjualan)");
    await auditReq.query(`
      INSERT INTO Riwayat ([Nip], [Tgl], [Aktivitas])
      VALUES (@nip, GETDATE(), @aktifitas)
    `);

    await transaction.commit();
    return { noBJJual };
  } catch (err) {
    console.error("BJJual Update Error:", err.message);
    await transaction.rollback();
    throw err;
  }
}

/* ============================================================
 * DELETE (release DateUsage, delete detail, delete header)
 * ==========================================================*/
async function deleteBJJual(noBJJual, user) {
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    // Release DateUsage
    const oldDetails = await transaction.request().input("noBJJual", sql.VarChar(50), noBJJual).query(`
      SELECT NoBJ FROM BJJual_d WHERE NoBJJual = @noBJJual
    `);
    for (const row of oldDetails.recordset) {
      const r = new sql.Request(transaction);
      r.input("noBJ", sql.VarChar(50), row.NoBJ);
      await r.query(`UPDATE BarangJadi_h SET DateUsage = NULL WHERE NoBJ = @noBJ`);
    }

    const delDetReq = new sql.Request(transaction);
    delDetReq.input("noBJJual", sql.VarChar(50), noBJJual);
    await delDetReq.query(`DELETE FROM BJJual_d WHERE NoBJJual = @noBJJual`);

    const delHReq = new sql.Request(transaction);
    delHReq.input("noBJJual", sql.VarChar(50), noBJJual);
    await delHReq.query(`DELETE FROM BJJual_h WHERE NoBJJual = @noBJJual`);

    const auditReq = new sql.Request(transaction);
    auditReq.input("nip", sql.VarChar(50), user || "admin");
    auditReq.input("aktifitas", sql.VarChar(500),
      "Menghapus Nomor " + noBJJual + " Pada Barang Jadi (Pemjualan)");
    await auditReq.query(`
      INSERT INTO Riwayat ([Nip], [Tgl], [Aktivitas])
      VALUES (@nip, GETDATE(), @aktifitas)
    `);

    await transaction.commit();
    return { noBJJual };
  } catch (err) {
    console.error("BJJual Delete Error:", err.message);
    await transaction.rollback();
    throw err;
  }
}

/* ============================================================
 * SCAN BJ (validate single label + add to detail + set DateUsage)
 * ==========================================================*/
async function scanBJ(noBJJual, noBJ, tglJual, user) {
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    // Validate BJ exists
    const checkReq = pool.request();
    checkReq.input("noBJ", sql.VarChar(50), noBJ);
    const checkResult = await checkReq.query(`
      SELECT A.NoBJ, A.DateUsage
      FROM BarangJadi_h A
      WHERE A.NoBJ = @noBJ
    `);
    if (checkResult.recordset.length === 0) {
      throw new Error("Label BJ " + noBJ + " tidak ditemukan.");
    }
    if (checkResult.recordset[0].DateUsage) {
      throw new Error("Label BJ " + noBJ + " sudah pernah dipakai (DateUsage terisi).");
    }

    // Check duplicate in this sale
    const dupReq = pool.request();
    dupReq.input("noBJ", sql.VarChar(50), noBJ);
    dupReq.input("noBJJual", sql.VarChar(50), noBJJual);
    const dupResult = await dupReq.query(`
      SELECT NoBJ FROM BJJual_d WHERE NoBJ = @noBJ AND NoBJJual = @noBJJual
    `);
    if (dupResult.recordset.length > 0) {
      throw new Error("Label BJ " + noBJ + " sudah ada dalam transaksi ini.");
    }

    // Check if already sold in another transaction
    const soldReq = pool.request();
    soldReq.input("noBJ", sql.VarChar(50), noBJ);
    const soldResult = await soldReq.query(`
      SELECT X.NoBJJual, C.Buyer
      FROM BJJual_d X
      INNER JOIN BJJual_h A ON A.NoBJJual = X.NoBJJual
      INNER JOIN MstSPK_h B ON B.NoSPK = A.NoSPK
      INNER JOIN MstBuyer C ON C.IdBuyer = B.IdBuyer
      WHERE X.NoBJ = @noBJ AND X.NoBJJual <> @noBJJual
    `);
    if (soldResult.recordset.length > 0) {
      throw new Error("Label BJ " + noBJ + " sudah dijual ke " + soldResult.recordset[0].Buyer + " (No: " + soldResult.recordset[0].NoBJJual + ").");
    }

    // Insert detail
    const insDet = new sql.Request(transaction);
    insDet.input("noBJJual", sql.VarChar(50), noBJJual);
    insDet.input("noBJ", sql.VarChar(50), noBJ);
    await insDet.query(`INSERT INTO BJJual_d (NoBJJual, NoBJ) VALUES (@noBJJual, @noBJ)`);

    // Set DateUsage
    const updBJ = new sql.Request(transaction);
    updBJ.input("noBJ", sql.VarChar(50), noBJ);
    updBJ.input("tglJual", sql.Date, tglJual || new Date());
    await updBJ.query(`UPDATE BarangJadi_h SET DateUsage = @tglJual WHERE NoBJ = @noBJ`);

    await transaction.commit();

    // Get BJ info for display
    const infoReq = pool.request();
    infoReq.input("noBJ", sql.VarChar(50), noBJ);
    const infoResult = await infoReq.query(`
      SELECT A.NoBJ, B.Tebal, B.Lebar, B.Panjang, B.JmlhBatang,
             C.NamaBarangJadi, D.Jenis
      FROM BarangJadi_h A
      INNER JOIN BarangJadi_d B ON B.NoBJ = A.NoBJ
      INNER JOIN MstBarangJadi C ON C.IdBarangJadi = A.IdBarangJadi
      INNER JOIN MstJenisKayu D ON D.IdJenisKayu = A.IdJenisKayu
      WHERE A.NoBJ = @noBJ
    `);

    return { success: true, data: infoResult.recordset[0] || null };
  } catch (err) {
    console.error("BJJual Scan Error:", err.message);
    await transaction.rollback();
    throw err;
  }
}

module.exports = {
  getAll,
  getDetail,
  generateNo,
  getSpkList,
  lookupBJ,
  createBJJual,
  updateBJJual,
  deleteBJJual,
  scanBJ
};
