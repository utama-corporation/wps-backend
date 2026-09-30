const { sql, poolPromise } = require('../../core/config/db');

// MASTERS: jenis kayu
exports.getMasters = async () => {
  const pool = await poolPromise;
  const req = pool.request();
  const rs = await req.query(`
    SELECT IdJenisKayu, Jenis
    FROM MstJenisKayu
    WHERE Enable = 1
    ORDER BY Jenis ASC
  `);
  return rs.recordset.map(r => ({
    idJenisKayu: r.IdJenisKayu,
    jenis: r.Jenis,
  }));
};

// LIST: pagination + filter
exports.getHeaderQcSawmill = async ({
  page = 1,
  pageSize = 20,
  q = '',
  dateFrom = '',
  dateTo = '',
  idJenisKayu = null,
} = {}) => {
  const pool = await poolPromise;  // ← gunakan poolPromise, bukan connectDb()
  const request = pool.request();

  const offset = (page - 1) * pageSize;
  request.input('pageSize', sql.Int, pageSize);
  request.input('offset', sql.Int, offset);

  const where = ['1=1'];

  if (q) {
    request.input('q', sql.VarChar, `%${q}%`);
    where.push('(h.NoQc LIKE @q OR k.Jenis LIKE @q OR h.Meja LIKE @q)');
  }
  if (dateFrom) {
    request.input('dateFrom', sql.Date, dateFrom);
    where.push('CAST(h.Tgl AS date) >= @dateFrom');
  }
  if (dateTo) {
    request.input('dateTo', sql.Date, dateTo);
    where.push('CAST(h.Tgl AS date) <= @dateTo');
  }
  if (Number.isInteger(idJenisKayu) && !isNaN(idJenisKayu)) {
    request.input('idJenisKayu', sql.Int, idJenisKayu);
    where.push('h.IdJenisKayu = @idJenisKayu');
  }

  const whereSql = where.join(' AND ');

  const countSql = `
    SELECT COUNT(1) AS total
    FROM QcSawmill_h h
    LEFT JOIN MstJenisKayu k ON h.IdJenisKayu = k.IdJenisKayu
    WHERE ${whereSql};
  `;

  const dataSql = `
    SELECT
      h.NoQc,
      CONVERT(varchar(10), h.Tgl, 120) AS Tgl,
      h.IdJenisKayu,
      k.Jenis,
      h.Meja,
      m.NamaMeja
    FROM QcSawmill_h h
    LEFT JOIN MstJenisKayu k ON h.IdJenisKayu = k.IdJenisKayu
    LEFT JOIN MstMesinSawmill m ON h.Meja = m.NoMeja
    WHERE ${whereSql}
    ORDER BY h.Tgl DESC, h.NoQc DESC
    OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY;
  `;

  const [{ recordset: countRs }, { recordset }] = await Promise.all([
    request.query(countSql),
    request.query(dataSql),
  ]);

  const total = countRs?.[0]?.total ?? 0;

  const rows = recordset.map(r => ({
    noQc: r.NoQc,
    tgl: r.Tgl,
    idJenisKayu: r.IdJenisKayu,
    namaJenisKayu: r.Jenis,
    meja: r.Meja,
    namaMeja: r.NamaMeja
  }));

  return { rows, total };
};

/**
 * Generate NoQc (prefix hardcode 'M.') aman konkuren + insert header.
 * Kolom yang dipakai: NoQc, Tgl, IdJenisKayu, Meja.
 */
exports.createHeaderAutoNo = async ({ tgl, idJenisKayu, meja = '' }) => {
  const PREFIX = 'M.'; // hardcode

  const pool = await poolPromise;  // ← gunakan poolPromise
  const tx = new sql.Transaction(pool);
  await tx.begin();

  try {
    // 1) App lock supaya nomor tidak bentrok
    const reqLock = new sql.Request(tx);
    await reqLock.query(`
      DECLARE @res INT;
      EXEC @res = sp_getapplock
        @Resource = N'QcSawmill_h_NoQc_Auto',
        @LockMode = 'Exclusive',
        @LockTimeout = 10000;
      IF (@res < 0) THROW 51000, 'Gagal memperoleh applock untuk NoQc.', 1;
    `);

    // 2) Ambil nomor terakhir dengan prefix 'M.' (sorting numerik)
    const req1 = new sql.Request(tx);
    req1.input('prefix', sql.VarChar, PREFIX);
    const rs = await req1.query(`
      SELECT TOP 1
        NoQc,
        TRY_CONVERT(int, SUBSTRING(NoQc, LEN(@prefix) + 1, 50)) AS Num
      FROM QcSawmill_h WITH (HOLDLOCK, UPDLOCK)
      WHERE NoQc LIKE @prefix + '%'
      ORDER BY TRY_CONVERT(int, SUBSTRING(NoQc, LEN(@prefix) + 1, 50)) DESC, NoQc DESC;
    `);

    const last = rs.recordset[0];
    const lastNum = last?.Num ?? 0;
    const nextNum = lastNum + 1;
    const nextNo = `${PREFIX}${String(nextNum).padStart(6, '0')}`;

    // 3) Defensive check (harusnya aman karena lock)
    const reqChk = new sql.Request(tx);
    reqChk.input('noQc', sql.VarChar, nextNo);
    const chk = await reqChk.query(`SELECT 1 FROM QcSawmill_h WHERE NoQc = @noQc`);
    if (chk.recordset.length) {
      const err = new Error(`NoQc '${nextNo}' sudah ada. Coba ulangi.`);
      err.code = 'DUPLICATE_NOQC';
      throw err;
    }

    // 4) Insert header — HANYA kolom yang ada di tabel kamu
    const reqIns = new sql.Request(tx);
    reqIns.input('noQc', sql.VarChar, nextNo);
    reqIns.input('tgl', sql.Date, tgl);               // 'YYYY-MM-DD'
    reqIns.input('idJenisKayu', sql.Int, idJenisKayu);
    reqIns.input('meja', sql.VarChar, meja);

    await reqIns.query(`
      INSERT INTO QcSawmill_h (NoQc, Tgl, IdJenisKayu, Meja)
      VALUES (@noQc, @tgl, @idJenisKayu, @meja);
    `);

    // 5) Return row
    const reqSel = new sql.Request(tx);
    reqSel.input('noQc', sql.VarChar, nextNo);
    const rs2 = await reqSel.query(`
      SELECT TOP 1
        NoQc,
        CONVERT(varchar(10), Tgl, 120) AS Tgl,
        IdJenisKayu,
        Meja
      FROM QcSawmill_h
      WHERE NoQc = @noQc;
    `);

    await tx.commit();

    const r = rs2.recordset[0];
    return {
      noQc: r.NoQc,
      tgl: r.Tgl,
      idJenisKayu: r.IdJenisKayu,
      meja: r.Meja,
    };
  } catch (e) {
    try { await tx.rollback(); } catch {}
    throw e;
  }
};



  /**
 * Update header QcSawmill_h berdasarkan NoQc.
 * Hanya kolom yang dikirim yang diupdate (tgl, idJenisKayu, meja).
 * Return objek row terbaru atau null jika tidak ditemukan.
 */
  exports.updateHeaderByNoQc = async (noQc, updates = {}) => {
    const pool = await poolPromise;  // ← gunakan poolPromise
    const tx = new sql.Transaction(pool);
    await tx.begin();
  
    try {
      // pastikan ada datanya
      const reqChk = new sql.Request(tx);
      reqChk.input('noQc', sql.VarChar, noQc);
      const exists = await reqChk.query(`SELECT 1 AS x FROM QcSawmill_h WHERE NoQc = @noQc`);
      if (!exists.recordset.length) {
        await tx.rollback();
        return null;
      }
  
      // bangun SET dinamis
      const sets = [];
      const reqUpd = new sql.Request(tx);
  
      if (updates.tgl != null) {
        reqUpd.input('tgl', sql.Date, updates.tgl);
        sets.push('Tgl = @tgl');
      }
      if (updates.idJenisKayu != null) {
        reqUpd.input('idJenisKayu', sql.Int, updates.idJenisKayu);
        sets.push('IdJenisKayu = @idJenisKayu');
      }
      if (updates.meja != null) {
        reqUpd.input('meja', sql.VarChar, updates.meja);
        sets.push('Meja = @meja');
      }
  
      if (sets.length > 0) {
        reqUpd.input('noQc', sql.VarChar, noQc);
        const setSql = sets.join(', ');
        await reqUpd.query(`
          UPDATE QcSawmill_h
          SET ${setSql}
          WHERE NoQc = @noQc;
        `);
      }
  
      // ambil row terbaru untuk response
      const reqSel = new sql.Request(tx);
      reqSel.input('noQc', sql.VarChar, noQc);
      const rs = await reqSel.query(`
        SELECT TOP 1
          NoQc,
          CONVERT(varchar(10), Tgl, 120) AS Tgl,
          IdJenisKayu,
          Meja
        FROM QcSawmill_h
        WHERE NoQc = @noQc;
      `);
  
      await tx.commit();
  
      const r = rs.recordset[0];
      return r
        ? { noQc: r.NoQc, tgl: r.Tgl, idJenisKayu: r.IdJenisKayu, meja: r.Meja }
        : null;
    } catch (e) {
      try { await tx.rollback(); } catch {}
      throw e;
    }
  };


// DETAIL: hanya dari QcSawmill_d
exports.getDetailsByNoQc = async (noQc) => {
  const pool = await poolPromise;  // ← gunakan poolPromise
  const req = pool.request();
  req.input('noQc', sql.VarChar, noQc);

  const rs = await req.query(`
    SELECT
      d.NoQc,
      d.NoUrut,
      d.NoST,
      d.CuttingTebal,
      d.CuttingLebar,
      d.ActualTebal,
      d.ActualLebar,
      d.SusutTebal,
      d.SusutLebar
    FROM QcSawmill_d d
    WHERE d.NoQc = @noQc
    ORDER BY d.NoUrut
  `);

  return rs.recordset.map(r => ({
    noQc: r.NoQc,
    noUrut: r.NoUrut,
    noST: r.NoST,
    cuttingTebal: r.CuttingTebal,
    cuttingLebar: r.CuttingLebar,
    actualTebal: r.ActualTebal,
    actualLebar: r.ActualLebar,
    susutTebal: r.SusutTebal,
    susutLebar: r.SusutLebar,
  }));
};


exports.createDetailsByNoQc = async (noQc, items, { overwrite = false } = {}) => {
  const pool = await poolPromise;  // ← gunakan poolPromise
  const tx = new sql.Transaction(pool);

  await tx.begin();

  try {
    const req = new sql.Request(tx);
    req.input('noQc', sql.VarChar, noQc);

    if (overwrite) {
      await req.query('DELETE FROM QcSawmill_d WHERE NoQc = @noQc');
    }

    // Build one INSERT with many VALUES (...) rows, all parameterized
    const cols = [
      'NoQc',
      'NoUrut',
      'NoST',
      'CuttingTebal',
      'CuttingLebar',
      'ActualTebal',
      'ActualLebar',
      'SusutTebal',
      'SusutLebar',
    ];

    const valuesSql = [];
    items.forEach((it, idx) => {
      // bind params per row
      req.input(`noUrut_${idx}`, sql.Int, it.noUrut);
      req.input(`noST_${idx}`, sql.VarChar, it.noST ?? null);
      req.input(`ct_${idx}`, sql.Decimal(10,3), it.cuttingTebal ?? null);
      req.input(`cl_${idx}`, sql.Decimal(10,3), it.cuttingLebar ?? null);
      req.input(`at_${idx}`, sql.Decimal(10,3), it.actualTebal ?? null);
      req.input(`al_${idx}`, sql.Decimal(10,3), it.actualLebar ?? null);
      req.input(`st_${idx}`, sql.Decimal(10,3), it.susutTebal ?? null);
      req.input(`sl_${idx}`, sql.Decimal(10,3), it.susutLebar ?? null);

      valuesSql.push(
        `(@noQc, @noUrut_${idx}, @noST_${idx}, @ct_${idx}, @cl_${idx}, @at_${idx}, @al_${idx}, @st_${idx}, @sl_${idx})`
      );
    });

    const insertSql = `
      INSERT INTO QcSawmill_d (${cols.join(', ')})
      VALUES ${valuesSql.join(',\n')}
    `;

    await req.query(insertSql);

    await tx.commit();
    return { totalInserted: items.length };
  } catch (e) {
    try { await tx.rollback(); } catch (_) {}
    throw e;
  }
};


exports.deleteDetailsByNoQc = async (noQc) => {
  const pool = await poolPromise;  // ← gunakan poolPromise
  const tx = new sql.Transaction(pool);

  await tx.begin();
  try {
    const req = new sql.Request(tx);
    req.input('noQc', sql.VarChar, noQc);
    const r = await req.query('DELETE FROM QcSawmill_d WHERE NoQc=@noQc');
    await tx.commit();
    return { deleted: r.rowsAffected?.[0] ?? 0 };
  } catch (e) { try{await tx.rollback();}catch{} throw e; }
};


/**
 * Hapus detail (QcSawmill_d) lalu header (QcSawmill_h) untuk NoQc tertentu.
 * Semuanya dalam 1 transaksi. Return jumlah baris yang terhapus.
 */
exports.deleteByNoQc = async (noQc) => {
  const pool = await poolPromise;  // ← gunakan poolPromise
  const tx = new sql.Transaction(pool);

  await tx.begin();
  
    try {
      const req = new sql.Request(tx);
      req.input('noQc', sql.VarChar, noQc);
  
      // 1) Hapus detail dulu
      const delDetail = await req.query(`
        DELETE FROM QcSawmill_d WHERE NoQc = @noQc;
      `);
  
      const deletedDetails = Array.isArray(delDetail?.rowsAffected)
        ? delDetail.rowsAffected.reduce((a, b) => a + b, 0)
        : 0;
  
      // 2) Hapus header
      const delHeaderReq = new sql.Request(tx);
      delHeaderReq.input('noQc', sql.VarChar, noQc);
      const delHeader = await delHeaderReq.query(`
        DELETE FROM QcSawmill_h WHERE NoQc = @noQc;
      `);
  
      const deletedHeader = Array.isArray(delHeader?.rowsAffected)
        ? delHeader.rowsAffected.reduce((a, b) => a + b, 0)
        : 0;
  
      await tx.commit();
      return { deletedDetails, deletedHeader };
    } catch (e) {
      try { await tx.rollback(); } catch {}
      throw e;
    }
  };