const { sql, poolPromise } = require("../../../core/config/db");

// === ROOMS ===

async function getRooms(noRuang) {
  const pool = await poolPromise;

  if (noRuang) {
    const result = await pool
      .request()
      .input("NoRuang", sql.Int, noRuang)
      .query(`
        SELECT
          room.NoRuangKD AS no_ruang,
          CASE WHEN h.NoProcKD IS NOT NULL AND h.TglKeluar IS NULL THEN 'Jalan' ELSE 'Stop' END AS status,
          ISNULL(h.NoProcKD, '') AS no_proc_kd,
          CASE WHEN h.TglMasuk IS NOT NULL THEN CONVERT(varchar(10), h.TglMasuk, 103) ELSE '' END AS tgl_masuk,
          CASE WHEN h.TglKeluar IS NOT NULL THEN CONVERT(varchar(10), h.TglKeluar, 103) ELSE '-' END AS tgl_keluar,
          ISNULL(st.jml, 0) AS jml_st,
          ISNULL(ton.tonase, 0) AS tonase
        FROM (SELECT @NoRuang AS NoRuangKD) room
        LEFT JOIN KD_h h ON h.NoRuangKD = room.NoRuangKD AND h.TglKeluar IS NULL
        OUTER APPLY (
          SELECT COUNT(*) AS jml FROM KD_d d WHERE d.NoProcKD = h.NoProcKD
        ) st
        OUTER APPLY (
          SELECT
            SUM(CASE
              WHEN sh.IdUOMTblLebar = '1' AND sh.IdUOMPanjang = '4' THEN
                FLOOR(sd.Tebal * sd.Lebar * sd.Panjang * sd.JmlhBatang * 215.2542 / 100000) / 10000
              WHEN sh.IdUOMTblLebar = '3' AND sh.IdUOMPanjang = '4' THEN
                FLOOR(sd.Tebal * sd.Lebar * sd.Panjang * sd.JmlhBatang / 7200.8 * 10000) / 10000
              ELSE 0
            END) AS tonase
          FROM KD_d dd
          INNER JOIN ST_d sd ON sd.NoST = dd.NoST
          INNER JOIN ST_h sh ON sh.NoST = dd.NoST
          WHERE dd.NoProcKD = h.NoProcKD
        ) ton
        ORDER BY room.NoRuangKD ASC
      `);
    return result.recordset[0] || {};
  }

  const result = await pool.request().query(`
    SELECT
      room.NoRuangKD AS no_ruang,
      CASE WHEN h.NoProcKD IS NOT NULL AND h.TglKeluar IS NULL THEN 'Jalan' ELSE 'Stop' END AS status,
      ISNULL(h.NoProcKD, '') AS no_proc_kd,
      CASE WHEN h.TglMasuk IS NOT NULL THEN CONVERT(varchar(10), h.TglMasuk, 103) ELSE '' END AS tgl_masuk,
      CASE WHEN h.TglKeluar IS NOT NULL THEN CONVERT(varchar(10), h.TglKeluar, 103) ELSE '-' END AS tgl_keluar,
      ISNULL(st.jml, 0) AS jml_st,
      ISNULL(ton.tonase, 0) AS tonase
    FROM (VALUES (1),(2),(3),(4),(5),(6),(7),(8),(9),(10)) room(NoRuangKD)
    LEFT JOIN KD_h h ON h.NoRuangKD = room.NoRuangKD AND h.TglKeluar IS NULL
    OUTER APPLY (
      SELECT COUNT(*) AS jml FROM KD_d d WHERE d.NoProcKD = h.NoProcKD
    ) st
    OUTER APPLY (
      SELECT
        SUM(CASE
          WHEN sh.IdUOMTblLebar = '1' AND sh.IdUOMPanjang = '4' THEN
            FLOOR(sd.Tebal * sd.Lebar * sd.Panjang * sd.JmlhBatang * 215.2542 / 100000) / 10000
          WHEN sh.IdUOMTblLebar = '3' AND sh.IdUOMPanjang = '4' THEN
            FLOOR(sd.Tebal * sd.Lebar * sd.Panjang * sd.JmlhBatang / 7200.8 * 10000) / 10000
          ELSE 0
        END) AS tonase
      FROM KD_d dd
      INNER JOIN ST_d sd ON sd.NoST = dd.NoST
      INNER JOIN ST_h sh ON sh.NoST = dd.NoST
      WHERE dd.NoProcKD = h.NoProcKD
    ) ton
    ORDER BY room.NoRuangKD ASC
  `);
  return result.recordset;
}

// === MASTERS ===

async function getMasters() {
  const pool = await poolPromise;
  const result = await pool.request().query(`
    SELECT IdJenisKayu AS id, Jenis AS jenis
    FROM MstJenisKayu WHERE [Enable] = 1 ORDER BY Jenis ASC
  `);
  return result.recordset;
}

// === CARI ST ===

async function cariST(cari) {
  const pool = await poolPromise;
  const result = await pool
    .request()
    .input("Cari", sql.VarChar, `%${cari}%`)
    .query(`
      SELECT TOP 50
        h.NoST AS no_st,
        COALESCE(jk.Jenis, '') AS jenis,
        MAX(d.Tebal) AS tebal,
        MAX(d.Lebar) AS lebar,
        MAX(d.Panjang) AS panjang
      FROM ST_h h
      INNER JOIN ST_d d ON d.NoST = h.NoST
      LEFT JOIN MstJenisKayu jk ON jk.IdJenisKayu = h.IdJenisKayu
      WHERE h.StartKering = 1
        AND NOT EXISTS (
          SELECT 1 FROM KD_d kd
          INNER JOIN KD_h kh ON kh.NoProcKD = kd.NoProcKD
          WHERE kd.NoST = h.NoST AND kh.TglKeluar IS NULL
        )
        AND (@Cari = '%%' OR h.NoST LIKE @Cari OR jk.Jenis LIKE @Cari)
      GROUP BY h.NoST, jk.Jenis
      ORDER BY h.NoST ASC
    `);
  return result.recordset;
}

// === HEADER ===

async function getHeader(noProcKD) {
  const pool = await poolPromise;
  const result = await pool
    .request()
    .input("NoProcKD", sql.VarChar, noProcKD)
    .query(`
      SELECT
        NoProcKD AS no_proc_kd,
        NoRuangKD AS no_ruang,
        CASE WHEN TglMasuk IS NOT NULL THEN CONVERT(varchar(10), TglMasuk, 103) ELSE '' END AS tgl_masuk,
        CASE WHEN TglKeluar IS NOT NULL THEN CONVERT(varchar(10), TglKeluar, 103) ELSE '' END AS tgl_keluar
      FROM KD_h WHERE NoProcKD = @NoProcKD
    `);
  return result.recordset[0] || null;
}

// === DETAIL ===

async function getDetail(noProcKD) {
  const pool = await poolPromise;
  const result = await pool
    .request()
    .input("NoProcKD", sql.VarChar, noProcKD)
    .query(`
      SELECT
        d.NoST AS no_st,
        COALESCE(jk.Jenis, '') AS jenis,
        MAX(sd.Tebal) AS tebal,
        MAX(sd.Lebar) AS lebar,
        MAX(sd.Panjang) AS panjang
      FROM KD_d d
      LEFT JOIN ST_h sh ON sh.NoST = d.NoST
      LEFT JOIN MstJenisKayu jk ON jk.IdJenisKayu = sh.IdJenisKayu
      LEFT JOIN ST_d sd ON sd.NoST = d.NoST
      WHERE d.NoProcKD = @NoProcKD
      GROUP BY d.NoST, jk.Jenis
      ORDER BY d.NoST ASC
    `);
  return result.recordset;
}

// === START ROOM ===

async function startRoom(noRuang, nip) {
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    // Check room not already active
    const checkReq = transaction.request();
    checkReq.input("NoRuang", sql.Int, noRuang);
    const check = await checkReq.query(
      `SELECT NoProcKD FROM KD_h WHERE NoRuangKD = @NoRuang AND TglKeluar IS NULL`
    );
    if (check.recordset.length > 0) {
      await transaction.rollback();
      throw new Error("Kamar sudah aktif");
    }

    // Generate NoProcKD
    const genReq = transaction.request();
    const genNo = await genReq.query(`
      SELECT 'H.' + FORMAT(COALESCE(RIGHT(MAX(NoProcKD), 6), 0) + 1, '000000') AS NoProcKD
      FROM KD_h
    `);
    const noProcKD = genNo.recordset[0].NoProcKD;

    // Insert header
    const insertReq = transaction.request();
    insertReq.input("NoProcKD", sql.VarChar, noProcKD);
    insertReq.input("NoRuang", sql.Int, noRuang);
    await insertReq.query(`
      INSERT INTO KD_h (NoProcKD, NoRuangKD, TglMasuk, TglKeluar)
      VALUES (@NoProcKD, @NoRuang, GETDATE(), NULL)
    `);

    // Riwayat
    if (nip) {
      const riwReq = transaction.request();
      riwReq.input("Nip", sql.VarChar, nip);
      riwReq.input("Aktivitas", sql.VarChar, `Start KD kamar ${noRuang} - NoProcKD: ${noProcKD}`);
      await riwReq.query(`
        INSERT INTO Riwayat ([Nip], [Tgl], [Aktivitas])
        VALUES (@Nip, GETDATE(), @Aktivitas)
      `);
    }

    await transaction.commit();
    return { no_proc_kd: noProcKD };
  } catch (err) {
    try { await transaction.rollback(); } catch (rbErr) { console.error("Rollback failed:", rbErr.message); }
    throw err;
  }
}

// === STOP ROOM ===

async function stopRoom(noRuang, nip) {
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    // Get active header
    const headerReq = transaction.request();
    headerReq.input("NoRuang", sql.Int, noRuang);
    const header = await headerReq.query(
      `SELECT NoProcKD FROM KD_h WHERE NoRuangKD = @NoRuang AND TglKeluar IS NULL`
    );
    if (header.recordset.length === 0) {
      await transaction.rollback();
      throw new Error("Kamar tidak aktif");
    }
    const noProcKD = header.recordset[0].NoProcKD;

    // Update TglKeluar
    const updReq = transaction.request();
    updReq.input("NoProcKD", sql.VarChar, noProcKD);
    await updReq.query(`UPDATE KD_h SET TglKeluar = GETDATE() WHERE NoProcKD = @NoProcKD`);

    // Reset StartKering on ST labels
    const rstReq = transaction.request();
    rstReq.input("NoProcKD", sql.VarChar, noProcKD);
    await rstReq.query(`
      UPDATE ST_h SET StartKering = 1 WHERE NoST IN (
        SELECT NoST FROM KD_d WHERE NoProcKD = @NoProcKD
      )
    `);

    // Riwayat
    if (nip) {
      const riwReq = transaction.request();
      riwReq.input("Nip", sql.VarChar, nip);
      riwReq.input("Aktivitas", sql.VarChar, `Stop KD kamar ${noRuang} - NoProcKD: ${noProcKD}`);
      await riwReq.query(`
        INSERT INTO Riwayat ([Nip], [Tgl], [Aktivitas])
        VALUES (@Nip, GETDATE(), @Aktivitas)
      `);
    }

    await transaction.commit();
    return { no_proc_kd: noProcKD };
  } catch (err) {
    try { await transaction.rollback(); } catch (rbErr) { console.error("Rollback failed:", rbErr.message); }
    throw err;
  }
}

// === CREATE HEADER ===

async function createHeader(data) {
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const genReq = transaction.request();
    const genNo = await genReq.query(`
      SELECT 'H.' + FORMAT(COALESCE(RIGHT(MAX(NoProcKD), 6), 0) + 1, '000000') AS NoProcKD
      FROM KD_h
    `);
    const noProcKD = genNo.recordset[0].NoProcKD;

    const insertReq = transaction.request();
    insertReq.input("NoProcKD", sql.VarChar, noProcKD);
    insertReq.input("NoRuang", sql.Int, data.no_ruang);
    await insertReq.query(`
      INSERT INTO KD_h (NoProcKD, NoRuangKD, TglMasuk, TglKeluar)
      VALUES (@NoProcKD, @NoRuang, GETDATE(), NULL)
    `);

    if (data.nip) {
      const riwReq = transaction.request();
      riwReq.input("Nip", sql.VarChar, data.nip);
      riwReq.input("Aktivitas", sql.VarChar, `Buat KD kamar ${data.no_ruang} - NoProcKD: ${noProcKD}`);
      await riwReq.query(`
        INSERT INTO Riwayat ([Nip], [Tgl], [Aktivitas])
        VALUES (@Nip, GETDATE(), @Aktivitas)
      `);
    }

    await transaction.commit();
    return { no_proc_kd: noProcKD };
  } catch (err) {
    try { await transaction.rollback(); } catch (rbErr) { console.error("Rollback failed:", rbErr.message); }
    throw err;
  }
}

// === UPDATE HEADER ===

async function updateHeader(data) {
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const updReq = transaction.request();
    updReq.input("NoProcKD", sql.VarChar, data.no_proc_kd);
    updReq.input("NoRuang", sql.Int, data.no_ruang);
    updReq.input("TglMasuk", sql.DateTime, data.tgl_masuk);
    await updReq.query(`
      UPDATE KD_h SET NoRuangKD = @NoRuang, TglMasuk = @TglMasuk WHERE NoProcKD = @NoProcKD
    `);

    if (data.nip) {
      const riwReq = transaction.request();
      riwReq.input("Nip", sql.VarChar, data.nip);
      riwReq.input("Aktivitas", sql.VarChar, `Update KD kamar ${data.no_ruang} - NoProcKD: ${data.no_proc_kd}`);
      await riwReq.query(`
        INSERT INTO Riwayat ([Nip], [Tgl], [Aktivitas])
        VALUES (@Nip, GETDATE(), @Aktivitas)
      `);
    }

    await transaction.commit();
    return { no_proc_kd: data.no_proc_kd };
  } catch (err) {
    try { await transaction.rollback(); } catch (rbErr) { console.error("Rollback failed:", rbErr.message); }
    throw err;
  }
}

// === DELETE HEADER ===

async function deleteHeader(noProcKD, nip) {
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    // Reset StartKering
    const rstReq = transaction.request();
    rstReq.input("NoProcKD", sql.VarChar, noProcKD);
    await rstReq.query(`
      UPDATE ST_h SET StartKering = 1 WHERE NoST IN (
        SELECT NoST FROM KD_d WHERE NoProcKD = @NoProcKD
      )
    `);

    // Delete detail
    const delDReq = transaction.request();
    delDReq.input("NoProcKD", sql.VarChar, noProcKD);
    await delDReq.query(`DELETE FROM KD_d WHERE NoProcKD = @NoProcKD`);

    // Delete header
    const delHReq = transaction.request();
    delHReq.input("NoProcKD", sql.VarChar, noProcKD);
    await delHReq.query(`DELETE FROM KD_h WHERE NoProcKD = @NoProcKD`);

    // Riwayat
    if (nip) {
      const riwReq = transaction.request();
      riwReq.input("Nip", sql.VarChar, nip);
      riwReq.input("Aktivitas", sql.VarChar, `Hapus KD - NoProcKD: ${noProcKD}`);
      await riwReq.query(`
        INSERT INTO Riwayat ([Nip], [Tgl], [Aktivitas])
        VALUES (@Nip, GETDATE(), @Aktivitas)
      `);
    }

    await transaction.commit();
    return { no_proc_kd: noProcKD };
  } catch (err) {
    try { await transaction.rollback(); } catch (rbErr) { console.error("Rollback failed:", rbErr.message); }
    throw err;
  }
}

// === ADD DETAIL (ST) ===

async function addDetail(noProcKD, noST, noRuang, nip) {
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    // Validate ST exists
    const stReq = transaction.request();
    stReq.input("NoST", sql.VarChar, noST);
    const stCheck = await stReq.query(`SELECT NoST FROM ST_h WHERE NoST = @NoST`);
    if (stCheck.recordset.length === 0) {
      await transaction.rollback();
      throw new Error(`ST ${noST} tidak ditemukan`);
    }

    // Validate ST not used in active KD
    const usedReq = transaction.request();
    usedReq.input("NoST", sql.VarChar, noST);
    const usedCheck = await usedReq.query(`
      SELECT 1 FROM KD_d kd
      INNER JOIN KD_h kh ON kh.NoProcKD = kd.NoProcKD
      WHERE kd.NoST = @NoST AND kh.TglKeluar IS NULL
    `);
    if (usedCheck.recordset.length > 0) {
      await transaction.rollback();
      throw new Error(`ST ${noST} sudah digunakan di kamar lain`);
    }

    // Validate ST not sold
    const soldReq = transaction.request();
    soldReq.input("NoST", sql.VarChar, noST);
    const soldCheck = await soldReq.query(`SELECT 1 FROM STJual_d WHERE NoST = @NoST`);
    if (soldCheck.recordset.length > 0) {
      await transaction.rollback();
      throw new Error(`ST ${noST} sudah terjual`);
    }

    // Check not already in this KD
    const dupReq = transaction.request();
    dupReq.input("NoProcKD", sql.VarChar, noProcKD);
    dupReq.input("NoST", sql.VarChar, noST);
    const dupCheck = await dupReq.query(`
      SELECT 1 FROM KD_d WHERE NoProcKD = @NoProcKD AND NoST = @NoST
    `);
    if (dupCheck.recordset.length > 0) {
      await transaction.rollback();
      throw new Error(`ST ${noST} sudah ada di kamar ini`);
    }

    const idLokasi = "KD" + String(noRuang).padStart(2, "0");

    // Insert detail
    const insReq = transaction.request();
    insReq.input("NoProcKD", sql.VarChar, noProcKD);
    insReq.input("NoST", sql.VarChar, noST);
    await insReq.query(`INSERT INTO KD_d (NoProcKD, NoST) VALUES (@NoProcKD, @NoST)`);

    // Update ST_h
    const updReq = transaction.request();
    updReq.input("NoST", sql.VarChar, noST);
    updReq.input("IdLokasi", sql.VarChar, idLokasi);
    await updReq.query(`UPDATE ST_h SET StartKering = 0, IdLokasi = @IdLokasi WHERE NoST = @NoST`);

    // Riwayat
    if (nip) {
      const riwReq = transaction.request();
      riwReq.input("Nip", sql.VarChar, nip);
      riwReq.input("Aktivitas", sql.VarChar, `Tambah ST ${noST} ke KD kamar ${noRuang} - NoProcKD: ${noProcKD}`);
      await riwReq.query(`
        INSERT INTO Riwayat ([Nip], [Tgl], [Aktivitas])
        VALUES (@Nip, GETDATE(), @Aktivitas)
      `);
    }

    await transaction.commit();
    return { no_proc_kd: noProcKD, no_st: noST };
  } catch (err) {
    try { await transaction.rollback(); } catch (rbErr) { console.error("Rollback failed:", rbErr.message); }
    throw err;
  }
}

// === REMOVE DETAIL (ST) ===

async function removeDetail(noProcKD, noST) {
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    // Reset StartKering
    const rstReq = transaction.request();
    rstReq.input("NoST", sql.VarChar, noST);
    await rstReq.query(`UPDATE ST_h SET StartKering = 1 WHERE NoST = @NoST`);

    // Delete detail
    const delReq = transaction.request();
    delReq.input("NoProcKD", sql.VarChar, noProcKD);
    delReq.input("NoST", sql.VarChar, noST);
    await delReq.query(`DELETE FROM KD_d WHERE NoProcKD = @NoProcKD AND NoST = @NoST`);

    await transaction.commit();
    return { no_proc_kd: noProcKD, no_st: noST };
  } catch (err) {
    try { await transaction.rollback(); } catch (rbErr) { console.error("Rollback failed:", rbErr.message); }
    throw err;
  }
}

// === HISTORY ===

async function getHistory(noRuang) {
  const pool = await poolPromise;
  let whereClause = "";
  const req = pool.request();

  if (noRuang && noRuang > 0) {
    req.input("NoRuang", sql.Int, noRuang);
    whereClause = "WHERE h.NoRuangKD = @NoRuang";
  }

  const result = await req.query(`
    SELECT TOP 50
      h.NoProcKD AS no_proc_kd,
      h.NoRuangKD AS no_ruang,
      CONVERT(varchar(10), h.TglMasuk, 103) AS tgl_masuk,
      CASE WHEN h.TglKeluar IS NOT NULL THEN CONVERT(varchar(10), h.TglKeluar, 103) ELSE '-' END AS tgl_keluar,
      ISNULL(st.jml, 0) AS jml_st,
      ISNULL(ton.tonase, 0) AS tonase,
      CASE WHEN h.TglKeluar IS NULL THEN 'Aktif' ELSE 'Selesai' END AS status
    FROM KD_h h
    OUTER APPLY (
      SELECT COUNT(*) AS jml FROM KD_d d WHERE d.NoProcKD = h.NoProcKD
    ) st
    OUTER APPLY (
      SELECT
        SUM(CASE
          WHEN sh.IdUOMTblLebar = '1' AND sh.IdUOMPanjang = '4' THEN
            FLOOR(sd.Tebal * sd.Lebar * sd.Panjang * sd.JmlhBatang * 215.2542 / 100000) / 10000
          WHEN sh.IdUOMTblLebar = '3' AND sh.IdUOMPanjang = '4' THEN
            FLOOR(sd.Tebal * sd.Lebar * sd.Panjang * sd.JmlhBatang / 7200.8 * 10000) / 10000
          ELSE 0
        END) AS tonase
      FROM KD_d dd
      INNER JOIN ST_d sd ON sd.NoST = dd.NoST
      INNER JOIN ST_h sh ON sh.NoST = dd.NoST
      WHERE dd.NoProcKD = h.NoProcKD
    ) ton
    ${whereClause}
    ORDER BY h.TglMasuk DESC
  `);
  return result.recordset;
}

module.exports = {
  getRooms,
  getMasters,
  cariST,
  getHeader,
  getDetail,
  getHistory,
  startRoom,
  stopRoom,
  createHeader,
  updateHeader,
  deleteHeader,
  addDetail,
  removeDetail,
};
