const { sql, poolPromise } = require("../../core/config/db");

const toInt = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
};

const toFloat = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

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

// Generate NoSTSawmill : 'D.' + 6 digit
async function generateNoSTSawmill(transaction) {
  const req = transaction.request();
  const result = await req.query(`
    SELECT 'D.' + FORMAT(COALESCE(Right(Max(NoSTSawmill), 6), 0) + 1, '000000') AS NoSTSawmill
    FROM STSawmill_h
  `);
  return result.recordset[0]?.NoSTSawmill || "D.000001";
}

// Konversi "HH:mm" atau "HH:mm:ss" ke menit sejak tengah malam (0-1439)
function toMinutes(v) {
  if (v === null || v === undefined || v === "") return null;
  const parts = String(v).split(":");
  if (parts.length < 2) return null;
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

// Cek tabrakan jam produksi pada meja & tanggal yang sama.
// excludeNo dipakai saat update agar produksi itu sendiri tidak dihitung.
async function cekOverlapProduksi(transaction, noMeja, tglDate, hourStart, hourEnd, excludeNo) {
  if (noMeja == null) return null;
  const start = toMinutes(hourStart);
  const end = toMinutes(hourEnd);
  if (start === null && end === null) return null;
  if (start !== null && end !== null && start === end) {
    return "Hour Start dan Hour End tidak boleh sama";
  }

  const req = transaction.request();
  req.input("noMeja", sql.Int, toInt(noMeja));
  req.input("tgl", sql.Date, tglDate);
  if (excludeNo) req.input("excludeNo", sql.VarChar, excludeNo);

  const rows = await req.query(`
    SELECT HourStart, HourEnd
    FROM STSawmill_h
    WHERE NoMeja = @noMeja AND TglSawmill = @tgl
      ${excludeNo ? "AND NoSTSawmill <> @excludeNo" : ""}
      AND HourStart IS NOT NULL AND HourEnd IS NOT NULL
  `);

  // Overlap berlaku bila interval saling beririsan:
  // existing.start < new.end   AND   new.start < existing.end
  for (const r of rows.recordset) {
    const es = toMinutes(r.HourStart);
    const ee = toMinutes(r.HourEnd);
    if (es === null || ee === null) continue;

    if (start !== null && end !== null) {
      if (es < end && start < ee) {
        return `Hour ${formatJam(hourStart)} - ${formatJam(hourEnd)} bertabrakan dengan produksi ${formatJam(r.HourStart)} - ${formatJam(r.HourEnd)} di meja ini`;
      }
      continue;
    }

    // Hanya sisi start yang diisi: produksi dianggap berjalan sampai tak hingga.
    // Bertabrakan bila interval existing berakhir setelah start baru.
    if (start !== null && end === null) {
      if (ee > start) return "Hour Start bertabrakan dengan produksi lain di meja ini";
      continue;
    }

    // Hanya sisi end yang diisi: produksi dianggap dimulai sejak awal hari.
    // Bertabrakan bila interval existing dimulai sebelum end baru.
    if (start === null && end !== null) {
      if (es < end) return "Hour End bertabrakan dengan produksi lain di meja ini";
    }
  }
  return null;
}

function formatJam(v) {
  return v === null || v === undefined || v === "" ? "?" : String(v);
}

// Ambil stok RAMBUNG (KG) per IdGradeKB
async function ambilStokKG(transaction, noKayuBulat) {
  const pool = await poolPromise;
  const req = transaction ? transaction.request() : pool.request();
  req.input("noKayuBulat", sql.VarChar, noKayuBulat);
  const result = await req.query(`
    SELECT A.NoKayuBulat, A.IdGradeKB,
      A.StokTersedia - (CASE WHEN B.Pcs IS NULL THEN 0 ELSE B.Pcs END) AS StokTersedia
    FROM (
      SELECT NoKayuBulat, IdGradeKB,
        SUM(SUM(JmlhBatang)) OVER() AS StokALL,
        SUM(JmlhBatang) AS StokTersedia
      FROM KayuBulatKG_d
      WHERE NoKayuBulat = @noKayuBulat
      GROUP BY NoKayuBulat, IdGradeKB
    ) A
    LEFT JOIN (
      SELECT B.NoKayuBulat, IdGradeKB, SUM(Pcs) AS Pcs
      FROM STSawmill_dBalokGantungKG A
      INNER JOIN STSawmill_h B ON B.NoSTSawmill = A.NoSTSawmill
      GROUP BY B.NoKayuBulat, IdGradeKB
    ) B ON B.NoKayuBulat = A.NoKayuBulat AND B.IdGradeKB = A.IdGradeKB
    ORDER BY (CAST(A.StokTersedia AS DECIMAL(10,2)) / NULLIF(A.StokALL, 0) * 100) DESC
  `);

  const stok = new Map();
  for (const r of result.recordset) {
    stok.set(String(r.IdGradeKB), Math.trunc(r.StokTersedia));
  }
  return stok;
}

// Ambil stok non-RAMBUNG per Jenis (grade string)
async function ambilStokTon(transaction, noKayuBulat) {
  const pool = await poolPromise;
  const req = transaction ? transaction.request() : pool.request();
  req.input("noKayuBulat", sql.VarChar, noKayuBulat);
  const result = await req.query(`
    SELECT A.NoKayuBulat, A.Jenis AS Grade,
      A.StokTersedia - (CASE WHEN B.Pcs IS NULL THEN 0 ELSE B.Pcs END) AS StokTersedia
    FROM (
      SELECT A.NoKayuBulat,
        SUM(COUNT(A.NoKayuBulat)) OVER() AS StokALL,
        COUNT(A.NoKayuBulat) AS StokTersedia,
        Jenis
      FROM (
        SELECT A.NoKayuBulat,
          CASE
            WHEN A.IdPengukuran = '2' THEN
              CASE
                WHEN C.IsAfkir = 0 AND C.IsMC = 0 AND C.IsMCMata = 0 AND C.IsBangkang = 1 THEN 'STD BKG'
                WHEN C.IsAfkir = 0 AND C.IsMC = 1 AND C.IsMCMata = 0 AND C.IsBangkang = 1 THEN 'MC BKG'
                WHEN C.IsAfkir = 0 AND C.IsMC = 0 AND C.IsMCMata = 1 AND IsBangkang = 0 THEN 'MC MATA'
                WHEN C.IsAfkir = 0 AND C.IsMC = 1 AND C.IsMCMata = 0 AND C.IsBangkang = 0 THEN 'MC'
                WHEN C.IsAfkir = 1 AND C.IsMC = 0 AND C.IsMCMata = 0 AND C.IsBangkang = 0 THEN 'AFKIR'
                ELSE
                  CASE WHEN C.Tebal * C.Lebar >= 9 THEN 'STD' ELSE 'AFKIR' END
              END
            WHEN A.IdPengukuran = '10' THEN
              CASE
                WHEN C.IsAfkir = 0 AND C.IsMC = 0 AND C.IsMCMata = 1 AND IsBangkang = 0 THEN 'MC MATA'
                WHEN C.IsAfkir = 0 AND C.IsMC = 1 AND C.IsMCMata = 0 AND IsBangkang = 0 THEN 'MC'
                WHEN C.IsAfkir = 1 AND C.IsMC = 0 AND C.IsMCMata = 0 AND IsBangkang = 0 THEN 'AFKIR'
                ELSE
                  CASE
                    WHEN C.Tebal * C.Lebar >= 25 THEN 'STD'
                    WHEN C.Tebal * C.Lebar >= 9 AND C.Tebal * C.Lebar <= 24 THEN 'MC'
                    ELSE 'AFKIR'
                  END
              END
            WHEN A.IdPengukuran = '11' THEN
              CASE
                WHEN C.IsAfkir = 0 AND C.IsMC = 0 AND C.IsMCMata = 1 AND IsBangkang = 0 THEN 'MC MATA'
                WHEN C.IsAfkir = 0 AND C.IsMC = 1 AND C.IsMCMata = 0 AND IsBangkang = 0 THEN 'MC'
                WHEN C.IsAfkir = 0 AND C.IsMC = 0 AND C.IsMCMata = 0 AND IsBangkang = 1 THEN 'BKG'
                WHEN C.IsAfkir = 1 AND C.IsMC = 0 AND C.IsMCMata = 0 AND IsBangkang = 0 THEN 'AFKIR'
                ELSE
                  CASE WHEN C.Tebal * C.Lebar >= 16 THEN 'STD' ELSE 'AFKIR' END
              END
            ELSE
              CASE
                WHEN C.IsAfkir = 0 AND C.IsMC = 0 AND C.IsMCMata = 1 AND IsBangkang = 0 THEN 'MC MATA'
                WHEN C.IsAfkir = 0 AND C.IsMC = 1 AND C.IsMCMata = 0 AND IsBangkang = 0 THEN 'MC'
                WHEN C.IsAfkir = 1 AND C.IsMC = 0 AND C.IsMCMata = 0 AND IsBangkang = 0 THEN 'AFKIR'
                ELSE 'STD'
              END
          END AS Jenis
        FROM KayuBulat_h A
        INNER JOIN KayuBulat_d C ON C.NoKayuBulat = A.NoKayuBulat
        WHERE A.NoKayuBulat = @noKayuBulat
      ) A
      GROUP BY A.NoKayuBulat, A.Jenis
    ) A
    LEFT JOIN (
      SELECT B.NoKayuBulat, Grade, SUM(Pcs) AS Pcs
      FROM STSawmill_dBalokGantung A
      INNER JOIN STSawmill_h B ON B.NoSTSawmill = A.NoSTSawmill
      GROUP BY B.NoKayuBulat, Grade
    ) B ON B.NoKayuBulat = A.NoKayuBulat AND B.Grade = A.Jenis
    ORDER BY (CAST(A.StokTersedia AS DECIMAL(10,2)) / NULLIF(A.StokALL, 0) * 100) DESC
  `);

  const stok = new Map();
  for (const r of result.recordset) {
    stok.set(String(r.Grade), Math.trunc(r.StokTersedia));
  }
  return stok;
}

// Alokasi stok dari dictionary secara greedy (urutan yang sudah di-sort oleh query)
function alokasikanStok(totalInput, stok) {
  const alokasi = new Map();
  let sisa = totalInput;
  for (const [key, nilai] of stok) {
    if (sisa > nilai) {
      alokasi.set(key, nilai);
      sisa -= nilai;
    } else {
      alokasi.set(key, sisa);
      sisa = 0;
      break;
    }
  }
  return alokasi;
}

exports.getMasters = async () => {
  const pool = await poolPromise;

  const run = async (query, name) => {
    const r = await pool.request().query(query);
    return r.recordset.map((row) => ({ ...row }));
  };

  const mejaRaw = await pool.request().query(`
    SELECT NoMeja, NamaMeja, IdGroupMesinSawmill
    FROM MstMesinSawmill
    WHERE Enable = 1
    ORDER BY NamaMeja ASC
  `);

  const today = new Date();
  const tglStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const mejaStatus = await pool.request()
    .input("tgl", sql.Date, tglStr)
    .query(`
      SELECT
        m.NoMeja,
        CASE WHEN P.NoSTSawmill IS NULL THEN 0 ELSE 1 END AS isBerjalan,
        ISNULL(P.NoSTSawmill, '') AS lastNo,
        CONVERT(varchar(5), P.HourStart, 108) AS lastHourStart,
        CONVERT(varchar(5), P.HourEnd, 108) AS lastHourEnd
      FROM MstMesinSawmill m
      OUTER APPLY (
        SELECT TOP 1 s.NoSTSawmill, s.HourStart, s.HourEnd
        FROM STSawmill_h s
        WHERE s.NoMeja = m.NoMeja AND s.TglSawmill = @tgl
        ORDER BY s.NoSTSawmill DESC
      ) P
      WHERE m.Enable = 1
    `);

  const statusMap = new Map(mejaStatus.recordset.map((r) => [r.NoMeja, r]));

  const meja = mejaRaw.recordset.map((r) => {
    const st = statusMap.get(r.NoMeja) || null;
    return {
      noMeja: r.NoMeja,
      namaMeja: r.NamaMeja,
      idGroupMesinSawmill: r.IdGroupMesinSawmill,
      isBerjalanHariIni: st ? !!st.isBerjalan : false,
      noTerakhir: st ? st.lastNo : "",
      hourStartTerakhir: st ? st.lastHourStart : "",
      hourEndTerakhir: st ? st.lastHourEnd : "",
    };
  });

  const [operator, specCond, gradeKB, spk, digit, kunciHarian] = await Promise.all([
    run(`
      SELECT A.NamaOperator, A.IdOperator
      FROM MstOperator A
      INNER JOIN MstBagian B ON B.IdBagian = A.IdBagian
      WHERE A.[Enable] = 1 AND (B.NamaBagian LIKE 'BANSAW' OR B.NamaBagian LIKE 'SLP')
      ORDER BY A.NamaOperator ASC
    `),
    run(`
      SELECT Condition, IdSawmillSpecialCondition
      FROM MstSawmillSpecialCondition
      WHERE Enable = 1
      ORDER BY IdSawmillSpecialCondition ASC
    `),
    run(`
      SELECT NamaGrade, IdGradeKB
      FROM MstGradeKB
      WHERE [Enable] = 1 AND (IsKayuBulat = 0 AND IsST = 1)
      ORDER BY IdGradeKB ASC
    `),
    run(`
      SELECT NoSPK FROM MstSPK_h WHERE [Enable] = 1 ORDER BY NoSPK ASC
    `),
    run(`
      SELECT PB FROM Digit
    `),
    run(`
      SELECT Max(PeriodHarian) AS PeriodHarian FROM MstTutupTransaksiHarian WHERE Lock = 1
    `),
  ]);

  return {
    meja,
    operator,
    spec_condition: specCond,
    grade_kb: gradeKB,
    spk: spk.map((r) => r.NoSPK),
    digit: digit.length > 0 ? digit[0].PB : "",
    kunci_harian: kunciHarian.length > 0 ? kunciHarian[0].PeriodHarian : null,
  };
};

// Lihat info kayu bulat untuk auto-fill + cek pemakaian
exports.getKayuBulat = async (noKayuBulat) => {
  const pool = await poolPromise;
  const req = pool.request();
  req.input("noKayuBulat", sql.VarChar, noKayuBulat);

  const info = await req.query(`
    SELECT
      C.IdJenisKayu, C.Jenis,
      B.IdSupplier, B.NmSupplier AS supplier,
      A.NoTruk, A.NoPlat, A.Suket, A.IdPengukuran
    FROM KayuBulat_h A
    INNER JOIN MstSupplier B ON A.IdSupplier = B.IdSupplier
    INNER JOIN MstJenisKayu C ON A.IdJenisKayu = C.IdJenisKayu
    WHERE A.NoKayuBulat = @noKayuBulat
  `);
  const used = await req.query(`
    SELECT NoKayuBulat FROM KayuBulat_h
    WHERE NoKayuBulat = @noKayuBulat AND DateUsage IS NOT NULL
  `);

  const r = info.recordset[0];
  if (!r) return { found: false };

  return {
    found: true,
    id_jenis_kayu: r.IdJenisKayu,
    jenis: r.Jenis,
    id_supplier: r.IdSupplier,
    supplier: r.supplier,
    no_truk: r.NoTruk,
    no_plat: r.NoPlat,
    suket: r.Suket,
    id_pengukuran: r.IdPengukuran,
    sudah_dipakai: used.recordset.length > 0,
  };
};

// Operators per meja (IdBagian IN (8,9))
exports.getOperatorMeja = async (noMeja) => {
  const pool = await poolPromise;
  const req = pool.request();
  req.input("noMeja", sql.Int, toInt(noMeja));

  const rAll = await req.query(`
    SELECT IdOperator, NamaOperator
    FROM MstOperator
    WHERE Enable = 1 AND IdBagian IN (8, 9)
    ORDER BY NamaOperator ASC
  `);

  const rDefault = await req.query(`
    SELECT IdOperator1, IdOperator2
    FROM MstMesinSawmill
    WHERE NoMeja = @noMeja
  `);

  const allOps = rAll.recordset.map((r) => ({ id: r.IdOperator, nama: r.NamaOperator }));
  let defaultOp1 = null;
  let defaultOp2 = null;
  if (rDefault.recordset.length > 0) {
    defaultOp1 = rDefault.recordset[0].IdOperator1;
    defaultOp2 = rDefault.recordset[0].IdOperator2;
  }

  return {
    operator1: allOps,
    operator2: allOps,
    default_operator1: defaultOp1,
    default_operator2: defaultOp2,
  };
};

// Produk per SPK
exports.getProdukSPK = async (noSPK) => {
  const pool = await poolPromise;
  const req = pool.request();
  req.input("noSPK", sql.VarChar, noSPK);

  const r = await req.query(`
    SELECT NamaProduk, A.IdProdukSPK
    FROM MstSPK_dProdukSPK A
    INNER JOIN MstProdukSPK B ON B.IdProdukSPK = A.IdProdukSPK
    INNER JOIN MstProdukSPK_d C ON C.IdProdukSPK = A.IdProdukSPK
    WHERE NoSPK = @noSPK
    GROUP BY NamaProduk, A.IdProdukSPK
    ORDER BY NamaProduk ASC
  `);

  return r.recordset.map((row) => ({ idProdukSPK: row.IdProdukSPK, namaProduk: row.NamaProduk }));
};

// Header list (mirip TampilHeaderLembarTelly)
exports.getAll = async ({ cari = "", top = 100, tanggal = "", noMeja = "" } = {}) => {
  const pool = await poolPromise;
  const req = pool.request();

  let kunci = new Date();
  if (tanggal) {
    const t = new Date(tanggal);
    if (!Number.isNaN(t.getTime())) kunci = t;
  }
  const tglStr = `${kunci.getFullYear()}-${String(kunci.getMonth() + 1).padStart(2, "0")}-${String(kunci.getDate()).padStart(2, "0")}`;
  req.input("tgl", sql.Date, tglStr);
  req.input("top", sql.Int, Math.min(Math.max(toInt(top) || 100, 1), 500));

  const where = [];
  if (cari) {
    req.input("cari", sql.VarChar, `%${cari}%`);
    where.push("A.NoKayuBulat LIKE @cari");
  }
  if (noMeja !== "" && noMeja !== undefined && noMeja !== null) {
    req.input("noMeja", sql.Int, toInt(noMeja));
    where.push("A.NoMeja = @noMeja");
  }
  where.push("A.TglSawmill = @tgl");
  where.push("B.DateUsage IS NULL");

  const result = await req.query(`
    SELECT TOP (@top)
      A.NoSTSawmill AS no,
      CONVERT(varchar(10), A.TglSawmill, 120) AS tgl,
      A.NoKayuBulat AS no_kayu_bulat,
      A.NoMeja AS no_meja,
      A.[Shift] AS shift,
      C.Jenis AS jenis,
      G.NamaMeja AS nama_meja,
      A.JamKerja AS jam_kerja,
      CASE WHEN A.Operator IS NULL
        THEN CONCAT_WS(' - ', NULLIF(E.NamaOperator,''), NULLIF(F.NamaOperator,''))
        ELSE A.Operator END AS operator,
      D.Berat AS berat,
      A.BalokTerpakai AS balok_terpakai,
      A.JlhBatangRajang AS jlh_batang_rajang,
      A.HourMeter AS hour_meter,
      E.NamaOperator AS operator1,
      F.NamaOperator AS operator2,
      CONVERT(varchar(5), A.HourStart, 108) AS hour_start,
      CONVERT(varchar(5), A.HourEnd, 108) AS hour_end,
      (SELECT Sum(JmlhBatang) FROM STSawmill_d X WHERE X.NoSTSawmill = A.NoSTSawmill) AS total_jml_batang,
      (SELECT Sum(
        CASE WHEN X.IdUOMTblLebar = '1' AND X.IdUOMPanjang = '4'
          THEN Floor(X.Tebal * X.Lebar * X.Panjang * 304.8 * X.JmlhBatang / 1000000000 / 1.416 * 10000) / 10000
          WHEN X.IdUOMTblLebar = '3' AND X.IdUOMPanjang = '4'
          THEN Floor(X.Tebal * X.Lebar * X.Panjang * X.JmlhBatang / 7200.8 * 10000) / 10000
        END)
      FROM STSawmill_d X
      WHERE X.NoSTSawmill = A.NoSTSawmill) AS total_ton
    FROM STSawmill_h A
    INNER JOIN KayuBulat_h B ON A.NoKayuBulat = B.NoKayuBulat
    INNER JOIN MstJenisKayu C ON C.IdJenisKayu = B.IdJenisKayu
    LEFT JOIN STSawmill_dBalokTim D ON D.NoSTSawmill = A.NoSTSawmill
    LEFT JOIN MstOperator E ON E.IdOperator = A.IdOperator1
    LEFT JOIN MstOperator F ON F.IdOperator = A.IdOperator2
    LEFT JOIN MstMesinSawmill G ON G.NoMeja = A.NoMeja
    ${where.length ? "WHERE " + where.join(" AND ") : ""}
    ORDER BY A.NoSTSawmill DESC
  `);

  // Komputasi meja yang berjalan pada tanggal yang diminta
  const berjalanReq = pool.request();
  berjalanReq.input("tgl", sql.Date, tglStr);
  const berjalan = await berjalanReq.query(`
    SELECT NoMeja FROM STSawmill_h
    WHERE TglSawmill = @tgl
    GROUP BY NoMeja
  `);
  const berjalanSet = new Set(berjalan.recordset.map((r) => r.NoMeja));

  return result.recordset.map((r) => ({
    ...r,
    is_berjalan_hari_ini: berjalanSet.has(r.no_meja),
  }));
};

// Header + detail untuk satu NoSTSawmill
exports.getByNo = async (no) => {
  const pool = await poolPromise;
  const req = pool.request();
  req.input("no", sql.VarChar, no);

  const headerQ = await req.query(`
    SELECT
      A.NoSTSawmill AS no,
      A.[Shift] AS shift,
      CONVERT(varchar(10), A.TglSawmill, 120) AS tgl,
      A.NoKayuBulat AS no_kayu_bulat,
      A.NoMeja AS no_meja,
      G.NamaMeja AS nama_meja,
      A.IdSawmillSpecialCondition AS id_sawmill_special_condition,
      SC.[Condition] AS [condition],
      A.BalokTerpakai AS balok_terpakai,
      A.JlhBatangRajang AS jlh_batang_rajang,
      A.HourMeter AS hour_meter,
      A.JamKerja AS jam_kerja,
      CONVERT(varchar(5), A.HourStart, 108) AS hour_start,
      CONVERT(varchar(5), A.HourEnd, 108) AS hour_end,
      A.IdOperator1 AS id_operator1,
      A.IdOperator2 AS id_operator2,
      OP1.NamaOperator AS operator1,
      OP2.NamaOperator AS operator2,
      A.BeratBalok AS berat_balok,
      A.IsBorongan AS is_borongan,
      B2.IdPengukuran AS id_pengukuran,
      B2.IdJenisKayu AS id_jenis_kayu,
      C2.Jenis AS jenis,
      B2.IdSupplier AS id_supplier,
      S2.NmSupplier AS supplier,
      B2.NoTruk AS no_truk,
      B2.NoPlat AS no_plat,
      B2.Suket AS suket,
      D.Berat AS berat_balok_tim
    FROM STSawmill_h A
    INNER JOIN KayuBulat_h B2 ON B2.NoKayuBulat = A.NoKayuBulat
    INNER JOIN MstJenisKayu C2 ON C2.IdJenisKayu = B2.IdJenisKayu
    LEFT JOIN MstSupplier S2 ON S2.IdSupplier = B2.IdSupplier
    LEFT JOIN MstMesinSawmill G ON G.NoMeja = A.NoMeja
    LEFT JOIN MstSawmillSpecialCondition SC ON SC.IdSawmillSpecialCondition = A.IdSawmillSpecialCondition
    LEFT JOIN MstOperator OP1 ON OP1.IdOperator = A.IdOperator1
    LEFT JOIN MstOperator OP2 ON OP2.IdOperator = A.IdOperator2
    LEFT JOIN STSawmill_dBalokTim D ON D.NoSTSawmill = A.NoSTSawmill
    WHERE A.NoSTSawmill = @no
  `);

  const h = headerQ.recordset[0];
  if (!h) return null;

  const detailQ = await req.query(`
    SELECT
      d.NoUrut AS no_urut,
      d.Tebal AS tebal,
      d.Lebar AS lebar,
      d.Panjang AS panjang,
      d.JmlhBatang AS jmlh_batang,
      (CASE WHEN d.IsLocal = 1 THEN 'LOKAL/KAYU LAT' ELSE NULL END) AS keterangan,
      (CASE WHEN d.IsBagusKulit = 1 THEN 'BAGUS'
            WHEN d.IsBagusKulit = 2 THEN 'KULIT' ELSE NULL END) AS bagus,
      d.NoSPK AS no_spk,
      p.NamaProduk AS nama_produk,
      d.IdProdukSPK AS id_produk_spk,
      d.IdUOMTblLebar AS id_uom_tbl_lebar,
      d.IdUOMPanjang AS id_uom_panjang
    FROM STSawmill_d d
    LEFT JOIN MstProdukSPK p ON p.IdProdukSPK = d.IdProdukSPK
    WHERE d.NoSTSawmill = @no
    ORDER BY d.NoSTSawmill ASC
  `);

  const totQ = await req.query(`
    SELECT
      (SELECT Sum(JmlhBatang) FROM STSawmill_d WHERE NoSTSawmill = @no) AS jml_batang,
      (SELECT Sum(
        CASE WHEN A.IdUOMTblLebar = '1' AND A.IdUOMPanjang = '4'
          THEN Floor(A.Tebal * A.Lebar * A.Panjang * 304.8 * A.JmlhBatang / 1000000000 / 1.416 * 10000) / 10000
          WHEN A.IdUOMTblLebar = '3' AND A.IdUOMPanjang = '4'
          THEN Floor(A.Tebal * A.Lebar * A.Panjang * A.JmlhBatang / 7200.8 * 10000) / 10000
        END)
      FROM STSawmill_d A
      WHERE NoSTSawmill = @no) AS ton
  `);

  const kgQ = await req.query(`
    SELECT B.NoUrut, B.IdGradeKB, D.NamaGrade
    FROM STSawmillKG_d B
    LEFT JOIN MstGradeKB D ON D.IdGradeKB = B.IdGradeKB
    WHERE B.NoSTSawmill = @no
  `);
  const kgMap = new Map(kgQ.recordset.filter((r) => r.NoUrut !== null).map((r) => [r.NoUrut, r.NamaGrade]));

  const detail = detailQ.recordset.map((r) => ({
    no_urut: r.no_urut,
    tebal: r.tebal,
    lebar: r.lebar,
    panjang: r.panjang,
    jmlh_batang: r.jmlh_batang,
    keterangan: r.keterangan,
    bagus: r.bagus,
    no_spk: r.no_spk,
    nama_produk: r.nama_produk,
    id_produk_spk: r.id_produk_spk,
    id_uom_tbl_lebar: r.id_uom_tbl_lebar,
    id_uom_panjang: r.id_uom_panjang,
    nama_grade: kgMap.get(r.no_urut) || null,
  }));

  return {
    header: h,
    detail,
    total: { jml_batang: totQ.recordset[0]?.jml_batang || 0, ton: totQ.recordset[0]?.ton || 0 },
  };
};

// CREATE : header + detail + balokTim + KG + alokasi stok
exports.create = async (data) => {
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const hariIni = data.tgl || new Date();
    const tglDate = new Date(hariIni);

    if (!(await cekPeriodeTerbuka(transaction, tglDate))) {
      await transaction.rollback();
      throw new Error("Maaf, Periode ini sudah terkunci");
    }

    const noKayuBulat = data.no_kayu_bulat;
    if (!noKayuBulat) throw new Error("No Kayu Bulat wajib diisi");
    const noMeja = toInt(data.no_meja);
    if (!noMeja) throw new Error("No Meja wajib diisi");
    if (!data.shift) throw new Error("Shift wajib diisi");
    if (!data.jenis) throw new Error("Jenis Kayu wajib diisi");

    const mejaInfo = await transaction.request()
      .input("noMeja", sql.Int, noMeja)
      .query(`SELECT IdGroupMesinSawmill FROM MstMesinSawmill WHERE NoMeja = @noMeja AND Enable = 1`);
    const idGroup = mejaInfo.recordset[0]?.IdGroupMesinSawmill;
    if (idGroup === undefined) throw new Error("Meja tidak ditemukan atau non-aktif");

    const overlapError = await cekOverlapProduksi(
      transaction, noMeja, tglDate, data.hour_start, data.hour_end, null
    );
    if (overlapError) {
      await transaction.rollback();
      throw new Error(overlapError);
    }

    const noSTSawmill = await generateNoSTSawmill(transaction);

    const req = transaction.request();
    req.input("NoSTSawmill", sql.VarChar, noSTSawmill)
      .input("Shift", sql.Int, toInt(data.shift))
      .input("TglSawmill", sql.Date, tglDate)
      .input("NoKayuBulat", sql.VarChar, noKayuBulat)
      .input("NoMeja", sql.Int, noMeja)
      .input("IdSawmillSpecialCondition", sql.Int, toInt(data.id_sawmill_special_condition))
      .input("BalokTerpakai", sql.Int, toInt(data.balok_terpakai))
      .input("JlhBatangRajang", sql.Int, toInt(data.jlh_batang_rajang))
      .input("HourMeter", sql.Float, toFloat(data.hour_meter))
      .input("JamKerja", sql.Float, toFloat(data.jam_kerja))
      .input("HourStart", sql.VarChar, data.hour_start || null)
      .input("HourEnd", sql.VarChar, data.hour_end || null)
      .input("IdOperator1", sql.Int, toInt(data.id_operator1))
      .input("IdOperator2", sql.Int, toInt(data.id_operator2))
      .input("BeratBalok", sql.Float, toFloat(data.berat_balok));

    // Kolom jam khusus meja Non-BANSAW diisi via operator
    await req.query(`
      INSERT INTO STSawmill_h (
        NoSTSawmill, [Shift], TglSawmill, NoKayuBulat, NoMeja,
        IdSawmillSpecialCondition, BalokTerpakai, JlhBatangRajang, HourMeter,
        JamKerja, HourStart, HourEnd, IdOperator1, IdOperator2, BeratBalok
      ) VALUES (
        @NoSTSawmill, @Shift, @TglSawmill, @NoKayuBulat, @NoMeja,
        @IdSawmillSpecialCondition, @BalokTerpakai, @JlhBatangRajang, @HourMeter,
        @JamKerja, @HourStart, @HourEnd, @IdOperator1, @IdOperator2, @BeratBalok
      )
    `);

    // Detail
    for (const d of data.detail || []) {
      const dReq = transaction.request();
      dReq.input("NoSTSawmill", sql.VarChar, noSTSawmill)
        .input("NoUrut", sql.Int, toInt(d.no_urut))
        .input("Tebal", sql.Float, toFloat(d.tebal))
        .input("Lebar", sql.Float, toFloat(d.lebar))
        .input("Panjang", sql.Float, toFloat(d.panjang))
        .input("JmlhBatang", sql.Int, toInt(d.jmlh_batang))
        .input("IsLocal", sql.Bit, !!d.is_local)
        .input("IdUOMTblLebar", sql.Int, toInt(d.id_uom_tbl_lebar))
        .input("IdUOMPanjang", sql.Int, toInt(d.id_uom_panjang))
        .input("IsBagusKulit", sql.Int, toInt(d.is_bagus_kulit) || 0);
      await dReq.query(`
        INSERT INTO STSawmill_d (
          NoSTSawmill, NoUrut, Tebal, Lebar, Panjang, JmlhBatang,
          IsLocal, IdUOMTblLebar, IdUOMPanjang, IsBagusKulit
        ) VALUES (
          @NoSTSawmill, @NoUrut, @Tebal, @Lebar, @Panjang, @JmlhBatang,
          @IsLocal, @IdUOMTblLebar, @IdUOMPanjang, @IsBagusKulit
        )
      `);
    }

    // BalokTim
    if (data.berat_balok_tim !== undefined && data.berat_balok_tim !== null && data.berat_balok_tim !== "") {
      await transaction.request()
        .input("NoSTSawmill", sql.VarChar, noSTSawmill)
        .input("Berat", sql.Float, toFloat(data.berat_balok_tim))
        .query(`INSERT INTO STSawmill_dBalokTim (NoSTSawmill, Berat) VALUES (@NoSTSawmill, @Berat)`);
    }

    // KG detail
    const isKG = toInt(data.id_pengukuran) === 5;
    if (isKG) {
      for (const d of data.detail || []) {
        if (!d.nama_grade) continue;
        const kgReq = transaction.request();
        kgReq.input("NoSTSawmill", sql.VarChar, noSTSawmill)
          .input("NoUrut", sql.Int, toInt(d.no_urut))
          .input("Grade", sql.VarChar, d.nama_grade);
        await kgReq.query(`
          DECLARE @IdGradeKB AS INT
          SET @IdGradeKB = (SELECT IdGradeKB FROM MstGradeKB WHERE NamaGrade = @Grade)
          IF @IdGradeKB IS NOT NULL
            INSERT INTO STSawmillKG_d (NoSTSawmill, NoUrut, IdGradeKB)
            VALUES (@NoSTSawmill, @NoUrut, @IdGradeKB)
        `);
      }
    }

    const totalInput = toInt(data.balok_terpakai) || 0;
    if (totalInput > 0) {
      if (String(data.jenis || "").toUpperCase() === "RAMBUNG") {
        const stokKG = await ambilStokKG(transaction, noKayuBulat);
        const alokasi = alokasikanStok(totalInput, stokKG);
        for (const [idGrade, jumlah] of alokasi) {
          if (jumlah <= 0) continue;
          await transaction.request()
            .input("NoSTSawmill", sql.VarChar, noSTSawmill)
            .input("IdGrade", sql.Int, toInt(idGrade))
            .input("JumlahAlokasi", sql.Int, jumlah)
            .query(`INSERT INTO STSawmill_dBalokGantungKG (NoSTSawmill, IdGradeKB, Pcs) VALUES (@NoSTSawmill, @IdGrade, @JumlahAlokasi)`);
        }
      } else {
        const stokTon = await ambilStokTon(transaction, noKayuBulat);
        const alokasi = alokasikanStok(totalInput, stokTon);
        for (const [grade, jumlah] of alokasi) {
          if (jumlah <= 0) continue;
          await transaction.request()
            .input("NoSTSawmill", sql.VarChar, noSTSawmill)
            .input("Grade", sql.VarChar, grade)
            .input("JumlahAlokasi", sql.Int, jumlah)
            .query(`INSERT INTO STSawmill_dBalokGantung (NoSTSawmill, Grade, Pcs) VALUES (@NoSTSawmill, @Grade, @JumlahAlokasi)`);
        }
      }
    }

    // Bersihkan Pcs = 0
    await transaction.request().query(`DELETE FROM STSawmill_dBalokGantungKG WHERE Pcs = 0`);
    await transaction.request().query(`DELETE FROM STSawmill_dBalokGantung WHERE Pcs = 0`);

    // Riwayat
    if (data.nip) {
      await transaction.request()
        .input("Nip", sql.VarChar, data.nip)
        .input("NoSTSawmill", sql.VarChar, noSTSawmill)
        .query(`INSERT INTO Riwayat ([Nip], [Tgl], [Aktivitas])
          VALUES (@Nip, GETDATE(),
            'Menyimpan No.' + @NoSTSawmill + ' Pada Data Lembar Telly Hasil Sawmill')`);
    }

    await transaction.commit();
    return noSTSawmill;
  } catch (err) {
    try { await transaction.rollback(); } catch (rbErr) { console.error("Rollback failed:", rbErr.message); }
    throw err;
  }
};

// UPDATE header + detail (delete detail & insert ulang)
exports.update = async (data) => {
  const pool = await poolPromise;
  const no = data.no;
  if (!no) throw new Error("no wajib diisi");

  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const check = await transaction.request()
      .input("no", sql.VarChar, no)
      .query(`SELECT NoSTSawmill, TglSawmill FROM STSawmill_h WHERE NoSTSawmill = @no`);
    if (!check.recordset[0]) {
      await transaction.rollback();
      return false;
    }

    const tglDate = new Date(data.tgl || check.recordset[0].TglSawmill);
    if (!(await cekPeriodeTerbuka(transaction, tglDate))) {
      await transaction.rollback();
      throw new Error("Maaf, Periode ini sudah terkunci");
    }

    const noKayuBulat = data.no_kayu_bulat;
    const req = transaction.request();
    req.input("no", sql.VarChar, no)
      .input("Shift", sql.Int, toInt(data.shift))
      .input("TglSawmill", sql.Date, tglDate)
      .input("NoKayuBulat", sql.VarChar, noKayuBulat)
      .input("IdSawmillSpecialCondition", sql.Int, toInt(data.id_sawmill_special_condition))
      .input("BalokTerpakai", sql.Int, toInt(data.balok_terpakai))
      .input("JlhBatangRajang", sql.Int, toInt(data.jlh_batang_rajang))
      .input("IdOperator1", sql.Int, toInt(data.id_operator1))
      .input("IdOperator2", sql.Int, toInt(data.id_operator2))
      .input("BeratBalokTpk", sql.Float, toFloat(data.berat_balok))
      .input("IsBorongan", sql.Bit, !!data.is_borongan)
      .input("JamKerja", sql.Float, toFloat(data.jam_kerja));

    await req.query(`
      UPDATE STSawmill_h SET
        [Shift] = @Shift,
        TglSawmill = @TglSawmill,
        NoKayuBulat = @NoKayuBulat,
        IdSawmillSpecialCondition = @IdSawmillSpecialCondition,
        BalokTerpakai = @BalokTerpakai,
        JlhBatangRajang = @JlhBatangRajang,
        IdOperator1 = @IdOperator1,
        IdOperator2 = @IdOperator2,
        BeratBalok = @BeratBalokTpk,
        IsBorongan = @IsBorongan,
        JamKerja = @JamKerja
      WHERE NoSTSawmill = @no
    `);

    // Rebuild detail: hapus lalu insert ulang
    await transaction.request()
      .input("no", sql.VarChar, no)
      .query(`DELETE FROM STSawmillKG_d WHERE NoSTSawmill = @no`);
    await transaction.request()
      .input("no", sql.VarChar, no)
      .query(`DELETE FROM STSawmill_d WHERE NoSTSawmill = @no`);

    for (const d of data.detail || []) {
      const dReq = transaction.request();
      dReq.input("no", sql.VarChar, no)
        .input("NoUrut", sql.Int, toInt(d.no_urut))
        .input("Tebal", sql.Float, toFloat(d.tebal))
        .input("Lebar", sql.Float, toFloat(d.lebar))
        .input("Panjang", sql.Float, toFloat(d.panjang))
        .input("JmlhBatang", sql.Int, toInt(d.jmlh_batang))
        .input("IsLocal", sql.Bit, !!d.is_local)
        .input("IdUOMTblLebar", sql.Int, toInt(d.id_uom_tbl_lebar))
        .input("IdUOMPanjang", sql.Int, toInt(d.id_uom_panjang))
        .input("IsBagusKulit", sql.Int, toInt(d.is_bagus_kulit) || 0);
      await dReq.query(`
        INSERT INTO STSawmill_d (
          NoSTSawmill, NoUrut, Tebal, Lebar, Panjang, JmlhBatang,
          IsLocal, IdUOMTblLebar, IdUOMPanjang, IsBagusKulit
        ) VALUES (
          @no, @NoUrut, @Tebal, @Lebar, @Panjang, @JmlhBatang,
          @IsLocal, @IdUOMTblLebar, @IdUOMPanjang, @IsBagusKulit
        )
      `);
      if (toInt(data.id_pengukuran) === 5 && d.nama_grade) {
        const kgReq = transaction.request();
        kgReq.input("no", sql.VarChar, no)
          .input("NoUrut", sql.Int, toInt(d.no_urut))
          .input("Grade", sql.VarChar, d.nama_grade);
        await kgReq.query(`
          DECLARE @IdGradeKB AS INT
          SET @IdGradeKB = (SELECT IdGradeKB FROM MstGradeKB WHERE NamaGrade = @Grade)
          IF @IdGradeKB IS NOT NULL
            INSERT INTO STSawmillKG_d (NoSTSawmill, NoUrut, IdGradeKB)
            VALUES (@no, @NoUrut, @IdGradeKB)
        `);
      }
    }

    // BalokTim
    await transaction.request()
      .input("no", sql.VarChar, no)
      .query(`DELETE FROM STSawmill_dBalokTim WHERE NoSTSawmill = @no`);
    if (data.berat_balok_tim !== undefined && data.berat_balok_tim !== null && data.berat_balok_tim !== "") {
      await transaction.request()
        .input("no", sql.VarChar, no)
        .input("Berat", sql.Float, toFloat(data.berat_balok_tim))
        .query(`INSERT INTO STSawmill_dBalokTim (NoSTSawmill, Berat) VALUES (@no, @Berat)`);
    }

    // Re-alokasi stok
    const totalInput = toInt(data.balok_terpakai) || 0;
    await transaction.request().input("no", sql.VarChar, no)
      .query(`DELETE FROM STSawmill_dBalokGantungKG WHERE NoSTSawmill = @no`);
    await transaction.request().input("no", sql.VarChar, no)
      .query(`DELETE FROM STSawmill_dBalokGantung WHERE NoSTSawmill = @no`);

    if ((data.id_pengukuran ? toInt(data.id_pengukuran) : 0) === 5) {
      if (totalInput > 0) {
        const stokKG = await ambilStokKG(transaction, noKayuBulat);
        const alokasi = alokasikanStok(totalInput, stokKG);
        for (const [idGrade, jumlah] of alokasi) {
          if (jumlah <= 0) continue;
          await transaction.request()
            .input("NoSTSawmill", sql.VarChar, no)
            .input("IdGrade", sql.Int, toInt(idGrade))
            .input("JumlahAlokasi", sql.Int, jumlah)
            .query(`INSERT INTO STSawmill_dBalokGantungKG (NoSTSawmill, IdGradeKB, Pcs) VALUES (@NoSTSawmill, @IdGrade, @JumlahAlokasi)`);
        }
      }
    } else if (totalInput > 0) {
      const stokTon = await ambilStokTon(transaction, noKayuBulat);
      const alokasi = alokasikanStok(totalInput, stokTon);
      for (const [grade, jumlah] of alokasi) {
        if (jumlah <= 0) continue;
        await transaction.request()
          .input("NoSTSawmill", sql.VarChar, no)
          .input("Grade", sql.VarChar, grade)
          .input("JumlahAlokasi", sql.Int, jumlah)
          .query(`INSERT INTO STSawmill_dBalokGantung (NoSTSawmill, Grade, Pcs) VALUES (@NoSTSawmill, @Grade, @JumlahAlokasi)`);
      }
    }

    await transaction.request().query(`DELETE FROM STSawmill_dBalokGantungKG WHERE Pcs = 0`);
    await transaction.request().query(`DELETE FROM STSawmill_dBalokGantung WHERE Pcs = 0`);

    if (data.nip) {
      await transaction.request()
        .input("Nip", sql.VarChar, data.nip)
        .input("no", sql.VarChar, no)
        .query(`INSERT INTO Riwayat ([Nip], [Tgl], [Aktivitas])
          VALUES (@Nip, GETDATE(), 'Mengubah No.' + @no + ' Pada Data Lembar Telly Hasil Sawmill')`);
    }

    await transaction.commit();
    return true;
  } catch (err) {
    try { await transaction.rollback(); } catch (rbErr) { console.error("Rollback failed:", rbErr.message); }
    throw err;
  }
};

// Update header only
exports.updateHeader = async (data) => {
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const no = data.no;
    if (!no) throw new Error("No tidak valid");

    const req = transaction.request();
    req.input("no", sql.VarChar, no);
    req.input("tgl", sql.Date, data.tgl || null);
    req.input("shift", sql.Int, toInt(data.shift));
    req.input("no_kayu_bulat", sql.VarChar, data.no_kayu_bulat || null);
    req.input("id_sawmill_special_condition", sql.Int, toInt(data.id_sawmill_special_condition));
    req.input("balok_terpakai", sql.Int, toInt(data.balok_terpakai));
    req.input("jlh_batang_rajang", sql.Int, toInt(data.jlh_batang_rajang));
    req.input("jam_kerja", sql.Decimal(10, 2), toFloat(data.jam_kerja));
    req.input("hour_start", sql.VarChar, data.hour_start || null);
    req.input("hour_end", sql.VarChar, data.hour_end || null);
    req.input("id_operator1", sql.Int, toInt(data.id_operator1));
    req.input("id_operator2", sql.Int, toInt(data.id_operator2));
    req.input("berat_balok", sql.Decimal(18, 4), toFloat(data.berat_balok));
    req.input("is_borongan", sql.Bit, data.is_borongan ? 1 : 0);
    req.input("remark", sql.NVarChar(500), data.remark || null);

    await req.query(`
      UPDATE STSawmill_h SET
        TglSawmill = @tgl,
        Shift = @shift,
        NoKayuBulat = @no_kayu_bulat,
        IdSawmillSpecialCondition = @id_sawmill_special_condition,
        BalokTerpakai = @balok_terpakai,
        JlhBatangRajang = @jlh_batang_rajang,
        JamKerja = @jam_kerja,
        HourStart = @hour_start,
        HourEnd = @hour_end,
        IdOperator1 = @id_operator1,
        IdOperator2 = @id_operator2,
        BeratBalok = @berat_balok,
        IsBorongan = @is_borongan,
        Remark = @remark
      WHERE NoSTSawmill = @no
    `);

    await transaction.commit();
    return true;
  } catch (err) {
    try { await transaction.rollback(); } catch (rbErr) { console.error("Rollback failed:", rbErr.message); }
    throw err;
  }
};

// Selesai / matikan kayu bulat
exports.selesai = async (no, username) => {
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    // Get header info
    const headerResult = await transaction.request()
      .input("no", sql.VarChar, no)
      .query(`SELECT NoKayuBulat, TglSawmill FROM STSawmill_h WHERE NoSTSawmill = @no`);

    if (headerResult.recordset.length === 0) {
      throw new Error("Data tidak ditemukan");
    }

    const noKayuBulat = headerResult.recordset[0].NoKayuBulat;
    const tgl = headerResult.recordset[0].TglSawmill;

    if (!noKayuBulat) {
      throw new Error("No Kayu Bulat kosong pada data ini");
    }

    // Check if already finished
    const usedCheck = await transaction.request()
      .input("noKB", sql.VarChar, noKayuBulat)
      .query(`SELECT NoKayuBulat FROM KayuBulat_h WHERE NoKayuBulat = @noKB AND DateUsage IS NOT NULL`);

    if (usedCheck.recordset.length > 0) {
      throw new Error("No Kayu Bulat sudah dimatikan");
    }

    // Check sisa balok
    const sisaResult = await transaction.request()
      .input("noKB", sql.VarChar, noKayuBulat)
      .query(`
        SELECT ISNULL(A.TGA, 0) - ISNULL(B.TG, 0) AS Sisa FROM
        (SELECT NoKayuBulat, SUM(JmlhBatang) AS TGA FROM KayuBulatKG_D WHERE NoKayuBulat = @noKB GROUP BY NoKayuBulat) A
        LEFT JOIN
        (SELECT B.NoKayuBulat, SUM(CASE WHEN Pcs IS NULL THEN 0 ELSE Pcs END) AS TG
         FROM STSawmill_dBalokGantungKG A
         INNER JOIN STSawmill_h B ON B.NoSTSawmill = A.NoSTSawmill
         WHERE B.NoKayuBulat = @noKB GROUP BY B.NoKayuBulat) B ON B.NoKayuBulat = A.NoKayuBulat

        UNION

        SELECT ISNULL(A.TGA, 0) - ISNULL(B.TG, 0) AS Sisa FROM
        (SELECT NoKayuBulat, COUNT(NoKayuBulat) AS TGA FROM KayuBulat_d WHERE NoKayuBulat = @noKB GROUP BY NoKayuBulat) A
        LEFT JOIN
        (SELECT B.NoKayuBulat, SUM(Pcs) AS TG
         FROM STSawmill_dBalokGantung A
         INNER JOIN STSawmill_h B ON B.NoSTSawmill = A.NoSTSawmill
         WHERE B.NoKayuBulat = @noKB GROUP BY B.NoKayuBulat) B ON B.NoKayuBulat = A.NoKayuBulat
      `);

    let totalSisa = 0;
    for (const row of sisaResult.recordset) {
      totalSisa += parseInt(row.Sisa) || 0;
    }

    if (totalSisa !== 0) {
      throw new Error("Sisa Balok masih ada tersisa " + totalSisa + ", pastikan balok sudah diinput semua");
    }

    // Generate NoPenerimaanST
    const genResult = await transaction.request()
      .query(`SELECT 'B.' + FORMAT(RIGHT(ISNULL(MAX(NoPenerimaanST), 'B.000000'), 6) + 1, '000000') AS No FROM PenerimaanSTSawmill_h`);

    const noPenerimaan = genResult.recordset[0].No;

    // Insert header PenerimaanSTSawmill_h
    await transaction.request()
      .input("noPenerimaan", sql.VarChar, noPenerimaan)
      .input("tgl", sql.Date, tgl)
      .input("noKB", sql.VarChar, noKayuBulat)
      .query(`INSERT INTO PenerimaanSTSawmill_h (NoPenerimaanST, TglLaporan, NoKayuBulat) VALUES (@noPenerimaan, @tgl, @noKB)`);

    // Insert detail PenerimaanSTSawmill_d
    await transaction.request()
      .input("noPenerimaan", sql.VarChar, noPenerimaan)
      .input("noKB", sql.VarChar, noKayuBulat)
      .query(`
        INSERT INTO PenerimaanSTSawmill_d (NoPenerimaanST, NoSTSawmill)
        SELECT @noPenerimaan, NoSTSawmill FROM STSawmill_h WHERE NoKayuBulat = @noKB
      `);

    // Update DateUsage
    await transaction.request()
      .input("noKB", sql.VarChar, noKayuBulat)
      .input("tgl", sql.Date, tgl)
      .query(`UPDATE KayuBulat_h SET DateUsage = @tgl WHERE NoKayuBulat = @noKB`);

    // History log
    constKalimat = "Menyimpan No." + noKayuBulat + " Pada Data Penerimaan ST (Telly Sheet)";
    await transaction.request()
      .input("nip", sql.VarChar, username || "")
      .input("tgl", sql.DateTime, new Date())
      .input("aktivitas", sql.NVarChar, constKalimat)
      .query(`INSERT INTO Riwayat ([Nip], [Tgl], [Aktivitas]) VALUES (@nip, @tgl, @aktivitas)`);

    await transaction.commit();
    return { noPenerimaan };
  } catch (err) {
    try { await transaction.rollback(); } catch (rbErr) { console.error("Rollback failed:", rbErr.message); }
    throw err;
  }
};

// Get SPK + Produk filtered by Tebal + Lebar
exports.getSpkByTebalLebar = async (tebal, lebar) => {
  const pool = await poolPromise;
  const req = pool.request();
  req.input("tebal", sql.Decimal(18, 2), tebal);
  req.input("lebar", sql.Decimal(18, 2), lebar);

  const r = await req.query(`
    SELECT DISTINCT
      h.NoSPK,
      p.IdProdukSPK,
      p.NamaProduk
    FROM MstSPK_h h
    INNER JOIN MstSPK_dProdukSPK sp ON sp.NoSPK = h.NoSPK
    INNER JOIN MstProdukSPK p ON p.IdProdukSPK = sp.IdProdukSPK
    INNER JOIN MstProdukSPK_d pd ON pd.IdProdukSPK = p.IdProdukSPK
    WHERE h.[Enable] = 1
      AND pd.Tebal = @tebal
      AND pd.Lebar = @lebar
    ORDER BY h.NoSPK, p.NamaProduk
  `);

  const spkList = [];
  const produkList = [];
  const seenSpk = new Set();
  const seenProduk = new Set();

  for (const row of r.recordset) {
    if (!seenSpk.has(row.NoSPK)) {
      seenSpk.add(row.NoSPK);
      spkList.push(row.NoSPK);
    }
    const key = row.IdProdukSPK;
    if (!seenProduk.has(key)) {
      seenProduk.add(key);
      produkList.push({ idProdukSPK: row.IdProdukSPK, namaProduk: row.NamaProduk, noSPK: row.NoSPK });
    }
  }

  return { spkList, produkList };
};

// DELETE : hapus semua detail lalu header
exports.remove = async (no) => {
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const check = await transaction.request()
      .input("no", sql.VarChar, no)
      .query(`SELECT NoSTSawmill FROM STSawmill_h WHERE NoSTSawmill = @no`);
    if (!check.recordset[0]) {
      await transaction.rollback();
      return false;
    }

    await transaction.request().input("no", sql.VarChar, no)
      .query(`DELETE FROM STSawmillKG_d WHERE NoSTSawmill = @no`);
    await transaction.request().input("no", sql.VarChar, no)
      .query(`DELETE FROM STSawmill_d WHERE NoSTSawmill = @no`);
    await transaction.request().input("no", sql.VarChar, no)
      .query(`DELETE FROM STSawmill_dBalokTim WHERE NoSTSawmill = @no`);
    await transaction.request().input("no", sql.VarChar, no)
      .query(`DELETE FROM STSawmill_dBalokGantungKG WHERE NoSTSawmill = @no`);
    await transaction.request().input("no", sql.VarChar, no)
      .query(`DELETE FROM STSawmill_dBalokGantung WHERE NoSTSawmill = @no`);
    await transaction.request().input("no", sql.VarChar, no)
      .query(`DELETE FROM STSawmill_h WHERE NoSTSawmill = @no`);

    await transaction.commit();
    return true;
  } catch (err) {
    try { await transaction.rollback(); } catch (rbErr) { console.error("Rollback failed:", rbErr.message); }
    throw err;
  }
};