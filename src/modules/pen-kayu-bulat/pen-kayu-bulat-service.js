const { sql, poolPromise } = require('../../core/config/db');

const lockNonAktif = () => String(process.env.LOCK_NON_AKTIF_EDIT || "1") !== "0";

exports.getNextNo = async () => {
  const pool = await poolPromise;
  const result = await pool.request().query(`
    SELECT 'A.' + FORMAT(COALESCE(RIGHT(MAX(NoKayuBulat), 6), 0) + 1, '000000') AS NoKayuBulat
    FROM KayuBulat_h
  `);
  return result.recordset[0]?.NoKayuBulat || "A.000001";
};

exports.getMasters = async () => {
  const pool = await poolPromise;

  const jenisKayu = await pool.request().query(`
    SELECT IdJenisKayu AS id, Jenis AS nama
    FROM MstJenisKayu
    WHERE [Enable] = 1
    ORDER BY Jenis ASC
  `);

  const supplier = await pool.request().query(`
    SELECT IdSupplier AS id, NmSupplier AS nama
    FROM MstSupplier
    WHERE [Enable] = 1
    ORDER BY NmSupplier ASC
  `);

  const pengukuran = await pool.request().query(`
    SELECT IdPengukuran AS id, GolPengukuran AS gol
    FROM MstGolPengukuran
    WHERE [Enable] = 1
    ORDER BY IdPengukuran ASC
  `);

  const kendaraan = await pool.request().query(`
    SELECT IdJenisKendaraan AS id, Type + ' - ' + Model AS nama
    FROM MstJenisKendaraan
    WHERE [Enable] = 1
    ORDER BY Type ASC
  `);

  const grade = await pool.request().query(`
    SELECT IdGradeKB AS id, NamaGrade AS nama
    FROM MstGradeKB
    WHERE [Enable] = 1 AND IsKayuBulat = 1
    ORDER BY IdGradeKB ASC
  `);

  return {
    jenis_kayu: jenisKayu.recordset,
    supplier: supplier.recordset,
    pengukuran: pengukuran.recordset,
    kendaraan: kendaraan.recordset,
    supplier_asal: supplier.recordset,
    grade: grade.recordset,
  };
};

exports.getAll = async ({ cari = "", status = "" }) => {
  const pool = await poolPromise;
  const req = pool.request();

  const where = ["1=1"];
  if (cari) {
    req.input("cari", sql.VarChar, `%${cari}%`);
    where.push(`
      (A.NoKayuBulat LIKE @cari OR A.NoPlat LIKE @cari OR A.NoTruk LIKE @cari OR
       A.Suket LIKE @cari OR D.Jenis LIKE @cari OR C.NmSupplier LIKE @cari OR
       GP.GolPengukuran LIKE @cari)
    `);
  }
  if (status === "aktif") {
    where.push("A.DateUsage IS NULL");
  } else if (status === "nonaktif") {
    where.push("A.DateUsage IS NOT NULL");
  }

  const result = await req.query(`
    SELECT
      A.NoKayuBulat AS no,
      CONVERT(varchar(19), A.DateCreate, 120) AS tanggal,
      D.Jenis AS jenis,
      C.NmSupplier AS supplier,
      GP.GolPengukuran AS gol_pengukuran,
      A.NoTruk AS no_truk,
      A.NoPlat AS no_plat,
      A.Suket AS suket,
      KG.Bruto AS bruto,
      T.NamaTanah AS nama_tanah,
      CASE WHEN A.DateUsage IS NULL THEN 1 ELSE 0 END AS is_aktif
    FROM KayuBulat_h A
    LEFT JOIN KayuBulatKG_h KG ON KG.NoKayuBulat = A.NoKayuBulat
    INNER JOIN MstSupplier C ON C.IdSupplier = A.IdSupplier
    INNER JOIN MstJenisKayu D ON D.IdJenisKayu = A.IdJenisKayu
    LEFT JOIN MstGolPengukuran GP ON GP.IdPengukuran = A.IdPengukuran
    LEFT JOIN MstSuratTanah T ON T.IdTanah = A.IdTanah
    WHERE ${where.join(" AND ")}
    ORDER BY A.NoKayuBulat DESC
  `);

  return result.recordset.map(r => ({
    no: r.no,
    tanggal: r.tanggal,
    jenis: r.jenis,
    supplier: r.supplier,
    gol_pengukuran: r.gol_pengukuran,
    no_truk: r.no_truk,
    no_plat: r.no_plat,
    suket: r.suket,
    bruto: r.bruto,
    nama_tanah: r.nama_tanah,
    is_aktif: !!r.is_aktif,
  }));
};

exports.getHeader = async (no) => {
  const pool = await poolPromise;
  const result = await pool.request()
    .input("NoKayuBulat", sql.VarChar, no)
    .query(`
      SELECT
        A.NoKayuBulat AS no,
        CONVERT(varchar(19), A.DateCreate, 120) AS tanggal,
        A.IdJenisKayu AS id_jenis_kayu,
        A.IdSupplier AS id_supplier,
        A.IdPengukuran AS id_pengukuran,
        A.IdJenisKendaraan AS id_kendaraan,
        A.IdSupplierAsalKayu AS id_supplier_asal,
        A.NoTruk AS no_truk,
        A.NoPlat AS no_plat,
        A.Suket AS suket,
        KG.Bruto AS bruto,
        KG.Tara AS tara,
        CONVERT(varchar(8), A.JamMasuk, 108) AS jam_masuk,
        CONVERT(varchar(8), A.JamSiapBongkar, 108) AS jam_siap_bongkar,
        CONVERT(varchar(10), A.TglSemprot, 120) AS tgl_semprot
      FROM KayuBulat_h A
      LEFT JOIN KayuBulatKG_h KG ON KG.NoKayuBulat = A.NoKayuBulat
      WHERE A.NoKayuBulat = @NoKayuBulat
    `);

  const r = result.recordset[0];
  if (!r) return null;

  return {
    no: r.no,
    tanggal: r.tanggal,
    id_jenis_kayu: r.id_jenis_kayu,
    id_supplier: r.id_supplier,
    id_pengukuran: r.id_pengukuran,
    id_kendaraan: r.id_kendaraan,
    id_supplier_asal: r.id_supplier_asal,
    no_truk: r.no_truk,
    no_plat: r.no_plat,
    suket: r.suket,
    bruto: r.bruto,
    tara: r.tara,
    jam_masuk: r.jam_masuk,
    jam_siap_bongkar: r.jam_siap_bongkar,
    tgl_semprot: r.tgl_semprot,
  };
};

exports.getDetail = async ({ no, mode = "TON" }) => {
  const pool = await poolPromise;

  if (mode === "KG") {
    const result = await pool.request()
      .input("NoKayuBulat", sql.VarChar, no)
      .query(`
        SELECT
          A.NoUrut AS no_urut,
          B.NamaGrade AS nama_grade,
          A.JmlhBatang AS jmlh_batang,
          A.Berat AS berat,
          A.Harga AS harga
        FROM KayuBulatKG_d A
        INNER JOIN MstGradeKB B ON B.IdGradeKB = A.IdGradeKB
        WHERE A.NoKayuBulat = @NoKayuBulat
        ORDER BY A.NoUrut ASC
      `);

    return result.recordset.map(r => ({
      no_urut: r.no_urut,
      nama_grade: r.nama_grade,
      jmlh_batang: r.jmlh_batang,
      berat: r.berat,
      harga: r.harga,
    }));
  }

  const result = await pool.request()
    .input("NoKayuBulat", sql.VarChar, no)
    .query(`
      SELECT
        NoLog AS no_log,
        Tebal AS tebal,
        Lebar AS lebar,
        Panjang AS panjang,
        Round((Tebal * Lebar * Panjang / 7200.8 * 10000) / 10000, 4, 1) AS ton,
        IsAfkir AS is_afkir,
        IsMC AS is_mc,
        IsMCMata AS is_mcmata,
        IsBangkang AS is_bangkang,
        Keterangan AS keterangan
      FROM KayuBulat_d
      WHERE NoKayuBulat = @NoKayuBulat
      ORDER BY NoLog ASC
    `);

  return result.recordset.map(r => ({
    no_log: r.no_log,
    tebal: r.tebal,
    lebar: r.lebar,
    panjang: r.panjang,
    ton: r.ton,
    is_afkir: !!r.is_afkir,
    is_mc: !!r.is_mc,
    is_mcmata: !!r.is_mcmata,
    is_bangkang: !!r.is_bangkang,
    keterangan: r.keterangan || "",
  }));
};

const headerInputs = (req, data) => {
  req.input("NoPlat", sql.VarChar, data.no_plat || null)
    .input("IdJenisKayu", sql.Int, data.id_jenis_kayu)
    .input("IdSupplier", sql.Int, data.id_supplier)
    .input("IdSupplierAsalKayu", sql.Int, data.id_supplier_asal || null)
    .input("IdPengukuran", sql.Int, data.id_pengukuran)
    .input("NoTruk", sql.Int, data.no_truk ? Number(data.no_truk) : null)
    .input("DateCreate", sql.DateTime, data.tanggal || null)
    .input("Suket", sql.VarChar, data.suket || null)
    .input("IdJenisKendaraan", sql.Int, data.id_kendaraan || null)
    .input("TglSemprot", sql.DateTime, data.tgl_semprot || null)
    .input("JamMasuk", sql.VarChar, data.jam_masuk || null)
    .input("JamSiapBongkar", sql.VarChar, data.jam_siap_bongkar || null);
};

const insertTonDetail = async (transaction, noKayuBulat, detail) => {
  for (const d of detail || []) {
    await transaction.request()
      .input("NoLog", sql.Int, d.no_log)
      .input("NoKayuBulat", sql.VarChar, noKayuBulat)
      .input("Tebal", sql.Decimal(18, 4), d.tebal)
      .input("Lebar", sql.Decimal(18, 4), d.lebar)
      .input("Panjang", sql.Decimal(18, 4), d.panjang)
      .input("IsAfkir", sql.Bit, !!d.is_afkir)
      .input("IsMC", sql.Bit, !!d.is_mc)
      .input("IsMCMata", sql.Bit, !!d.is_mcmata)
      .input("IsBangkang", sql.Bit, !!d.is_bangkang)
      .input("Ket", sql.NVarChar(45), d.keterangan || "")
      .query(`
        INSERT INTO KayuBulat_d (NoLog, NoKayuBulat, Tebal, Lebar, Panjang, IsAfkir, IsMC, IsMCMata, IsBangkang, Keterangan)
        VALUES (@NoLog, @NoKayuBulat, @Tebal, @Lebar, @Panjang, @IsAfkir, @IsMC, @IsMCMata, @IsBangkang, @Ket)
      `);
  }
};

const insertKgDetail = async (transaction, noKayuBulat, detail) => {
  for (const d of detail || []) {
    await transaction.request()
      .input("NoUrut", sql.Int, d.no_urut)
      .input("NoKayuBulat", sql.VarChar, noKayuBulat)
      .input("NamaGrade", sql.VarChar, d.nama_grade || "")
      .input("JmlhBatang", sql.Decimal(18, 2), d.jmlh_batang)
      .input("Berat", sql.Decimal(18, 2), d.berat)
      .input("Harga", sql.Decimal(18, 2), d.harga)
      .query(`
        INSERT INTO KayuBulatKG_d (NoKayuBulat, NoUrut, IdGradeKB, JmlhBatang, Berat, Harga)
        VALUES (@NoKayuBulat, @NoUrut,
                (SELECT IdGradeKB FROM MstGradeKB WHERE NamaGrade = @NamaGrade),
                @JmlhBatang, @Berat, @Harga)
      `);
  }
};

exports.create = async (data) => {
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const genResult = await transaction.request().query(`
      SELECT 'A.' + FORMAT(COALESCE(Right(Max(NoKayuBulat), 6), 0) + 1, '000000') AS NoKayuBulat
      FROM KayuBulat_h
    `);
    const noKayuBulat = genResult.recordset[0]?.NoKayuBulat || "A.000001";

    const req = transaction.request();
    headerInputs(req, data);
    await req.input("NoKayuBulat", sql.VarChar, noKayuBulat).query(`
      INSERT INTO KayuBulat_h
        (NoKayuBulat, NoPlat, IdJenisKayu, IdSupplier, IdSupplierAsalKayu,
         IdPengukuran, NoTruk, JenisTruk, DateCreate, Pengurangan, DateUsage,
         Suket, IdTanah, IdJenisKendaraan, TglSemprot, JamMasuk, JamSiapBongkar)
      VALUES
        (@NoKayuBulat, @NoPlat, @IdJenisKayu, @IdSupplier, @IdSupplierAsalKayu,
         @IdPengukuran, @NoTruk, NULL, @DateCreate, 0, NULL,
         @Suket, NULL, @IdJenisKendaraan, @TglSemprot, @JamMasuk, @JamSiapBongkar)
    `);

    if (data.mode === "KG") {
      const kgReq = transaction.request();
      await kgReq.input("NoKayuBulat", sql.VarChar, noKayuBulat)
        .input("Bruto", sql.Decimal(18, 2), data.bruto || 0)
        .input("Tara", sql.Decimal(18, 2), data.tara || 0)
        .query(`
          INSERT INTO KayuBulatKG_h (NoKayuBulat, Bruto, Tara)
          VALUES (@NoKayuBulat, @Bruto, @Tara)
        `);
      await insertKgDetail(transaction, noKayuBulat, data.detail);
    } else {
      await insertTonDetail(transaction, noKayuBulat, data.detail);
    }

    await transaction.commit();
    return noKayuBulat;
  } catch (err) {
    try { await transaction.rollback(); } catch (rbErr) { console.error('Rollback failed:', rbErr.message); }
    throw err;
  }
};

exports.update = async (data) => {
  const pool = await poolPromise;
  const noKayuBulat = data.no_kayu_bulat;
  if (!noKayuBulat) throw new Error("no_kayu_bulat wajib diisi");

  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const check = await transaction.request()
      .input("NoKayuBulat", sql.VarChar, noKayuBulat)
      .query(`SELECT NoKayuBulat, DateUsage FROM KayuBulat_h WHERE NoKayuBulat = @NoKayuBulat`);
    if (!check.recordset[0]) {
      await transaction.rollback();
      return false;
    }
    if (check.recordset[0].DateUsage && lockNonAktif()) {
      await transaction.rollback();
      throw new Error("Data sudah tidak aktif, tidak dapat diubah");
    }

    const req = transaction.request();
    headerInputs(req, data);
    await req.input("NoKayuBulat", sql.VarChar, noKayuBulat).query(`
      UPDATE KayuBulat_h
      SET NoPlat = @NoPlat,
          IdJenisKayu = @IdJenisKayu,
          IdSupplier = @IdSupplier,
          IdSupplierAsalKayu = @IdSupplierAsalKayu,
          IdPengukuran = @IdPengukuran,
          NoTruk = @NoTruk,
          DateCreate = @DateCreate,
          Suket = @Suket,
          IdJenisKendaraan = @IdJenisKendaraan,
          TglSemprot = @TglSemprot,
          JamMasuk = @JamMasuk,
          JamSiapBongkar = @JamSiapBongkar
      WHERE NoKayuBulat = @NoKayuBulat
    `);

    if (data.mode === "KG") {
      const kgReq = transaction.request();
      await kgReq.input("NoKayuBulat", sql.VarChar, noKayuBulat)
        .input("Bruto", sql.Decimal(18, 2), data.bruto || 0)
        .input("Tara", sql.Decimal(18, 2), data.tara || 0)
        .query(`
          IF EXISTS (SELECT 1 FROM KayuBulatKG_h WHERE NoKayuBulat = @NoKayuBulat)
            UPDATE KayuBulatKG_h SET Bruto = @Bruto, Tara = @Tara WHERE NoKayuBulat = @NoKayuBulat
          ELSE
            INSERT INTO KayuBulatKG_h (NoKayuBulat, Bruto, Tara)
            VALUES (@NoKayuBulat, @Bruto, @Tara)
        `);

      await transaction.request()
        .input("NoKayuBulat", sql.VarChar, noKayuBulat)
        .query(`DELETE FROM KayuBulatKG_d WHERE NoKayuBulat = @NoKayuBulat`);
      await insertKgDetail(transaction, noKayuBulat, data.detail);
    } else {
      await transaction.request()
        .input("NoKayuBulat", sql.VarChar, noKayuBulat)
        .query(`DELETE FROM KayuBulat_d WHERE NoKayuBulat = @NoKayuBulat`);
      await insertTonDetail(transaction, noKayuBulat, data.detail);
    }

    await transaction.commit();
    return true;
  } catch (err) {
    try { await transaction.rollback(); } catch (rbErr) { console.error('Rollback failed:', rbErr.message); }
    throw err;
  }
};

exports.remove = async (no) => {
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const check = await transaction.request()
      .input("NoKayuBulat", sql.VarChar, no)
      .query(`SELECT NoKayuBulat, DateUsage FROM KayuBulat_h WHERE NoKayuBulat = @NoKayuBulat`);
    if (!check.recordset[0]) {
      await transaction.rollback();
      return false;
    }
    if (check.recordset[0].DateUsage && lockNonAktif()) {
      await transaction.rollback();
      throw new Error("Data sudah tidak aktif, tidak dapat dihapus");
    }

    await transaction.request()
      .input("NoKayuBulat", sql.VarChar, no)
      .query(`DELETE FROM KayuBulatKG_d WHERE NoKayuBulat = @NoKayuBulat`);
    await transaction.request()
      .input("NoKayuBulat", sql.VarChar, no)
      .query(`DELETE FROM KayuBulatKG_h WHERE NoKayuBulat = @NoKayuBulat`);
    await transaction.request()
      .input("NoKayuBulat", sql.VarChar, no)
      .query(`DELETE FROM KayuBulat_d WHERE NoKayuBulat = @NoKayuBulat`);
    await transaction.request()
      .input("NoKayuBulat", sql.VarChar, no)
      .query(`DELETE FROM KayuBulat_h WHERE NoKayuBulat = @NoKayuBulat`);

    await transaction.commit();
    return true;
  } catch (err) {
    try { await transaction.rollback(); } catch (rbErr) { console.error('Rollback failed:', rbErr.message); }
    throw err;
  }
};
