const { sql, poolPromise } = require("../../core/config/db");
const {
  ID_PENGUKURAN_BERAT,
  NO_MEJA_SLP_BATANG,
  MEJA_SLP_UNTUK_SLP,
  MEJA_SLP_UNTUK_BANSAW,
  ST_TON_FLOOR,
  AMBANG_UT,
  ID_SUPPLIER_DIKECUALIKAN,
  likeAny,
} = require("./dashboard-sawmill-sql");

// Tanggal dikirim sebagai teks 'YYYY-MM-DD' lalu di-CAST di SQL (hindari geser zona waktu Date JS).
const reqWithDate = async (params) => {
  const pool = await poolPromise;
  const request = pool.request();
  for (const [name, value] of Object.entries(params)) {
    request.input(name, sql.VarChar(10), value);
  }
  return request;
};

/** LoadData3 — jumlah charge & total menit per vacuum tube pada satu tanggal. */
const vacuum = async (tgl) => {
  const request = await reqWithDate({ tgl });
  const result = await request.query(`
    SELECT B.IdVacuumTube AS idVacuumTube,
           COUNT(B.NoCharge) AS jumlahCharge,
           SUM(CASE
                 WHEN B.StartOpenTube >= B.StartVacuum1 THEN DATEDIFF(MINUTE, B.StartVacuum1, B.StartOpenTube)
                 ELSE DATEDIFF(MINUTE, B.StartVacuum1, '23:59:59') + DATEDIFF(MINUTE, '00:00:00', B.StartOpenTube) + 1
               END) AS menit
    FROM VacuumV2_h A
    INNER JOIN VacuumV2_dOperation B ON B.NoVacuumV2 = A.NoVacuumV2
    WHERE A.Tanggal = CAST(@tgl AS DATE)
    GROUP BY A.Tanggal, B.IdVacuumTube
    ORDER BY B.IdVacuumTube
  `);
  return result.recordset;
};

/**
 * LoadData9 + LoadDataTotalSLP — produktivitas per mesin SLP.
 * HK mengikuti desktop: hari kalender dari tgl 1 s.d. tanggal dipilih (DAY(@tgl)),
 * Minggu/Holiday ikut dihitung (perilaku sengaja, bukan bug port).
 * Rata-rata = produksi tgl 1 (eksklusif) s.d. tanggal dipilih (eksklusif) / HK.
 * SLP 1 (NoMeja 15) dihitung dalam batang, dan tidak masuk total ton.
 */
const produktivitasSlp = async (tgl) => {
  const request = await reqWithDate({ tglStr: tgl });
  const result = await request.query(`
    DECLARE @tgl DATE = CAST(@tglStr AS DATE);
    DECLARE @hk INT = DAY(@tgl);

    SELECT GG.NoMeja AS noMeja, GG.NamaMeja AS meja, D.Singkatan AS singkatan,
           D.TonRacip AS ton, @hk AS hk, F.TonRacip AS bulanBerjalan,
           ROUND(CASE WHEN @hk = 0 THEN 0 ELSE F.TonRacip / @hk END, 4) AS rataRata
    FROM (SELECT NoMeja AS no_urut FROM MstMesinSawmill WHERE IdGroupMesinSawmill = 1 AND Enable = 1) A
    INNER JOIN MstMesinSawmill GG ON GG.NoMeja = A.no_urut
    LEFT JOIN (
      SELECT X.NoMeja, X.Singkatan,
             CASE WHEN X.NoMeja <> ${NO_MEJA_SLP_BATANG} THEN X.TonRacip ELSE X.JlhBatangRajang END AS TonRacip
      FROM (
        SELECT A.NoMeja, C.Singkatan, SUM(JlhBatangRajang) AS JlhBatangRajang,
               SUM(${ST_TON_FLOOR}) AS TonRacip
        FROM STSawmill_h A
        LEFT JOIN KayuBulat_h B ON B.NoKayuBulat = A.NoKayuBulat
        LEFT JOIN MstJenisKayu C ON C.IdJenisKayu = B.IdJenisKayu
        LEFT JOIN STSawmill_d D ON D.NoSTSawmill = A.NoSTSawmill
        LEFT JOIN STSawmillKG_d E ON E.NoUrut = D.NoUrut AND E.NoSTSawmill = D.NoSTSawmill
        LEFT JOIN MstGradeKB F ON F.IdGradeKB = E.IdGradeKB
        LEFT JOIN MstUOM G ON G.IdUOM = D.IdUOMTblLebar
        FULL JOIN MstSawmillSpecialCondition H ON H.IdSawmillSpecialCondition = A.IdSawmillSpecialCondition
        WHERE A.TglSawmill = @tgl AND B.IdPengukuran = ${ID_PENGUKURAN_BERAT}
        GROUP BY A.NoMeja, C.Singkatan
      ) X
    ) D ON D.NoMeja = A.no_urut
    LEFT JOIN (
      SELECT Z1.NoMeja, CASE WHEN Z1.NoMeja <> ${NO_MEJA_SLP_BATANG} THEN Z1.TonRacip ELSE Z1.JlhBatangRajang END AS TonRacip
      FROM (
        SELECT A.NoMeja, SUM(JlhBatangRajang) AS JlhBatangRajang, SUM(${ST_TON_FLOOR}) AS TonRacip
        FROM STSawmill_h A
        LEFT JOIN KayuBulat_h B ON B.NoKayuBulat = A.NoKayuBulat
        LEFT JOIN MstJenisKayu C ON C.IdJenisKayu = B.IdJenisKayu
        LEFT JOIN STSawmill_d D ON D.NoSTSawmill = A.NoSTSawmill
        LEFT JOIN MstUOM E ON E.IdUOM = D.IdUOMTblLebar
        FULL JOIN MstSawmillSpecialCondition F ON F.IdSawmillSpecialCondition = A.IdSawmillSpecialCondition
        WHERE A.TglSawmill > DATEFROMPARTS(YEAR(@tgl), MONTH(@tgl), 1) AND A.TglSawmill < @tgl
        GROUP BY A.NoMeja
      ) Z1
    ) F ON F.NoMeja = A.no_urut
    ORDER BY GG.NamaMeja
  `);

  const mesin = result.recordset.map((r) => ({
    ...r,
    satuan: r.noMeja === NO_MEJA_SLP_BATANG ? "BTG" : "TON",
  }));
  const totalTon = mesin
    .filter((r) => r.noMeja !== NO_MEJA_SLP_BATANG)
    .reduce((sum, r) => sum + Number(r.ton || 0), 0);
  return { mesin, totalTon };
};

/**
 * LoadData5 — produktivitas Ban Saw per meja 1..10 (PL, JTG, RB).
 * HK dan rata-rata dengan aturan yang sama seperti produktivitasSlp.
 */
const produktivitasBansaw = async (tgl) => {
  const request = await reqWithDate({ tglStr: tgl });
  const result = await request.query(`
    DECLARE @tgl DATE = CAST(@tglStr AS DATE);
    DECLARE @hk INT = DAY(@tgl);

    SELECT GG.NoMeja AS noMeja, GG.NamaMeja AS meja,
           B.Singkatan AS plSingkatan, B.TonRacip AS plTon,
           C.Singkatan AS jtgSingkatan, C.TonRacip AS jtgTon,
           D.Singkatan AS rbSingkatan, D.TonRacip AS rbTon,
           COALESCE(B.TonRacip, 0) + COALESCE(C.TonRacip, 0) + COALESCE(D.TonRacip, 0) AS total,
           @hk AS hk, F.TonRacip AS bulanBerjalan,
           ROUND(CASE WHEN @hk = 0 THEN 0 ELSE F.TonRacip / @hk END, 4) AS rataRata
    FROM (VALUES (1), (2), (3), (4), (5), (6), (7), (8), (9), (10)) A(no_urut)
    INNER JOIN MstMesinSawmill GG ON GG.NoMeja = A.no_urut
    LEFT JOIN (
      SELECT A.NoMeja, C.Singkatan, SUM(${ST_TON_FLOOR}) AS TonRacip
      FROM STSawmill_h A
      INNER JOIN KayuBulat_h B ON B.NoKayuBulat = A.NoKayuBulat
      INNER JOIN MstJenisKayu C ON C.IdJenisKayu = B.IdJenisKayu
      INNER JOIN STSawmill_d D ON D.NoSTSawmill = A.NoSTSawmill
      INNER JOIN MstUOM E ON E.IdUOM = D.IdUOMTblLebar
      FULL JOIN MstSawmillSpecialCondition F ON F.IdSawmillSpecialCondition = A.IdSawmillSpecialCondition
      WHERE A.TglSawmill = @tgl AND C.Singkatan LIKE '%PL%'
      GROUP BY A.NoMeja, C.Singkatan
    ) B ON B.NoMeja = A.no_urut
    LEFT JOIN (
      SELECT A.NoMeja, CASE WHEN C.Singkatan = 'JB' THEN 'JTG' ELSE C.Singkatan END AS Singkatan,
             SUM(${ST_TON_FLOOR}) AS TonRacip
      FROM STSawmill_h A
      INNER JOIN KayuBulat_h B ON B.NoKayuBulat = A.NoKayuBulat
      INNER JOIN MstJenisKayu C ON C.IdJenisKayu = B.IdJenisKayu
      INNER JOIN STSawmill_d D ON D.NoSTSawmill = A.NoSTSawmill
      INNER JOIN MstUOM E ON E.IdUOM = D.IdUOMTblLebar
      FULL JOIN MstSawmillSpecialCondition F ON F.IdSawmillSpecialCondition = A.IdSawmillSpecialCondition
      WHERE A.TglSawmill = @tgl AND B.IdPengukuran <> ${ID_PENGUKURAN_BERAT}
        AND (C.Singkatan LIKE '%JB%' OR C.Singkatan LIKE '%JTG%')
      GROUP BY A.NoMeja, CASE WHEN C.Singkatan = 'JB' THEN 'JTG' ELSE C.Singkatan END
    ) C ON C.NoMeja = A.no_urut
    LEFT JOIN (
      SELECT A.NoMeja, C.Singkatan, SUM(${ST_TON_FLOOR}) AS TonRacip
      FROM STSawmill_h A
      INNER JOIN KayuBulat_h B ON B.NoKayuBulat = A.NoKayuBulat
      INNER JOIN MstJenisKayu C ON C.IdJenisKayu = B.IdJenisKayu
      INNER JOIN STSawmill_d D ON D.NoSTSawmill = A.NoSTSawmill
      INNER JOIN STSawmillKG_d E ON E.NoUrut = D.NoUrut AND E.NoSTSawmill = D.NoSTSawmill
      INNER JOIN MstGradeKB F ON F.IdGradeKB = E.IdGradeKB
      INNER JOIN MstUOM G ON G.IdUOM = D.IdUOMTblLebar
      FULL JOIN MstSawmillSpecialCondition H ON H.IdSawmillSpecialCondition = A.IdSawmillSpecialCondition
      WHERE A.TglSawmill = @tgl AND B.IdPengukuran = ${ID_PENGUKURAN_BERAT}
      GROUP BY A.NoMeja, C.Singkatan
    ) D ON D.NoMeja = A.no_urut
    LEFT JOIN (
      SELECT A.NoMeja, SUM(${ST_TON_FLOOR}) AS TonRacip
      FROM STSawmill_h A
      INNER JOIN KayuBulat_h B ON B.NoKayuBulat = A.NoKayuBulat
      INNER JOIN MstJenisKayu C ON C.IdJenisKayu = B.IdJenisKayu
      INNER JOIN STSawmill_d D ON D.NoSTSawmill = A.NoSTSawmill
      INNER JOIN MstUOM E ON E.IdUOM = D.IdUOMTblLebar
      FULL JOIN MstSawmillSpecialCondition F ON F.IdSawmillSpecialCondition = A.IdSawmillSpecialCondition
      WHERE A.TglSawmill > DATEFROMPARTS(YEAR(@tgl), MONTH(@tgl), 1) AND A.TglSawmill < @tgl
      GROUP BY A.NoMeja
    ) F ON F.NoMeja = A.no_urut
    ORDER BY GG.NoMeja
  `);
  return result.recordset;
};

/**
 * LoadData7 / LoadData10 — total rendemen = SUM(ST ton) / SUM(KB ton) * 100.
 * Penerimaan digolongkan lewat teks NoMeja gabungan ("11, 14") dengan LIKE, sama seperti desktop:
 * satu penerimaan yang dipakai beberapa meja digolongkan SLP bila ada satu saja meja SLP.
 * UNION (bukan UNION ALL) dipertahankan: desktop membuang baris KB/ST yang persis sama.
 */
const rendemen = async (kelompok, from, to) => {
  const kondisi =
    kelompok === "SLP"
      ? `(${likeAny("K.NoMeja", MEJA_SLP_UNTUK_SLP)})`
      : `(K.NoMeja IS NOT NULL AND NOT (${likeAny("K.NoMeja", MEJA_SLP_UNTUK_BANSAW)}))`;

  const request = await reqWithDate({ fromStr: from, toStr: to });
  const result = await request.query(`
    DECLARE @from DATE = CAST(@fromStr AS DATE);
    DECLARE @to DATE = CAST(@toStr AS DATE);

    WITH ListMeja AS (
      SELECT A.NoPenerimaanST, NoMeja
      FROM PenerimaanSTSawmill_h A
      INNER JOIN KayuBulat_h B ON B.NoKayuBulat = A.NoKayuBulat
      INNER JOIN PenerimaanSTSawmill_d C ON C.NoPenerimaanST = A.NoPenerimaanST
      INNER JOIN STSawmill_h D ON D.NoSTSawmill = C.NoSTSawmill
      WHERE B.IdPengukuran = ${ID_PENGUKURAN_BERAT} AND A.TglLaporan >= @from AND A.TglLaporan <= @to
      GROUP BY A.NoPenerimaanST, NoMeja
    ),
    Pen AS (
      SELECT A.NoPenerimaanST
      FROM PenerimaanSTSawmill_h A
      INNER JOIN KayuBulat_h B ON B.NoKayuBulat = A.NoKayuBulat
      INNER JOIN MstSupplier C ON C.IdSupplier = B.IdSupplier
      INNER JOIN KayuBulatKG_d D ON D.NoKayuBulat = A.NoKayuBulat
      INNER JOIN MstGradeKB E ON E.IdGradeKB = D.IdGradeKB
      INNER JOIN MstJenisKayu F ON F.IdJenisKayu = B.IdJenisKayu
      WHERE B.IdPengukuran = ${ID_PENGUKURAN_BERAT} AND A.TglLaporan >= @from AND A.TglLaporan <= @to
      GROUP BY A.NoPenerimaanST
    ),
    Kel AS (
      SELECT P.NoPenerimaanST,
             STUFF((SELECT ', ' + CAST(L.NoMeja AS VARCHAR) FROM ListMeja L
                    WHERE L.NoPenerimaanST = P.NoPenerimaanST GROUP BY L.NoMeja FOR XML PATH('')), 1, 2, '') AS NoMeja
      FROM Pen P
    )
    SELECT SUM(U.KBTon) AS kbTon, SUM(U.STTon) AS stTon,
           ROUND(SUM(U.STTon) / NULLIF(SUM(U.KBTon), 0) * 100, 2) AS persen
    FROM (
      SELECT 1 AS InOut, A.NoPenerimaanST,
             CASE WHEN D.Harga IS NULL THEN E.NamaGrade ELSE E.NamaGrade + '-' + CAST(D.Harga AS VARCHAR) END AS NamaGrade,
             D.Harga, D.JmlhBatang, (D.Berat / 1000) AS KBTon, NULL AS STTon
      FROM PenerimaanSTSawmill_h A
      INNER JOIN KayuBulat_h B ON B.NoKayuBulat = A.NoKayuBulat
      INNER JOIN MstSupplier C ON C.IdSupplier = B.IdSupplier
      INNER JOIN KayuBulatKG_d D ON D.NoKayuBulat = A.NoKayuBulat
      INNER JOIN MstGradeKB E ON E.IdGradeKB = D.IdGradeKB
      INNER JOIN MstJenisKayu F ON F.IdJenisKayu = B.IdJenisKayu
      WHERE B.IdPengukuran = ${ID_PENGUKURAN_BERAT} AND A.TglLaporan >= @from AND A.TglLaporan <= @to
      UNION
      SELECT 0 AS InOut, A.NoPenerimaanST, G.NamaGrade, G.Harga, NULL, NULL,
             CASE WHEN D.IdUOMTblLebar = 3 THEN SUM(ROUND(D.Tebal * D.Lebar * D.Panjang * D.JmlhBatang / 7200.8, 4))
                  WHEN D.IdUOMTblLebar = 1 THEN SUM(ROUND((D.Tebal * D.Lebar * D.Panjang) * 304.8 * D.JmlhBatang / 1000000000 / 1.416, 4))
             END AS STTon
      FROM PenerimaanSTSawmill_h A
      INNER JOIN PenerimaanSTSawmill_d B ON B.NoPenerimaanST = A.NoPenerimaanST
      INNER JOIN STSawmill_h C ON C.NoSTSawmill = B.NoSTSawmill
      INNER JOIN STSawmill_d D ON D.NoSTSawmill = C.NoSTSawmill
      INNER JOIN KayuBulat_h E ON E.NoKayuBulat = A.NoKayuBulat
      INNER JOIN STSawmillKG_d F ON F.NoSTSawmill = D.NoSTSawmill AND F.NoUrut = D.NoUrut
      INNER JOIN MstGradeKB G ON G.IdGradeKB = F.IdGradeKB
      WHERE E.IdPengukuran = ${ID_PENGUKURAN_BERAT} AND A.TglLaporan >= @from AND A.TglLaporan <= @to
      GROUP BY A.NoPenerimaanST, E.IdSupplier, G.NamaGrade, D.IdUOMTblLebar, G.Harga
    ) U
    INNER JOIN Kel K ON K.NoPenerimaanST = U.NoPenerimaanST
    WHERE ${kondisi}
  `);
  const row = result.recordset[0] || {};
  return { kbTon: row.kbTon ?? 0, stTon: row.stTon ?? 0, persen: row.persen ?? 0 };
};

/** Batas baris daftar rendemen per truk — mengikuti desktop (Header = SLP, Header2 = Ban Saw). */
const LIMIT_DAFTAR = { SLP: 21, BANSAW: 12 };

/**
 * Header / Header2 — rendemen per supplier-truk-tanggal, 6 bulan ke belakang sampai @to,
 * terbaru di atas. Urutan memakai MAX(TglLaporan) (desktop mengurai teks nama supplier).
 *
 * Dua varian sengaja berbeda, mengikuti desktop:
 *  - SLP   : penggolongan per meja (satu baris per NoMeja). Penerimaan yang dipakai >1 meja SLP
 *            ikut terhitung berkali-kali, jadi hanya persen yang ditampilkan, bukan ton.
 *            Supplier asal kayu dipakai hanya bila tidak NULL ('LIKE %' %' tidak pernah cocok).
 *  - BANSAW: penggolongan dari teks NoMeja gabungan; supplier asal kosong = NULL atau 0/''.
 */
const rendemenDaftar = async (kelompok, to) => {
  const slp = kelompok === "SLP";
  const asalKosong = slp
    ? "B.IdSupplierAsalKayu IS NULL OR B.IdSupplierAsalKayu LIKE '% %'"
    : "B.IdSupplierAsalKayu IS NULL OR B.IdSupplierAsalKayu = ''";
  const window = "A.TglLaporan <= @to AND A.TglLaporan >= DATEADD(MONTH, -6, @to)";

  const ketSql = slp
    ? `SELECT Z1.NoPenerimaanST,
              CASE WHEN ${likeAny("Z1.NoMeja", MEJA_SLP_UNTUK_SLP)} THEN 'SLP' ELSE 'BANSAW' END AS Ket
       FROM #ListMeja Z1
       GROUP BY Z1.NoPenerimaanST, Z1.NoMeja`
    : `SELECT P.NoPenerimaanST,
              CASE WHEN ${likeAny("P.NoMeja", MEJA_SLP_UNTUK_BANSAW)} THEN 'SLP'
                   WHEN P.NoMeja IS NULL THEN NULL ELSE 'BANSAW' END AS Ket
       FROM (
         SELECT Q.NoPenerimaanST,
                STUFF((SELECT ', ' + CAST(L.NoMeja AS VARCHAR) FROM #ListMeja L
                       WHERE L.NoPenerimaanST = Q.NoPenerimaanST GROUP BY L.NoMeja FOR XML PATH('')), 1, 2, '') AS NoMeja
         FROM (
           SELECT A.NoPenerimaanST
           FROM PenerimaanSTSawmill_h A
           INNER JOIN KayuBulat_h B ON B.NoKayuBulat = A.NoKayuBulat
           INNER JOIN MstSupplier C ON C.IdSupplier = B.IdSupplier
           INNER JOIN KayuBulatKG_d D ON D.NoKayuBulat = A.NoKayuBulat
           INNER JOIN MstGradeKB E ON E.IdGradeKB = D.IdGradeKB
           INNER JOIN MstJenisKayu F ON F.IdJenisKayu = B.IdJenisKayu
           WHERE B.IdPengukuran = ${ID_PENGUKURAN_BERAT} AND ${window}
           GROUP BY A.NoPenerimaanST
         ) Q
       ) P`;

  const request = await reqWithDate({ toStr: to });
  const result = await request.query(`
    DECLARE @to DATE = CAST(@toStr AS DATE);

    IF OBJECT_ID('tempdb..#ListMeja') IS NOT NULL DROP TABLE #ListMeja;
    SELECT A.NoPenerimaanST, D.NoMeja
    INTO #ListMeja
    FROM PenerimaanSTSawmill_h A
    INNER JOIN KayuBulat_h B ON B.NoKayuBulat = A.NoKayuBulat
    INNER JOIN PenerimaanSTSawmill_d C ON C.NoPenerimaanST = A.NoPenerimaanST
    INNER JOIN STSawmill_h D ON D.NoSTSawmill = C.NoSTSawmill
    WHERE B.IdPengukuran = ${ID_PENGUKURAN_BERAT} AND ${window}
    GROUP BY A.NoPenerimaanST, D.NoMeja;

    IF OBJECT_ID('tempdb..#Ket') IS NOT NULL DROP TABLE #Ket;
    IF OBJECT_ID('tempdb..#Nama') IS NOT NULL DROP TABLE #Nama;

    SELECT * INTO #Ket FROM (${ketSql}) KK;

    SELECT * INTO #Nama FROM (
        SELECT A.NoPenerimaanST,
               (CASE WHEN ${asalKosong} THEN C.NmSupplier ELSE G.NmSupplier + ' (' + C.NmSupplier + ')' END
                + ' (' + CONVERT(VARCHAR(5), B.NoTruk) + ') '
                + ' (' + CONVERT(VARCHAR(5), A.TglLaporan, 103) + ')') AS NmSupplier
        FROM PenerimaanSTSawmill_h A
        INNER JOIN KayuBulat_h B ON B.NoKayuBulat = A.NoKayuBulat
        INNER JOIN MstSupplier C ON C.IdSupplier = B.IdSupplier
        ${slp ? "" : `INNER JOIN KayuBulatKG_d D ON D.NoKayuBulat = A.NoKayuBulat
        INNER JOIN MstGradeKB E ON E.IdGradeKB = D.IdGradeKB
        INNER JOIN MstJenisKayu F ON F.IdJenisKayu = B.IdJenisKayu`}
        LEFT JOIN MstSupplier G ON G.IdSupplier = B.IdSupplierAsalKayu
        WHERE B.IdPengukuran = ${ID_PENGUKURAN_BERAT} AND ${window}
        GROUP BY A.NoPenerimaanST, B.IdSupplierAsalKayu, C.NmSupplier, G.NmSupplier, B.NoTruk, A.TglLaporan
    ) NN;

    SELECT TOP ${LIMIT_DAFTAR[kelompok]} AAA.NmSupplier AS nmSupplier,
           ROUND(SUM(AAA.STTon) / NULLIF(SUM(AAA.KBTon), 0) * 100, 2) AS persen
    FROM (
      SELECT U.NoPenerimaanST, U.TglLaporan, Z3.NmSupplier, U.KBTon, U.STTon, Z2.Ket
      FROM (
        SELECT 1 AS InOut, A.NoPenerimaanST, A.TglLaporan,
               CASE WHEN D.Harga IS NULL THEN E.NamaGrade ELSE E.NamaGrade + '-' + CAST(D.Harga AS VARCHAR) END AS NamaGrade,
               D.Harga, D.JmlhBatang, (D.Berat / 1000) AS KBTon, NULL AS STTon
        FROM PenerimaanSTSawmill_h A
        INNER JOIN KayuBulat_h B ON B.NoKayuBulat = A.NoKayuBulat
        INNER JOIN MstSupplier C ON C.IdSupplier = B.IdSupplier
        INNER JOIN KayuBulatKG_d D ON D.NoKayuBulat = A.NoKayuBulat
        INNER JOIN MstGradeKB E ON E.IdGradeKB = D.IdGradeKB
        INNER JOIN MstJenisKayu F ON F.IdJenisKayu = B.IdJenisKayu
        WHERE B.IdPengukuran = ${ID_PENGUKURAN_BERAT} AND ${window}
        UNION
        SELECT 0 AS InOut, A.NoPenerimaanST, A.TglLaporan, G.NamaGrade, G.Harga, NULL, NULL,
               CASE WHEN D.IdUOMTblLebar = 3 THEN SUM(ROUND(D.Tebal * D.Lebar * D.Panjang * D.JmlhBatang / 7200.8, 4))
                    WHEN D.IdUOMTblLebar = 1 THEN SUM(ROUND((D.Tebal * D.Lebar * D.Panjang) * 304.8 * D.JmlhBatang / 1000000000 / 1.416, 4))
               END AS STTon
        FROM PenerimaanSTSawmill_h A
        INNER JOIN PenerimaanSTSawmill_d B ON B.NoPenerimaanST = A.NoPenerimaanST
        INNER JOIN STSawmill_h C ON C.NoSTSawmill = B.NoSTSawmill
        INNER JOIN STSawmill_d D ON D.NoSTSawmill = C.NoSTSawmill
        INNER JOIN KayuBulat_h E ON E.NoKayuBulat = A.NoKayuBulat
        INNER JOIN STSawmillKG_d F ON F.NoSTSawmill = D.NoSTSawmill AND F.NoUrut = D.NoUrut
        INNER JOIN MstGradeKB G ON G.IdGradeKB = F.IdGradeKB
        WHERE E.IdPengukuran = ${ID_PENGUKURAN_BERAT} AND ${window}
        GROUP BY A.NoPenerimaanST, A.TglLaporan, E.IdSupplier, G.NamaGrade, D.IdUOMTblLebar, G.Harga
      ) U
      LEFT JOIN #Ket Z2 ON Z2.NoPenerimaanST = U.NoPenerimaanST
      LEFT JOIN #Nama Z3 ON Z3.NoPenerimaanST = U.NoPenerimaanST
      WHERE Z2.Ket = '${slp ? "SLP" : "BANSAW"}'
    ) AAA
    GROUP BY AAA.NmSupplier
    ORDER BY MAX(AAA.TglLaporan) DESC, AAA.NmSupplier
    OPTION (RECOMPILE);

    DROP TABLE #Ket;
    DROP TABLE #Nama;
    DROP TABLE #ListMeja;
  `);
  return { limit: LIMIT_DAFTAR[kelompok], items: result.recordset };
};

/**
 * LoadData — realisasi kayu bulat masuk (BB) per jenis vs target bulanan.
 * - Target = MstTargetKayuBulat periode bulan dari `awal`; Kurang = BB - target bulan.
 * - BB dihitung dari `awal` s.d. `akhir` (DateCreate, batas akhir inklusif pada tengah malam), tanpa supplier 7234.
 * - TGT (hari kerja bulan itu) = hari bukan Minggu dan bukan Holiday. Minggu dideteksi lewat
 *   DATEDIFF (bebas bahasa server), bukan DATENAME('Sunday') seperti desktop.
 */
const bahanBaku = async (awal, akhir) => {
  const request = await reqWithDate({ awalStr: awal, akhirStr: akhir });
  const result = await request.query(`
    DECLARE @awal DATE = CAST(@awalStr AS DATE);
    DECLARE @akhir DATE = CAST(@akhirStr AS DATE);
    DECLARE @first DATE = DATEFROMPARTS(YEAR(@awal), MONTH(@awal), 1);
    DECLARE @last DATE = EOMONTH(@awal);

    WITH Hari AS (
      SELECT @first AS Tanggal
      UNION ALL
      SELECT DATEADD(DAY, 1, Tanggal) FROM Hari WHERE Tanggal < @last
    )
    SELECT A.Jenis AS jenis, A.Singkatan AS singkatan,
           (CASE WHEN BB IS NULL THEN 0 ELSE BB END) AS bb,
           A.TargetHarian AS tgtBulan, C.TGT AS tgt,
           A.TargetHarian / NULLIF(C.TGT, 0) AS targetHarian,
           ROUND((CASE WHEN BB IS NULL THEN 0 ELSE BB END) - (A.TargetHarian), 2) AS kurang
    FROM (
      SELECT Jenis, SUM(TargetHarian) AS TargetHarian, Singkatan
      FROM (
        SELECT GA.Jenis, GB.TargetTon AS TargetHarian, GA.Singkatan
        FROM (
          SELECT CASE WHEN A.[Group] LIKE '%JABON%' THEN 'JABON' ELSE A.[Group] END AS Jenis,
                 A.TargetHarian,
                 CASE WHEN B.Singkatan LIKE '%JTG%' THEN 'JB'
                      WHEN B.Singkatan LIKE '%JMR%' THEN 'JB'
                      WHEN B.Singkatan LIKE '%JBM%' THEN 'JB'
                      ELSE B.Singkatan END AS Singkatan
          FROM MstGroupJenisKayu A
          INNER JOIN MstJenisKayu B ON B.IdGroup = A.IdGroup
          WHERE A.Enable = 1 AND B.Enable = 1
            AND (TargetHarian <> NULL OR TargetHarian <> 0)
          GROUP BY A.[Group], A.TargetHarian, B.Singkatan
        ) GA
        LEFT JOIN (
          SELECT NamaGroup, TargetTon
          FROM MstTargetKayuBulat A
          LEFT JOIN MstTargetGroupingKayu_h B ON B.IdTargetGroupingKayu = A.IdTargetGroupingKayu
          WHERE MONTH(A.Periode) = MONTH(@awal) AND YEAR(A.Periode) = YEAR(@awal)
        ) GB ON GB.NamaGroup = GA.Jenis
      ) z
      GROUP BY Jenis, Singkatan
    ) A
    LEFT JOIN (
      SELECT Jenis, Singkatan, SUM(BB) AS BB
      FROM (
        SELECT CASE WHEN Jenis LIKE '%JABON%' THEN 'JABON' ELSE Jenis END AS Jenis,
               CASE WHEN E.Singkatan LIKE '%JTG%' THEN 'JB'
                    WHEN E.Singkatan LIKE '%JMR%' THEN 'JB'
                    ELSE E.Singkatan END AS Singkatan,
               ROUND(SUM(CASE WHEN Singkatan = 'RB' THEN (FLOOR(D.Berat) / 1000)
                              ELSE (FLOOR(B.Tebal * B.Lebar * B.Panjang * 1.38873458504611) / 10000) END), 2) AS BB
        FROM KayuBulat_h A
        LEFT JOIN KayuBulat_d B ON B.NoKayuBulat = A.NoKayuBulat
        LEFT JOIN KayuBulatKG_h C ON C.NoKayuBulat = A.NoKayuBulat
        LEFT JOIN KayuBulatKG_d D ON D.NoKayuBulat = A.NoKayuBulat
        LEFT JOIN MstJenisKayu E ON E.IdJenisKayu = A.IdJenisKayu
        WHERE A.DateCreate >= @awal AND A.DateCreate <= @akhir
          AND A.IdSupplier != ${ID_SUPPLIER_DIKECUALIKAN}
        GROUP BY Jenis, IdGroup, Singkatan
      ) Z
      GROUP BY Jenis, Singkatan
    ) B ON B.Jenis = A.Jenis
    CROSS JOIN (
      SELECT COUNT(*) AS TGT
      FROM Hari H
      WHERE (DATEDIFF(DAY, 0, H.Tanggal) % 7) <> 6
        AND NOT EXISTS (SELECT 1 FROM Holiday X WHERE X.Tgl = H.Tanggal)
    ) C
    OPTION (MAXRECURSION 31)
  `);
  return result.recordset;
};

/**
 * LoadData12 (+ status hari terpilih dari LoadData4) — status 10 ruang KD dari tgl 1 bulan itu
 * sampai `tgl`: nilai pada tanggal terpilih ('>JB-25' masuk, '<JB-25' keluar, 'JB-25' berjalan, '' kosong),
 * lama kondisi terakhir (totalHari) dan jumlah hari kosong bulan berjalan.
 * Berbeda dengan LoadData4: tidak ada aturan kosmetik "SR" untuk ruang 2.
 */
const kd = async (tgl) => {
  const request = await reqWithDate({ tglStr: tgl });
  const result = await request.query(`
    DECLARE @StartDate DATE = DATEFROMPARTS(YEAR(CAST(@tglStr AS DATE)), MONTH(CAST(@tglStr AS DATE)), 1);
    DECLARE @EndDate DATE = CAST(@tglStr AS DATE);

    IF OBJECT_ID('tempdb..#DataHarian') IS NOT NULL DROP TABLE #DataHarian;

    WITH DateCTE AS (
      SELECT @StartDate AS Tanggal
      UNION ALL
      SELECT DATEADD(DAY, 1, Tanggal) FROM DateCTE WHERE DATEADD(DAY, 1, Tanggal) <= @EndDate
    )
    SELECT t.Tanggal,
             'KD ' + RIGHT('0' + CAST(r.RoomNumber AS VARCHAR(2)), 2) AS Seleksi_1_Isi,
             LTRIM(RTRIM(CASE
               WHEN MAX(kd.TglMasuk) = t.Tanggal THEN '>' + MAX(jk.Singkatan) + '-' + MAX(CAST(std.Tebal AS VARCHAR(20)))
               WHEN MAX(kd.TglKeluar) = t.Tanggal THEN '<' + MAX(jk.Singkatan) + '-' + MAX(CAST(std.Tebal AS VARCHAR(20)))
               WHEN MAX(kd.TglMasuk) < ISNULL(MAX(kd.TglKeluar), '9999-12-31') AND t.Tanggal < ISNULL(MAX(kd.TglKeluar), '9999-12-31')
                 THEN MAX(jk.Singkatan) + '-' + MAX(CAST(std.Tebal AS VARCHAR(20)))
               WHEN MAX(kd.TglMasuk) <= GETDATE() AND MAX(kd.TglKeluar) IS NULL AND t.Tanggal <= GETDATE()
                 THEN MAX(jk.Singkatan) + '-' + MAX(CAST(std.Tebal AS VARCHAR(20)))
               ELSE ''
             END)) AS ValueNya
    INTO #DataHarian
    FROM DateCTE t
    CROSS JOIN (VALUES (1),(2),(3),(4),(5),(6),(7),(8),(9),(10)) AS r(RoomNumber)
    LEFT JOIN KD_h kd ON kd.NoRuangKD = r.RoomNumber
      AND (kd.TglMasuk <= t.Tanggal AND (kd.TglKeluar IS NULL OR kd.TglKeluar >= t.Tanggal))
    LEFT JOIN KD_d kdd ON kd.NoProcKD = kdd.NoProcKD
    LEFT JOIN ST_H sth ON kdd.NoST = sth.NoST
    LEFT JOIN ST_d std ON sth.NoST = std.NoST
    LEFT JOIN MstJenisKayu jk ON sth.IdJenisKayu = jk.IdJenisKayu
    GROUP BY t.Tanggal, r.RoomNumber
    OPTION (MAXRECURSION 366);

    WITH Cleaned AS (
      SELECT *,
             CASE WHEN LAG(ValueNya) OVER (PARTITION BY Seleksi_1_Isi ORDER BY Tanggal) = ValueNya THEN 0 ELSE 1 END AS IsNewGroup
      FROM #DataHarian
    ),
    Grouped AS (
      SELECT *,
             SUM(IsNewGroup) OVER (PARTITION BY Seleksi_1_Isi ORDER BY Tanggal ROWS UNBOUNDED PRECEDING) AS GroupID
      FROM Cleaned
    ),
    Summary AS (
      SELECT Seleksi_1_Isi, MAX(Tanggal) AS LastTanggal, MAX(ValueNya) AS LastValue, COUNT(*) AS TotalHari
      FROM Grouped
      GROUP BY Seleksi_1_Isi, GroupID
    ),
    LatestSummary AS (
      SELECT *
      FROM (
        SELECT *, ROW_NUMBER() OVER (PARTITION BY Seleksi_1_Isi ORDER BY LastTanggal DESC) AS rn
        FROM Summary
      ) x
      WHERE rn = 1
    ),
    TotalKosong AS (
      SELECT Seleksi_1_Isi, COUNT(*) AS TotalKosong
      FROM #DataHarian
      WHERE ISNULL(NULLIF(ValueNya, ''), '[KOSONG]') = '[KOSONG]'
      GROUP BY Seleksi_1_Isi
    )
    SELECT l.Seleksi_1_Isi AS ruang,
           (SELECT TOP 1 d.ValueNya FROM #DataHarian d WHERE d.Seleksi_1_Isi = l.Seleksi_1_Isi AND d.Tanggal = @EndDate) AS nilai,
           ISNULL(NULLIF(l.LastValue, ''), '[KOSONG]') AS lastValue,
           CASE WHEN l.LastValue = '' THEN 1 ELSE 0 END AS kosong,
           l.TotalHari AS totalHari,
           ISNULL(tk.TotalKosong, 0) AS totalKosong
    FROM LatestSummary l
    LEFT JOIN TotalKosong tk ON l.Seleksi_1_Isi = tk.Seleksi_1_Isi
    ORDER BY l.Seleksi_1_Isi;

    DROP TABLE #DataHarian;
  `);
  return result.recordset.map((r) => ({ ...r, kosong: Boolean(r.kosong) }));
};

/** Pecah teks daftar KB ("SUPP : x\rNoKB : y" dipisah baris kosong) menjadi array. */
const parseDaftarKb = (teks) =>
  String(teks || "")
    .split(/\r\r+|\r\n\r\n+/)
    .map((blok) => blok.split(/\r\n|\r|\n/).map((b) => b.trim()).filter(Boolean))
    .filter((baris) => baris.length > 0)
    .map((baris) => ({
      supplier: (baris.find((b) => b.startsWith("SUPP :")) || "").replace(/^SUPP :\s*/, ""),
      noKayuBulat: (baris.find((b) => b.startsWith("NoKB :")) || "").replace(/^NoKB :\s*/, ""),
    }));

const statusUt = (jenis, ut) => {
  const a = AMBANG_UT.find((x) => x.jenis.includes(jenis));
  if (!a) return "normal";
  if (ut >= a.bahaya) return "bahaya";
  if (ut > a.peringatan && ut < a.bahaya) return "peringatan";
  return "normal";
};

/**
 * LoadData2 — saldo kayu bulat per jenis pada tanggal `tgl` + umur kayu.
 *  - Saldo awal: KB dibuat sebelum tgl+0 (DateCreate < tgl) dan belum terpakai / terpakai sejak tgl,
 *    tanpa supplier 7234. JABON & PULAI dari kubikasi, RAMBUNG (RB) dari berat. Hanya jenis berkelompok target.
 *  - UT (Umur Tunggu) = hari dari DateCreate KB tertua yang belum diracip sampai tgl.
 *  - UR (Umur Racip)  = hari dari tanggal racip KB tertua yang masih diracip sampai tgl.
 *  - utDaftar/urDaftar = KB yang menyebabkan nilai tertinggi (untuk tooltip).
 * SQL mengikuti desktop apa adanya (termasuk join yang bisa menggandakan baris saldo bila jenis
 * ganda di MstJenisKayu/MstTargetGroupingKayu_d); tanggal tunggal menggantikan #tempdays.
 */
const saldoKb = async (tgl) => {
  const request = await reqWithDate({ tglStr: tgl });
  const result = await request.query(`
    DECLARE @StartDate DATE = CAST(@tglStr AS DATE);
    DECLARE @EndDate DATE = DATEADD(DAY, 1, @StartDate);
    DECLARE @EndDate2 DATE = @StartDate;

    IF OBJECT_ID('tempdb..#tempumurkayu') IS NOT NULL DROP TABLE #tempumurkayu;
    CREATE TABLE #tempumurkayu (
      DateCreate DATE, NoKayuBulat VARCHAR(50), Jenis VARCHAR(50), Singkatan VARCHAR(50), NmSupplier VARCHAR(50),
      TanggalRacip DATE, TanggalSelesaiRacip DATE, DateUsage DATE
    );
    INSERT INTO #tempumurkayu (DateCreate, NoKayuBulat, Jenis, Singkatan, NmSupplier, TanggalRacip, TanggalSelesaiRacip, DateUsage)
    SELECT uKayu.* FROM (
      SELECT A.DateCreate, A.NoKayuBulat, A.Jenis, A.Singkatan, A.NmSupplier, B.TanggalRacip, C.TanggalSelesaiRacip, A.DateUsage
      FROM (
        SELECT A.DateUsage, A.NoKayuBulat, A.DateCreate, B.Jenis, B.Singkatan, C.NmSupplier
        FROM KayuBulat_h A
        INNER JOIN MstJenisKayu B ON B.IdJenisKayu = A.IdJenisKayu
        INNER JOIN MstSupplier C ON C.IdSupplier = A.IdSupplier
        INNER JOIN KayuBulat_d D ON D.NoKayuBulat = A.NoKayuBulat
        GROUP BY A.NoKayuBulat, A.DateCreate, A.DateUsage, B.Jenis, B.Singkatan, C.NmSupplier
        UNION
        SELECT A.DateUsage, A.NoKayuBulat, A.DateCreate, B.Jenis, B.Singkatan, C.NmSupplier
        FROM KayuBulat_h A
        INNER JOIN MstJenisKayu B ON B.IdJenisKayu = A.IdJenisKayu
        INNER JOIN MstSupplier C ON C.IdSupplier = A.IdSupplier
        INNER JOIN KayuBulatKG_d D ON D.NoKayuBulat = A.NoKayuBulat
        GROUP BY A.NoKayuBulat, A.DateCreate, A.DateUsage, B.Jenis, B.Singkatan, C.NmSupplier
      ) A
      LEFT JOIN (SELECT NoKayuBulat, MIN(TglSawmill) AS TanggalRacip FROM STSawmill_h GROUP BY NoKayuBulat) B
        ON B.NoKayuBulat = A.NoKayuBulat
      LEFT JOIN (SELECT NoKayuBulat, MAX(TglSawmill) AS TanggalSelesaiRacip FROM STSawmill_h GROUP BY NoKayuBulat) C
        ON C.NoKayuBulat = A.NoKayuBulat
      WHERE (A.DateUsage IS NULL OR A.DateCreate >= @StartDate AND A.DateCreate <= @EndDate OR A.DateUsage >= @StartDate)
      GROUP BY A.DateUsage, A.NoKayuBulat, A.DateCreate, A.Jenis, A.Singkatan, A.NmSupplier, B.TanggalRacip, C.TanggalSelesaiRacip, A.DateUsage
    ) uKayu;

    WITH MaxHari AS (
      SELECT Jenis, MAX(TES) AS MaxHari FROM (
        SELECT NoKayuBulat, TanggalRacip, Jenis, Singkatan, TanggalSelesaiRacip,
               ROW_NUMBER() OVER (PARTITION BY Singkatan ORDER BY TanggalRacip) AS rn,
               DATEDIFF(DAY, TanggalRacip, @StartDate) AS TES
        FROM (
          SELECT NoKayuBulat, Jenis, Singkatan, TanggalSelesaiRacip, MIN(DateCreate) AS TanggalRacip FROM #tempumurkayu
          WHERE ((TanggalRacip >= @StartDate AND DateCreate <= @StartDate)
              OR (TanggalRacip IS NULL AND DateCreate <= @StartDate))
          GROUP BY NoKayuBulat, Jenis, Singkatan, TanggalSelesaiRacip
        ) A
      ) Z
      GROUP BY Jenis
    ),
    MaxHari2 AS (
      SELECT Jenis, MAX(TES) AS MaxHari FROM (
        SELECT NoKayuBulat, TanggalRacip, Jenis, Singkatan, TanggalSelesaiRacip,
               ROW_NUMBER() OVER (PARTITION BY Singkatan ORDER BY TanggalRacip) AS rn,
               DATEDIFF(DAY, TanggalRacip, @StartDate) AS TES
        FROM (
          SELECT NoKayuBulat, Jenis, Singkatan, TanggalSelesaiRacip, MIN(TanggalRacip) AS TanggalRacip FROM #tempumurkayu
          WHERE ((TanggalSelesaiRacip >= @StartDate AND TanggalRacip <= @StartDate)
              OR (TanggalSelesaiRacip IS NULL AND TanggalRacip <= @StartDate))
          GROUP BY NoKayuBulat, Jenis, Singkatan, TanggalSelesaiRacip
        ) A
      ) Z
      GROUP BY Jenis
    )
    SELECT A.Jenis AS jenis, ROUND(A.SaldoAwal, 2) AS saldoAwal,
           CASE WHEN B.ValueNya IS NULL THEN 0 ELSE B.ValueNya END AS ur,
           CASE WHEN C.ValueNya IS NULL THEN 0 ELSE C.ValueNya END AS ut,
           CASE WHEN B.ValueNya IS NULL OR B.ValueNya = 0 THEN '' ELSE E.NoKayuBulat2 END AS urDaftar,
           CASE WHEN C.ValueNya IS NULL OR C.ValueNya = 0 THEN '' ELSE D.NoKayuBulat END AS utDaftar
    FROM (
      SELECT Jenis, SUM(SaldoAwal) AS SaldoAwal FROM (
        SELECT CASE WHEN B.Jenis IS NULL THEN A.Jenis ELSE B.Jenis END AS Jenis,
               CASE WHEN B.SaldoAwal IS NULL THEN 0 ELSE B.SaldoAwal END AS SaldoAwal
        FROM (SELECT Jenis FROM MstJenisKayu WHERE Jenis IN ('JABON', 'PULAI')) A
        LEFT JOIN (
          SELECT CASE WHEN Jenis LIKE '%JABON%' THEN 'JABON' ELSE Jenis END AS Jenis,
                 SUM(FLOOR(Tebal * Lebar * Panjang * 1.38873458504611) / 10000) AS SaldoAwal
          FROM KayuBulat_h A
          LEFT JOIN MstJenisKayu B ON B.IdJenisKayu = A.IdJenisKayu
          LEFT JOIN KayuBulat_d C ON C.NoKayuBulat = A.NoKayuBulat
          INNER JOIN MstTargetGroupingKayu_d E ON E.IdGroup = B.IdGroup
          WHERE A.DateCreate < @EndDate2 AND (A.DateUsage IS NULL OR A.DateUsage >= @EndDate2)
            AND A.IdSupplier != ${ID_SUPPLIER_DIKECUALIKAN} AND B.Singkatan <> 'RB'
          GROUP BY B.Jenis
        ) B ON B.Jenis = A.Jenis
      ) Z
      GROUP BY Z.Jenis
      UNION ALL
      SELECT Jenis, SUM(FLOOR(E.Berat) / 1000) AS SaldoAwal
      FROM KayuBulat_h A
      LEFT JOIN KayuBulat_d B ON A.NoKayuBulat = B.NoKayuBulat
      LEFT JOIN KayuBulatKG_h D ON A.NoKayuBulat = D.NoKayuBulat
      LEFT JOIN KayuBulatKG_d E ON A.NoKayuBulat = E.NoKayuBulat
      LEFT JOIN MstJenisKayu F ON A.IdJenisKayu = F.IdJenisKayu
      INNER JOIN MstTargetGroupingKayu_d G ON G.IdGroup = F.IdGroup
      WHERE A.DateCreate < @EndDate2 AND (A.DateUsage IS NULL OR A.DateUsage >= @EndDate2)
        AND F.Singkatan = 'RB'
      GROUP BY F.Jenis
    ) A
    LEFT JOIN (
      SELECT a.Jenis AS Seleksi_1,
             DATEDIFF(DAY,
               (SELECT aa.TanggalRacip FROM (
                  SELECT MIN(TanggalRacip) TanggalRacip FROM #tempumurkayu
                  WHERE Jenis = a.Jenis
                    AND ((TanggalSelesaiRacip >= c.Tanggal AND TanggalRacip <= c.Tanggal)
                      OR (TanggalSelesaiRacip IS NULL AND TanggalRacip <= c.Tanggal))
                  GROUP BY TanggalRacip, NoKayuBulat, TanggalSelesaiRacip
                  ORDER BY TanggalRacip, NoKayuBulat, TanggalSelesaiRacip ASC OFFSET 0 ROWS FETCH NEXT 1 ROWS ONLY) aa),
               c.Tanggal) AS ValueNya
      FROM (SELECT @StartDate AS Tanggal) c
      CROSS JOIN (SELECT TanggalRacip, NoKayuBulat, Jenis, Singkatan FROM #tempumurkayu
                  GROUP BY TanggalRacip, NoKayuBulat, Jenis, Singkatan) a
      WHERE c.Tanggal <= GETDATE()
      GROUP BY c.Tanggal, a.Jenis
    ) B ON B.Seleksi_1 = A.Jenis
    LEFT JOIN (
      SELECT a.Jenis AS Seleksi_1,
             DATEDIFF(DAY,
               (SELECT aa.DateCreate FROM (
                  SELECT MIN(DateCreate) DateCreate FROM #tempumurkayu
                  WHERE Jenis = a.Jenis
                    AND ((TanggalRacip >= c.Tanggal AND DateCreate <= c.Tanggal)
                      OR (TanggalRacip IS NULL AND DateCreate <= c.Tanggal))
                  GROUP BY DateCreate
                  ORDER BY DateCreate ASC OFFSET 0 ROWS FETCH NEXT 1 ROWS ONLY) aa),
               c.Tanggal) AS ValueNya
      FROM (SELECT @StartDate AS Tanggal) c
      CROSS JOIN (SELECT DateCreate, NoKayuBulat, Jenis, Singkatan FROM #tempumurkayu
                  GROUP BY DateCreate, NoKayuBulat, Jenis, Singkatan) a
      WHERE c.Tanggal <= GETDATE()
      GROUP BY c.Tanggal, a.Jenis
    ) C ON C.Seleksi_1 = A.Jenis
    LEFT JOIN (
      SELECT Jenis, STRING_AGG(NoKayuBulat, CHAR(13) + CHAR(13)) AS NoKayuBulat FROM (
        SELECT Jenis, 'SUPP : ' + NmSupplier + CHAR(13) + 'NoKB : ' + NoKayuBulat AS NoKayuBulat FROM (
          SELECT Z1.NoKayuBulat, Jenis, Singkatan, NmSupplier FROM (
            SELECT NoKayuBulat, Z.Jenis, Singkatan, TES FROM (
              SELECT NoKayuBulat, Jenis, Singkatan, DATEDIFF(DAY, TanggalRacip, @StartDate) AS TES FROM (
                SELECT NoKayuBulat, Jenis, Singkatan, MIN(DateCreate) AS TanggalRacip FROM #tempumurkayu
                WHERE ((TanggalRacip >= @StartDate AND DateCreate <= @StartDate)
                    OR (TanggalRacip IS NULL AND DateCreate <= @StartDate))
                GROUP BY NoKayuBulat, Jenis, Singkatan
              ) A
            ) Z
            JOIN MaxHari mh ON Z.Jenis = mh.Jenis AND Z.TES = mh.MaxHari
          ) Z1
          LEFT JOIN (
            SELECT A.NoKayuBulat,
                   CASE WHEN C.NmSupplier IS NULL THEN B.NmSupplier + ' ' + CONVERT(VARCHAR(5), NoTruk)
                        ELSE C.NmSupplier + ' (' + B.NmSupplier + ')' + ' ' + CONVERT(VARCHAR(5), NoTruk) END AS NmSupplier,
                   NoTruk
            FROM KayuBulat_h A
            INNER JOIN MstSupplier B ON B.IdSupplier = A.IdSupplier
            INNER JOIN MstSupplier C ON C.IdSupplier = A.IdSupplierAsalKayu
          ) Z2 ON Z2.NoKayuBulat = Z1.NoKayuBulat
        ) TT
        GROUP BY Jenis, 'SUPP : ' + NmSupplier + CHAR(13) + 'NoKB : ' + NoKayuBulat
      ) AA
      GROUP BY Jenis
    ) D ON D.Jenis = A.Jenis
    LEFT JOIN (
      SELECT Jenis, STRING_AGG(NoKayuBulat, CHAR(13) + CHAR(13)) AS NoKayuBulat2 FROM (
        SELECT Jenis, 'SUPP : ' + NmSupplier + CHAR(13) + 'NoKB : ' + NoKayuBulat AS NoKayuBulat FROM (
          SELECT Z1.NoKayuBulat, Jenis, Singkatan, NmSupplier FROM (
            SELECT NoKayuBulat, Z.Jenis, Singkatan, TES FROM (
              SELECT NoKayuBulat, Jenis, Singkatan, DATEDIFF(DAY, TanggalRacip, @StartDate) AS TES FROM (
                SELECT NoKayuBulat, Jenis, Singkatan, MIN(TanggalRacip) AS TanggalRacip FROM #tempumurkayu
                WHERE ((TanggalSelesaiRacip >= @StartDate AND TanggalRacip <= @StartDate)
                    OR (TanggalSelesaiRacip IS NULL AND TanggalRacip <= @StartDate))
                GROUP BY NoKayuBulat, Jenis, Singkatan
              ) A
            ) Z
            JOIN MaxHari2 mh ON Z.Jenis = mh.Jenis AND Z.TES = mh.MaxHari
          ) Z1
          LEFT JOIN (
            SELECT A.NoKayuBulat,
                   CASE WHEN C.NmSupplier IS NULL THEN B.NmSupplier + ' ' + CONVERT(VARCHAR(5), NoTruk)
                        ELSE C.NmSupplier + ' (' + B.NmSupplier + ')' + ' ' + CONVERT(VARCHAR(5), NoTruk) END AS NmSupplier,
                   NoTruk
            FROM KayuBulat_h A
            INNER JOIN MstSupplier B ON B.IdSupplier = A.IdSupplier
            INNER JOIN MstSupplier C ON C.IdSupplier = A.IdSupplierAsalKayu
          ) Z2 ON Z2.NoKayuBulat = Z1.NoKayuBulat
        ) TT
        GROUP BY Jenis, 'SUPP : ' + NmSupplier + CHAR(13) + 'NoKB : ' + NoKayuBulat
      ) AA
      GROUP BY Jenis
    ) E ON E.Jenis = A.Jenis;

    DROP TABLE #tempumurkayu;
  `);

  return result.recordset.map((r) => ({
    jenis: r.jenis,
    saldoAwal: r.saldoAwal,
    ur: Number(r.ur),
    ut: Number(r.ut),
    utStatus: statusUt(r.jenis, Number(r.ut)),
    utDaftar: parseDaftarKb(r.utDaftar),
    urDaftar: parseDaftarKb(r.urDaftar),
  }));
};

module.exports = {
  saldoKb,
  vacuum,
  produktivitasSlp,
  produktivitasBansaw,
  rendemen,
  rendemenDaftar,
  bahanBaku,
  kd,
};
