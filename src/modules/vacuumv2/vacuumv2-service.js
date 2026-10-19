const { sql, poolPromise } = require('../../core/config/db');

// Cek kunci periode (bulanan dari MstTutupTransaksi + harian dari MstTutupTransaksiHarian)
async function cekPeriodeTerbuka(transaction, tanggal) {
  if (!tanggal) return true;
  const t = new Date(tanggal);
  if (Number.isNaN(t.getTime())) return true;

  const req = transaction ? transaction.request() : (await poolPromise).request();
  req.input("month", sql.Int, t.getMonth() + 1);
  req.input("year", sql.Int, t.getFullYear());

  const bulanan = await req.query(`
    SELECT COUNT(*) AS jml FROM MstTutupTransaksi
    WHERE Month(Period) = @month AND Year(Period) = @year AND Lock = 1
  `);
  if (Number(bulanan.recordset[0].jml) > 0) return false;

  const harian = await req.query(`
    SELECT Max(PeriodHarian) AS PeriodHarian FROM MstTutupTransaksiHarian WHERE Lock = 1
  `);
  const lockHarian = harian.recordset[0]?.PeriodHarian;
  if (lockHarian) {
    const lockDate = new Date(lockHarian);
    const pickerDate = new Date(t.getFullYear(), t.getMonth(), t.getDate());
    const lockOnlyDate = new Date(lockDate.getFullYear(), lockDate.getMonth(), lockDate.getDate());
    if (pickerDate <= lockOnlyDate) return false;
  }

  return true;
}

// Generate NoVacuumV2 : 'LA.' + 6 digit
async function generateNo(transaction) {
  const req = transaction.request();
  const result = await req.query(`
    SELECT 'LA.' + FORMAT(COALESCE(Right(Max(NoVacuumV2), 6), 0) + 1, '000000') AS NoVacuumV2
    FROM VacuumV2_h
  `);
  return result.recordset[0]?.NoVacuumV2 || "LA.000001";
}

// Helper cek-permission ubah/hapus (group 27, sama seperti form legacy)
async function bisaUbahHapus(username) {
  if (!username) return false;
  const pool = await poolPromise;
  const result = await pool.request()
    .input("Username", sql.VarChar, username)
    .query(`
      SELECT B.IdUGroup FROM MstUsername A
      INNER JOIN MstUserGroupMember B ON B.IdUsername = A.IdUsername
      WHERE A.Username = @Username AND B.IdUGroup = 27
    `);
  return result.recordset.length > 0;
}

// Master data untuk isi combo (tangki chemical, tabung vacuum, jenis kayu) + permission
exports.getMasters = async (username) => {
  const pool = await poolPromise;

  const chemical = await pool.request().query(`
    SELECT IdChemicalTank AS id_chemical_tank
    FROM MstChemicalTank_h
    WHERE [Enable] = 1
    ORDER BY IdChemicalTank ASC
  `);

  const vacuumTube = await pool.request().query(`
    SELECT IdVacuumTube AS id_vacuum_tube
    FROM MstVacuumTube
    WHERE [Enable] = 1
    ORDER BY IdVacuumTube ASC
  `);

  const jenisKayu = await pool.request().query(`
    SELECT IdJenisKayu AS id_jenis_kayu, Jenis AS jenis
    FROM MstJenisKayu
    WHERE [Enable] = 1
    ORDER BY Jenis ASC
  `);

  // Jenis kayu per tangki (form legacy menampilkannya saat tangki dipilih)
  const tankJenis = await pool.request().query(`
    SELECT A.IdChemicalTank AS id_chemical_tank, B.IdJenisKayu AS id_jenis_kayu, B.Jenis AS jenis
    FROM MstChemicalTank_d A
    INNER JOIN MstJenisKayu B ON B.IdJenisKayu = A.IdJenis
    ORDER BY B.Jenis ASC
  `);
  const chemicalWithJenis = chemical.recordset.map(c => ({
    ...c,
    jenis_kayu: tankJenis.recordset
      .filter(j => j.id_chemical_tank === c.id_chemical_tank)
      .map(j => ({ id_jenis_kayu: j.id_jenis_kayu, jenis: j.jenis })),
  }));

  return {
    chemical: chemicalWithJenis,
    vacuum_tube: vacuumTube.recordset,
    jenis_kayu: jenisKayu.recordset,
    boleh_ubah_hapus: await bisaUbahHapus(username),
  };
};

// Daftar header (list)
exports.getAll = async ({ cari = "" } = {}) => {
  const pool = await poolPromise;
  const req = pool.request();

  const where = ["1=1"];
  if (cari) {
    req.input("cari", sql.VarChar, `%${cari}%`);
    where.push("(A.NoVacuumV2 LIKE @cari OR A.Keterangan LIKE @cari)");
  }

  const result = await req.query(`
    SELECT
      A.NoVacuumV2 AS no,
      CONVERT(varchar(19), A.Tanggal, 120) AS tanggal,
      A.Keterangan AS keterangan
    FROM VacuumV2_h A
    WHERE ${where.join(" AND ")}
    ORDER BY A.NoVacuumV2 DESC
  `);

  return result.recordset.map(r => ({
    no: r.no,
    tanggal: r.tanggal,
    keterangan: r.keterangan || "",
  }));
};

exports.getHeader = async (no) => {
  const pool = await poolPromise;
  const result = await pool.request()
    .input("No_VacuumV2", sql.VarChar, no)
    .query(`
      SELECT
        A.NoVacuumV2 AS no,
        CONVERT(varchar(19), A.Tanggal, 120) AS tanggal,
        A.Keterangan AS keterangan
      FROM VacuumV2_h A
      WHERE A.NoVacuumV2 = @No_VacuumV2
    `);

  const r = result.recordset[0];
  if (!r) return null;

  return {
    no: r.no,
    tanggal: r.tanggal,
    keterangan: r.keterangan || "",
  };
};

exports.getDetail = async (no) => {
  const pool = await poolPromise;

  //==========================================================
  // CHEMICAL
  //==========================================================
  const chemical = await pool.request()
    .input("No_VacuumV2", sql.VarChar, no)
    .query(`
      SELECT
        A.NoRefill,

        CASE
          WHEN A.Jam IS NULL THEN ''
          ELSE LEFT(CONVERT(varchar(8), A.Jam, 108), 5)
        END AS Jam,

        A.IdChemicalTank,

        STUFF((
          SELECT ',' + C.Jenis
          FROM MstChemicalTank_d B
          INNER JOIN MstJenisKayu C
            ON B.IdJenis = C.IdJenisKayu
          WHERE B.IdChemicalTank = A.IdChemicalTank
          FOR XML PATH('')
        ), 1, 1, '') AS jenis,

        A.Borax,
        A.Boric,
        A.Parachem,
        A.Kaporit,
        A.TinggiAwalAir,
        A.TinggiAkhirAir

      FROM VacuumV2_dChemical A
      WHERE A.NoVacuumV2 = @No_VacuumV2
      ORDER BY A.NoRefill
    `);

  //==========================================================
  // OPERATION
  //==========================================================
  const operation = await pool.request()
    .input("No_VacuumV2", sql.VarChar, no)
    .query(`
      SELECT
        A.NoCharge,
        A.Shift,
        A.IdChemicalTank,
        A.IdVacuumTube,
        A.PanjangKayu,
        A.JumlahBundle,

        CASE
          WHEN A.StartVacuum1 IS NULL THEN ''
          ELSE LEFT(CONVERT(varchar(8), A.StartVacuum1, 108), 5)
        END AS StartVacuum1,

        CASE
          WHEN A.StartPress1 IS NULL THEN ''
          ELSE LEFT(CONVERT(varchar(8), A.StartPress1, 108), 5)
        END AS StartPress1,

        CASE
          WHEN A.StartPress2 IS NULL THEN ''
          ELSE LEFT(CONVERT(varchar(8), A.StartPress2, 108), 5)
        END AS StartPress2,

        CASE
          WHEN A.StartReturnTank IS NULL THEN ''
          ELSE LEFT(CONVERT(varchar(8), A.StartReturnTank, 108), 5)
        END AS StartReturnTank,

        CASE
          WHEN A.StartVacuum2 IS NULL THEN ''
          ELSE LEFT(CONVERT(varchar(8), A.StartVacuum2, 108), 5)
        END AS StartVacuum2,

        CASE
          WHEN A.StartWait IS NULL THEN ''
          ELSE LEFT(CONVERT(varchar(8), A.StartWait, 108), 5)
        END AS StartWait,

        CASE
          WHEN A.StartOpenTube IS NULL THEN ''
          ELSE LEFT(CONVERT(varchar(8), A.StartOpenTube, 108), 5)
        END AS StartOpenTube,

        A.TinggiAwalAir,
        A.TinggiAkhirAir,

        (A.TinggiAkhirAir * C.Lebar * C.Panjang) / 1000 AS air_ltr,

        B.Jenis

      FROM VacuumV2_dOperation A

      LEFT JOIN MstJenisKayu B
        ON B.IdJenisKayu = A.IdJenisKayu

      LEFT JOIN MstChemicalTank_h C
        ON C.IdChemicalTank = A.IdChemicalTank

      WHERE A.NoVacuumV2 = @No_VacuumV2
      ORDER BY A.NoCharge
    `);

  //==========================================================
  // OPERATION JENIS
  //==========================================================
  const operationJenis = await pool.request()
    .input("No_VacuumV2", sql.VarChar, no)
    .query(`
      SELECT
        A.NoCharge,
        A.IdJenis,
        B.Jenis

      FROM VacuumV2_dOperation_dJenis A

      INNER JOIN MstJenisKayu B
        ON B.IdJenisKayu = A.IdJenis

      WHERE A.NoVacuumV2 = @No_VacuumV2
      ORDER BY A.NoCharge
    `);

  //==========================================================
  // RESPONSE
  //==========================================================
  return {
    chemical: chemical.recordset.map(r => ({
      no_refill: r.NoRefill,
      jam: r.Jam || "",
      id_chemical_tank: r.IdChemicalTank,
      jenis: r.jenis || "",
      borax: r.Borax,
      boric: r.Boric,
      parachem: r.Parachem,
      kaporit: r.Kaporit,
      tinggi_awal_air: r.TinggiAwalAir,
      tinggi_akhir_air: r.TinggiAkhirAir,
    })),

    operation: operation.recordset.map(r => ({
      no_charge: r.NoCharge,
      shift: r.Shift,
      id_chemical_tank: r.IdChemicalTank,
      id_vacuum_tube: r.IdVacuumTube,
      panjang_kayu: r.PanjangKayu,
      jumlah_bundle: r.JumlahBundle,

      start_vacuum1: r.StartVacuum1 || "",
      start_press1: r.StartPress1 || "",
      start_press2: r.StartPress2 || "",
      start_return_tank: r.StartReturnTank || "",
      start_vacuum2: r.StartVacuum2 || "",
      start_wait: r.StartWait || "",
      start_open_tube: r.StartOpenTube || "",

      tinggi_awal_air: r.TinggiAwalAir,
      tinggi_akhir_air: r.TinggiAkhirAir,
      air_ltr: r.air_ltr,
      jenis: r.Jenis || "",
    })),

    operation_jenis: operationJenis.recordset.map(r => ({
      no_charge: r.NoCharge,
      id_jenis: r.IdJenis,
      jenis: r.Jenis,
    })),
  };
};

const insertChemical = async (transaction, no, list) => {
  for (const d of list || []) {
    if (d.no_refill === undefined || d.no_refill === null) continue;
    const r = transaction.request();
    r.input("NoVacuumV2", sql.VarChar, no)
      .input("NoRefill", sql.VarChar, String(d.no_refill))
      .input("Jam", sql.VarChar, d.jam || null)
      .input("IdChemicalTank", sql.VarChar, d.id_chemical_tank || null)
      .input("Borax", sql.VarChar, d.borax != null ? String(d.borax) : "")
      .input("Boric", sql.VarChar, d.boric != null ? String(d.boric) : "")
      .input("Parachem", sql.VarChar, d.parachem != null ? String(d.parachem) : "")
      .input("Kaporit", sql.VarChar, d.kaporit != null ? String(d.kaporit) : "")
      .input("TinggiAwalAir", sql.VarChar, d.tinggi_awal_air != null ? String(d.tinggi_awal_air) : "")
      .input("TinggiAkhirAir", sql.VarChar, d.tinggi_akhir_air != null ? String(d.tinggi_akhir_air) : "");
    await r.query(`
      INSERT INTO VacuumV2_dChemical
        (NoVacuumV2, NoRefill, Jam, IdChemicalTank, Borax, Boric, Parachem, Kaporit, TinggiAwalAir, TinggiAkhirAir)
      VALUES
        (@NoVacuumV2, @NoRefill, @Jam, @IdChemicalTank, @Borax, @Boric, @Parachem, @Kaporit, @TinggiAwalAir, @TinggiAkhirAir)
    `);
  }
};

const insertOperation = async (transaction, no, list) => {
  for (const d of list || []) {
    if (d.no_charge === undefined || d.no_charge === null) continue;
    const r = transaction.request();
    r.input("NoVacuumV2", sql.VarChar, no)
      .input("NoCharge", sql.VarChar, String(d.no_charge))
      .input("Shift", sql.VarChar, d.shift || null)
      .input("IdChemicalTank", sql.VarChar, d.id_chemical_tank || null)
      .input("IdVacuumTube", sql.VarChar, d.id_vacuum_tube || null)
      .input("PanjangKayu", sql.VarChar, d.panjang_kayu != null ? String(d.panjang_kayu) : "")
      .input("JumlahBundle", sql.VarChar, d.jumlah_bundle != null ? String(d.jumlah_bundle) : "")
      .input("StartVacuum1", sql.VarChar, d.start_vacuum1 || null)
      .input("StartPress1", sql.VarChar, d.start_press1 || null)
      .input("StartPress2", sql.VarChar, d.start_press2 || null)
      .input("StartReturnTank", sql.VarChar, d.start_return_tank || null)
      .input("StartVacuum2", sql.VarChar, d.start_vacuum2 || null)
      .input("StartWait", sql.VarChar, d.start_wait || null)
      .input("StartOpenTube", sql.VarChar, d.start_open_tube || null)
      .input("TinggiAwalAir", sql.VarChar, d.tinggi_awal_air != null ? String(d.tinggi_awal_air) : "")
      .input("TinggiAkhirAir", sql.VarChar, d.tinggi_akhir_air != null ? String(d.tinggi_akhir_air) : "")
      .input("IdJenisKayu", sql.Int, d.id_jenis_kayu || null)
      .input("Jenis", sql.VarChar, d.jenis || null);

    await r.query(`
      INSERT INTO VacuumV2_dOperation
        (NoVacuumV2, NoCharge, Shift, IdChemicalTank, IdVacuumTube, PanjangKayu, JumlahBundle,
         StartVacuum1, StartPress1, StartPress2, StartReturnTank, StartVacuum2, StartWait, StartOpenTube,
         TinggiAwalAir, TinggiAkhirAir, IdJenisKayu)
      VALUES
        (@NoVacuumV2, @NoCharge, @Shift, @IdChemicalTank, @IdVacuumTube, @PanjangKayu, @JumlahBundle,
         @StartVacuum1, @StartPress1, @StartPress2, @StartReturnTank, @StartVacuum2, @StartWait, @StartOpenTube,
         @TinggiAwalAir, @TinggiAkhirAir,
         COALESCE(@IdJenisKayu, (SELECT IdJenisKayu FROM MstJenisKayu WHERE Jenis = @Jenis AND [Enable] = 1)))
    `);

    // Web mengirim id_jenis_list (banyak jenis per charge); legacy VB hanya mengirim nama jenis tunggal.
    if (Array.isArray(d.id_jenis_list) && d.id_jenis_list.length > 0) {
      for (const idJenis of [...new Set(d.id_jenis_list.map(Number))]) {
        await transaction.request()
          .input("NoVacuumV2", sql.VarChar, no)
          .input("NoCharge", sql.VarChar, String(d.no_charge))
          .input("IdJenis", sql.Int, idJenis)
          .query(`
            INSERT INTO VacuumV2_dOperation_dJenis (NoVacuumV2, NoCharge, IdJenis)
            VALUES (@NoVacuumV2, @NoCharge, @IdJenis)
          `);
      }
      continue;
    }

    const jenisReq = transaction.request();
    jenisReq.input("NoVacuumV2", sql.VarChar, no)
      .input("NoCharge", sql.VarChar, String(d.no_charge))
      .input("Jenis", sql.VarChar, d.jenis || null);
    await jenisReq.query(`
      INSERT INTO VacuumV2_dOperation_dJenis (NoVacuumV2, NoCharge, IdJenis)
      SELECT @NoVacuumV2, @NoCharge, IdJenisKayu
      FROM MstJenisKayu WHERE Jenis = @Jenis AND [Enable] = 1
      AND NOT EXISTS (SELECT 1 FROM VacuumV2_dOperation_dJenis X
        WHERE X.NoVacuumV2 = @NoVacuumV2 AND X.NoCharge = @NoCharge
        AND X.IdJenis = MstJenisKayu.IdJenisKayu)
    `);
  }
};

exports.create = async (data) => {
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const no = await generateNo(transaction);

    if (!(await cekPeriodeTerbuka(transaction, data.tanggal))) {
      await transaction.rollback();
      throw new Error("Maaf, Periode ini sudah terkunci");
    }

    await transaction.request()
      .input("NoVacuumV2", sql.VarChar, no)
      .input("Tanggal", sql.DateTime, data.tanggal || null)
      .input("Keterangan", sql.VarChar, data.keterangan || "")
      .query(`
        INSERT INTO VacuumV2_h (NoVacuumV2, Tanggal, Keterangan)
        VALUES (@NoVacuumV2, @Tanggal, @Keterangan)
      `);

    await insertChemical(transaction, no, data.chemical);
    await insertOperation(transaction, no, data.operation);

    if (data.nip) {
      await transaction.request()
        .input("Nip", sql.VarChar, data.nip)
        .input("NoVacuumV2", sql.VarChar, no)
        .query(`
          INSERT INTO Riwayat ([Nip], [Tgl], [Aktivitas])
          VALUES (@Nip, GETDATE(), 'Mengisi Data ' + @NoVacuumV2 + ' Pada Vacuum 2')
        `);
    }

    await transaction.commit();
    return no;
  } catch (err) {
    try { await transaction.rollback(); } catch (rbErr) { console.error("Rollback failed:", rbErr.message); }
    throw err;
  }
};

exports.update = async (data) => {
  const pool = await poolPromise;
  const no = data.no;
  if (!no) throw new Error("no wajib diisi");

  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const check = await transaction.request()
      .input("No_VacuumV2", sql.VarChar, no)
      .query(`SELECT NoVacuumV2, Tanggal FROM VacuumV2_h WHERE NoVacuumV2 = @No_VacuumV2`);
    if (!check.recordset[0]) {
      await transaction.rollback();
      return false;
    }

    if (!(await cekPeriodeTerbuka(transaction, data.tanggal || check.recordset[0].Tanggal))) {
      await transaction.rollback();
      throw new Error("Maaf, Periode ini sudah terkunci");
    }

    await transaction.request()
      .input("No_VacuumV2", sql.VarChar, no)
      .input("Tanggal", sql.DateTime, data.tanggal || check.recordset[0].Tanggal)
      .input("Keterangan", sql.VarChar, data.keterangan || "")
      .query(`
        UPDATE VacuumV2_h SET Tanggal = @Tanggal, Keterangan = @Keterangan
        WHERE NoVacuumV2 = @No_VacuumV2
      `);

    await transaction.request()
      .input("No_VacuumV2", sql.VarChar, no)
      .query(`DELETE FROM VacuumV2_dOperation_dJenis WHERE NoVacuumV2 = @No_VacuumV2`);
    await transaction.request()
      .input("No_VacuumV2", sql.VarChar, no)
      .query(`DELETE FROM VacuumV2_dOperation WHERE NoVacuumV2 = @No_VacuumV2`);
    await transaction.request()
      .input("No_VacuumV2", sql.VarChar, no)
      .query(`DELETE FROM VacuumV2_dChemical WHERE NoVacuumV2 = @No_VacuumV2`);

    await insertChemical(transaction, no, data.chemical);
    await insertOperation(transaction, no, data.operation);

    if (data.nip) {
      await transaction.request()
        .input("Nip", sql.VarChar, data.nip)
        .input("NoVacuumV2", sql.VarChar, no)
        .query(`
          INSERT INTO Riwayat ([Nip], [Tgl], [Aktivitas])
          VALUES (@Nip, GETDATE(), 'Mengubah Data ' + @NoVacuumV2 + ' Pada Vacuum 2')
        `);
    }

    await transaction.commit();
    return true;
  } catch (err) {
    try { await transaction.rollback(); } catch (rbErr) { console.error("Rollback failed:", rbErr.message); }
    throw err;
  }
};

exports.remove = async (no, nip) => {
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const check = await transaction.request()
      .input("No_VacuumV2", sql.VarChar, no)
      .query(`SELECT NoVacuumV2 FROM VacuumV2_h WHERE NoVacuumV2 = @No_VacuumV2`);
    if (!check.recordset[0]) {
      await transaction.rollback();
      return false;
    }

    await transaction.request()
      .input("No_VacuumV2", sql.VarChar, no)
      .query(`DELETE FROM VacuumV2_dOperation_dJenis WHERE NoVacuumV2 = @No_VacuumV2`);
    await transaction.request()
      .input("No_VacuumV2", sql.VarChar, no)
      .query(`DELETE FROM VacuumV2_dOperation WHERE NoVacuumV2 = @No_VacuumV2`);
    await transaction.request()
      .input("No_VacuumV2", sql.VarChar, no)
      .query(`DELETE FROM VacuumV2_dChemical WHERE NoVacuumV2 = @No_VacuumV2`);
    await transaction.request()
      .input("No_VacuumV2", sql.VarChar, no)
      .query(`DELETE FROM VacuumV2_h WHERE NoVacuumV2 = @No_VacuumV2`);

    if (nip) {
      await transaction.request()
        .input("Nip", sql.VarChar, nip)
        .input("NoVacuumV2", sql.VarChar, no)
        .query(`
          INSERT INTO Riwayat ([Nip], [Tgl], [Aktivitas])
          VALUES (@Nip, GETDATE(), @Nip + ' Menghapus Data VacuumV2 ' + @NoVacuumV2)
        `);
    }

    await transaction.commit();
    return true;
  } catch (err) {
    try { await transaction.rollback(); } catch (rbErr) { console.error("Rollback failed:", rbErr.message); }
    throw err;
  }
};