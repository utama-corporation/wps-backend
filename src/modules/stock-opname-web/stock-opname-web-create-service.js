const sql = require('mssql');
const { poolPromise } = require('../../core/config/db');
const { badReq } = require('../../core/utils/http-error');
const { assertPeriodeTerbuka } = require('../../core/utils/periode-lock');
const { JENIS, getHeader } = require('./stock-opname-web-service');

// Kolom flag di StockOpname_h per kode jenis (paritas FrmStockOpname.vb BtnSimpan_Click).
const HEADER_FLAG = {
  ST: 'IsST',
  S4S: 'IsS4S',
  FJ: 'IsFJ',
  MLD: 'IsMoulding',
  LMT: 'IsLaminating',
  CC: 'IsCCAkhir',
  SND: 'IsSanding',
  BJ: 'IsBJ',
  KB: 'IsKB',
  RC: 'IsRacipan',
};

function clean(v) {
  return String(v ?? '').trim();
}

function toInt(v) {
  const n = Number.parseInt(v, 10);
  return Number.isNaN(n) ? 0 : n;
}

async function riwayat(tx, nip, aktivitas) {
  try {
    await tx
      .request()
      .input('nip', sql.VarChar, clean(nip))
      .input('aktivitas', sql.VarChar, aktivitas)
      .query('INSERT INTO Riwayat ([Nip], [Tgl], [Aktivitas]) VALUES (@nip, GETDATE(), @aktivitas)');
  } catch (e) {
    console.warn('Riwayat stock opname gagal dicatat:', e.message);
  }
}

// ---------- master untuk form Ascend ----------

async function ascendMeta() {
  const pool = await poolPromise;
  const [cat, wh] = await Promise.all([
    pool.request().query(`
      SELECT StockCategoryID, StockCategoryName FROM [AS_RU].[dbo].[IC_StockCategories] ORDER BY StockCategoryName`),
    pool.request().query(`
      SELECT WarehouseID, WarehouseCode + ' - ' + Name AS WarehouseName
      FROM [AS_RU].[dbo].[IC_Warehouses] ORDER BY DisplaySequence, WarehouseID`),
  ]);
  return {
    categories: (cat.recordset || []).map((r) => ({ id: toInt(r.StockCategoryID), name: clean(r.StockCategoryName) })),
    warehouses: (wh.recordset || []).map((r) => ({ id: toInt(r.WarehouseID), name: clean(r.WarehouseName) })),
  };
}

async function ascendFamilyByCategory(categoryId) {
  const id = toInt(categoryId);
  if (!id) throw badReq('Category wajib dipilih.');
  const pool = await poolPromise;
  const r = await pool
    .request()
    .input('CategoryID', sql.Int, id)
    .query(`
      SELECT FamilyID, FamilyName FROM [AS_RU].[dbo].[IC_StockFamily]
      WHERE StockCategoryID = @CategoryID ORDER BY FamilyName`);
  return (r.recordset || []).map((x) => ({ id: toInt(x.FamilyID), name: clean(x.FamilyName) }));
}

// ---------- SO baru ----------

function parseInput(body) {
  const tgl = clean(body?.tgl);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tgl)) throw badReq('Tanggal tidak valid (yyyy-mm-dd).');
  const jenis = [...new Set((Array.isArray(body?.jenis) ? body.jenis : []).map((s) => clean(s).toUpperCase()))].filter(Boolean);
  if (jenis.some((k) => !HEADER_FLAG[k])) throw badReq('Jenis label tidak dikenal.');

  const ascend = body?.ascend ? true : false;
  if (!jenis.length && !ascend) throw badReq('Silahkan pilih (centang) label yang Anda inginkan lebih dulu.');
  if (ascend && jenis.length) throw badReq('Ascend tidak bisa digabung dengan jenis label kayu.');

  let asc = null;
  if (ascend) {
    const categoryId = toInt(body.ascend.categoryId);
    const warehouseId = toInt(body.ascend.warehouseId);
    const familyIds = [...new Set((Array.isArray(body.ascend.familyIds) ? body.ascend.familyIds : []).map(toInt))].filter((n) => n > 0);
    if (!categoryId) throw badReq('Silakan pilih Category terlebih dahulu.');
    if (!warehouseId) throw badReq('Silakan pilih Warehouse terlebih dahulu.');
    if (!familyIds.length) throw badReq('Silakan pilih minimal satu Family.');
    asc = { categoryId, warehouseId, familyIds };
  }
  return { tgl, jenis, asc };
}

const ASCEND_INSERT = `
  INSERT INTO StockOpnameAscend (NoSO, ItemID, Pcs, CategoryID, FamilyID)
  SELECT @NoSO, Z.ItemID,
    (ISNULL(Z.QtyPrcIn,0) - ISNULL(Z.QtyUsg,0) + ISNULL(Z.QtyUbb,0) - ISNULL(Z.QtySls,0)
      - ISNULL(Z.QtyPR,0) + ISNULL(Z.QtyRTR,0) + ISNULL(Z.QtyTRIN,0) - ISNULL(Z.QtyTROUT,0)) AS Hasil,
    @CategoryID, @FamilyID
  FROM (
    SELECT AA.ItemID,
      ISNULL(BB.QtyPrcIn,0) AS QtyPrcIn, ISNULL(CC.QtyUsg,0) AS QtyUsg, ISNULL(DD.QtyUbb,0) AS QtyUbb,
      ISNULL(EE.QtySls,0) AS QtySls, ISNULL(FF.QtyPrcOut,0) AS QtyPR, ISNULL(GG.QtySlsRT,0) AS QtyRTR,
      ISNULL(II.TRFIN,0) AS QtyTRIN, ISNULL(JJ.TRFOUT,0) AS QtyTROUT
    FROM (
      SELECT I.ItemID FROM AS_RU.dbo.IC_Items I
      WHERE I.CategoryID = @CategoryID AND I.FamilyID = @FamilyID AND I.Disabled = 0 AND I.ItemType = 0
    ) AA
    LEFT JOIN (
      SELECT D.ItemID, SUM(AS_RU.dbo.UDF_Common_ConvertToSmallestUOMEx(Packing2,Packing3,Packing4,Quantity,UOMLevel)) AS QtyPrcIn
      FROM AS_RU.dbo.AP_PurchaseDetails D
      INNER JOIN AS_RU.dbo.AP_Purchases P ON P.PurchaseID = D.PurchaseID
      INNER JOIN AS_RU.dbo.IC_Items I ON I.ItemID = D.ItemID
      WHERE (P.PurchaseDate > '2025-12-31' AND P.PurchaseDate < @EndDate AND P.Void = 0 AND P.IsPurchase = 1
             AND I.CategoryID = @CategoryID AND I.FamilyID = @FamilyID AND D.WarehouseID = @WarehouseID)
         OR (P.PurchaseNumber = 'OP-2026' AND P.PurchaseDate >= '2025-12-31' AND P.PurchaseDate < @EndDate
             AND P.Void = 0 AND P.IsPurchase = 1 AND I.CategoryID = @CategoryID AND I.FamilyID = @FamilyID
             AND D.WarehouseID = @WarehouseID)
      GROUP BY D.ItemID) BB ON BB.ItemID = AA.ItemID
    LEFT JOIN (
      SELECT U.ItemID, SUM(AS_RU.dbo.UDF_Common_ConvertToSmallestUOMEx(Packing2,Packing3,Packing4,Quantity,UOMLevel)) AS QtyUsg
      FROM AS_RU.dbo.IC_UsageDetails U
      INNER JOIN AS_RU.dbo.IC_Usages UH ON UH.UsageID = U.UsageID
      INNER JOIN AS_RU.dbo.IC_Items I ON I.ItemID = U.ItemID
      WHERE UH.UsageDate < @EndDate AND UH.Void = 0 AND I.CategoryID = @CategoryID
        AND I.FamilyID = @FamilyID AND U.WarehouseID = @WarehouseID
      GROUP BY U.ItemID) CC ON CC.ItemID = AA.ItemID
    LEFT JOIN (
      SELECT U.ItemID, SUM(AS_RU.dbo.UDF_Common_ConvertToSmallestUOMEx(Packing2,Packing3,Packing4,QtyAdjustBy,UOMLevel)) AS QtyUbb
      FROM AS_RU.dbo.IC_AdjustmentDetails U
      INNER JOIN AS_RU.dbo.IC_Adjustments UH ON UH.AdjustmentID = U.AdjustmentID
      INNER JOIN AS_RU.dbo.IC_Items I ON I.ItemID = U.ItemID
      WHERE UH.AdjustmentDate < @EndDate AND UH.Void = 0 AND UH.Approved = 1 AND I.CategoryID = @CategoryID
        AND I.FamilyID = @FamilyID AND U.WarehouseID = @WarehouseID
      GROUP BY U.ItemID) DD ON DD.ItemID = AA.ItemID
    LEFT JOIN (
      SELECT U.ItemID, SUM(AS_RU.dbo.UDF_Common_ConvertToSmallestUOMEx(Packing2,Packing3,Packing4,Quantity,UOMLevel)) AS QtySls
      FROM AS_RU.dbo.AR_InvoiceDetails U
      INNER JOIN AS_RU.dbo.AR_Invoices UH ON UH.InvoiceID = U.InvoiceID
      INNER JOIN AS_RU.dbo.IC_Items I ON I.ItemID = U.ItemID
      WHERE UH.InvoiceDate > '2025-12-31' AND UH.InvoiceDate < @EndDate AND UH.Void = 0
        AND I.CategoryID = @CategoryID AND I.FamilyID = @FamilyID AND UH.DontPostToGL = 0
        AND UH.IsInvoice = 1 AND U.WarehouseID = @WarehouseID
      GROUP BY U.ItemID) EE ON EE.ItemID = AA.ItemID
    LEFT JOIN (
      SELECT D.ItemID, SUM(AS_RU.dbo.UDF_Common_ConvertToSmallestUOMEx(Packing2,Packing3,Packing4,Quantity,UOMLevel)) AS QtyPrcOut
      FROM AS_RU.dbo.AP_PurchaseDetails D
      INNER JOIN AS_RU.dbo.AP_Purchases P ON P.PurchaseID = D.PurchaseID
      INNER JOIN AS_RU.dbo.IC_Items I ON I.ItemID = D.ItemID
      WHERE P.PurchaseDate > '2025-12-31' AND P.PurchaseDate < @EndDate AND P.Void = 0 AND P.IsPurchase = 0
        AND I.CategoryID = @CategoryID AND I.FamilyID = @FamilyID AND D.WarehouseID = @WarehouseID
      GROUP BY D.ItemID) FF ON FF.ItemID = AA.ItemID
    LEFT JOIN (
      SELECT U.ItemID, SUM(AS_RU.dbo.UDF_Common_ConvertToSmallestUOMEx(Packing2,Packing3,Packing4,Quantity,UOMLevel)) AS QtySlsRT
      FROM AS_RU.dbo.AR_InvoiceDetails U
      INNER JOIN AS_RU.dbo.AR_Invoices UH ON UH.InvoiceID = U.InvoiceID
      INNER JOIN AS_RU.dbo.IC_Items I ON I.ItemID = U.ItemID
      WHERE UH.InvoiceDate < @EndDate AND UH.Void = 0 AND I.CategoryID = @CategoryID AND I.FamilyID = @FamilyID
        AND UH.DontPostToGL = 0 AND UH.IsInvoice = 0 AND U.WarehouseID = @WarehouseID
      GROUP BY U.ItemID) GG ON GG.ItemID = AA.ItemID
    LEFT JOIN (
      SELECT D.ItemID, SUM(AS_RU.dbo.UDF_Common_ConvertToSmallestUOMEx(Packing2,Packing3,Packing4,Quantity,UOMLevel)) AS TRFIN
      FROM AS_RU.dbo.IC_MutationDetails D
      INNER JOIN AS_RU.dbo.IC_Mutations P ON P.MutationID = D.MutationID
      INNER JOIN AS_RU.dbo.IC_Items I ON I.ItemID = D.ItemID
      WHERE P.MutationDate < @EndDate AND P.Void = 0 AND I.CategoryID = @CategoryID
        AND I.FamilyID = @FamilyID AND P.DestinationWarehouseID = @WarehouseID
      GROUP BY D.ItemID) II ON II.ItemID = AA.ItemID
    LEFT JOIN (
      SELECT D.ItemID, SUM(AS_RU.dbo.UDF_Common_ConvertToSmallestUOMEx(Packing2,Packing3,Packing4,Quantity,UOMLevel)) AS TRFOUT
      FROM AS_RU.dbo.IC_MutationDetails D
      INNER JOIN AS_RU.dbo.IC_Mutations P ON P.MutationID = D.MutationID
      INNER JOIN AS_RU.dbo.IC_Items I ON I.ItemID = D.ItemID
      WHERE P.MutationDate > '2025-12-01' AND P.MutationDate < @EndDate AND P.Void = 0
        AND I.CategoryID = @CategoryID AND I.FamilyID = @FamilyID AND P.SourceWarehouseID = @WarehouseID
      GROUP BY D.ItemID) JJ ON JJ.ItemID = AA.ItemID
  ) Z
  WHERE (ISNULL(Z.QtyPrcIn,0) - ISNULL(Z.QtyUsg,0) + ISNULL(Z.QtyUbb,0) - ISNULL(Z.QtySls,0)
        - ISNULL(Z.QtyPR,0) + ISNULL(Z.QtyRTR,0) + ISNULL(Z.QtyTRIN,0) - ISNULL(Z.QtyTROUT,0)) <> 0;`;

// Baseline racipan detail as-of tanggal SO: port saldo awal dari
// SPWps_LapMutasiRacipanDetail dengan periode TglAwal = TglAkhir = tanggal SO,
// sama seperti kolom "Saldo Awal" pada laporan yang dipakai user. Baris dengan
// saldo 0 (m3 dan batang) tidak dibekukan; kolom Sawal1 (duplikat nilai Sawal
// di SP asli) tidak dipakai sebagai angka utama.
const SNAPSHOT_RACIPAN = `
  DECLARE @TglAwal DATE;
  DECLARE @TglAkhir DATE;
  SET @TglAkhir = CAST(@Tgl AS date);
  -- Saldo awal tanggal SO, persis seperti laporan Mutasi Racipan Detail
  -- (periode TglAwal = TglAkhir = tanggal SO, kolom Saldo Awal).
  SET @TglAwal = @TglAkhir;
  DECLARE @TglStMulai As Date
  DECLARE @TglSaldoAwal As Date
  Set @TglStMulai = (Select max(TglMulaiSTKeluar) from Offset)
  Set @TglSaldoAwal = (Select max(Tanggal) from Offset)
  INSERT INTO [dbo].[StockOpnameRacipan]
    (NoSO, Jenis, Tebal, Lebar, Panjang,
     Sawal, SawalJlhBtg, Masuk, MskJlhBtg, AdjusmentOutput, AdjOutJlhBtg,
     Keluar, KeluarJlhBtg, AdjusmentInput, AdjInJlhBtg, Akhir, AkhirJlhBtg)
  SELECT @NoSO, Jenis, Tebal, Lebar, Panjang,
         Sawal, SawalJlhBtg, Masuk, MskJlhBtg, AdjusmentOutput, AdjOutJlhBtg,
         Keluar, KeluarJlhBtg, AdjusmentInput, AdjInJlhBtg, Akhir, AkhirJlhBtg
  FROM (
    SELECT
    z.Jenis, Z.Tebal, Z.Lebar, Z.Panjang,
    (CASE WHEN Z2.Sawal IS NULL THEN 0 ELSE Z2.Sawal END) AS Sawal,
    (CASE WHEN Z2.SawalJlhBtg IS NULL THEN 0 ELSE Z2.SawalJlhBtg END) AS SawalJlhBtg,

    (CASE WHEN Z3.Masuk IS NULL THEN 0 ELSE Z3.Masuk END) AS Masuk,
    (CASE WHEN Z3.JlhBtg IS NULL THEN 0 ELSE Z3.JlhBtg END) AS MskJlhBtg,
    (CASE WHEN Z4.Keluar IS NULL THEN 0 ELSE Z4.Keluar END) AS Keluar,
    (CASE WHEN Z4.JlhBtg IS NULL THEN 0 ELSE Z4.JlhBtg END) AS KeluarJlhBtg,
    (CASE WHEN Z5.AdjusmentInput IS NULL THEN 0 ELSE Z5.AdjusmentInput END) as AdjusmentInput,
    (CASE WHEN Z5.JmlhBatang IS NULL THEN 0 ELSE Z5.JmlhBatang END) as AdjInJlhBtg,
    (CASE WHEN Z6.AdjusmentOutput IS NULL THEN 0 ELSE Z6.AdjusmentOutput END) as AdjusmentOutput,
    (CASE WHEN Z6.JmlhBatang IS NULL THEN 0 ELSE Z6.JmlhBatang END) as AdjOutJlhBtg,

    (CASE WHEN Z2.Sawal1 IS NULL THEN 0 ELSE Z2.Sawal1 END) as Akhir,
    (CASE WHEN Z2.SawalJlhBtg IS NULL THEN 0 ELSE Z2.SawalJlhBtg END) as AkhirJlhBtg

    FROM (
      SELECT CASE WHEN Jenis2 LIKE '%KAYU LAT JABON%' THEN 'RACIP KAYU LAT JABON' ELSE Jenis2 END AS Jenis, Tebal, Lebar, Panjang FROM (
      SELECT Jenis, GAB, HASIL, (CASE WHEN HASIL IS NULL THEN 'ST RACIP '+Jenis ELSE HASIL END) AS Jenis2, Tebal, Lebar, Panjang  FROM (
      SELECT Jenis, GAB, (CASE WHEN GAB LIKE '%KAYU LAT%' THEN 'RACIP KAYU LAT ' +Jenis
      ELSE 'ST RACIP ' +Jenis+' - '+GAB END) AS HASIL, Tebal, Lebar, Panjang  FROM(
      Select F.Jenis, Tebal, Lebar, Panjang,
      (CASE WHEN IsLocal = 1 AND IdPengukuran <> 5 THEN 'KAYU LAT' ELSE NamaGrade END) AS GAB
      From STSawmill_h A
      LEFT Join STSawmill_d B On B.NoSTSawmill = A.NoSTSawmill
      LEFT Join STSawmillKG_d C On B.NoSTSawmill = C.NoSTSawmill And B.NoUrut = C.NoUrut
      LEFT Join MstGradeKB D On D.IdGradeKB = C.IdGradeKB
      LEFT Join KayuBulat_h E ON E.NoKayuBulat = A.NoKayuBulat
      INNER JOIN MstJenisKayu F ON F.IdJenisKayu = E.IdJenisKayu
      WHERE (A.TglSawmill < @TglAwal
      AND A.TglSawmill >='2024-07-01')
      OR A.TglSawmill >= @TglAwal AND A.TglSawmill <= @TglAkhir
      ) A
      ) B
      ) C
      GROUP by Jenis2, Tebal, Lebar, Panjang

      UNION

      SELECT CASE WHEN Jenis LIKE '%KAYU LAT%' THEN 'RACIP '+Jenis ELSE 'ST RACIP '+ Jenis END AS Jenis, Tebal, Lebar, Panjang
      FROM ST_h A
      INNER JOIN ST_d B ON B.NoST = A.NoST
      INNER JOIN MstJenisKayu C ON C.IdJenisKayu = A.IdJenisKayu
      LEFT JOIN AdjustmentOutputST D ON D.NoST = A.NoST
      LEFT JOIN BongkarSusunOutputST E ON E.NoST = A.NoST
      LEFT JOIN PenerimaanSTPembelian_d F ON F.NoST = A.NoST
      LEFT JOIN PenerimaanSTUpah_d G ON G.NoST = A.NoST
      WHERE (
      A.DateCreate >= @TglAwal AND A.DateCreate <= @TglAkhir)
      AND D.NoST IS NULL
      AND E.NoST IS NULL
      AND F.NoST IS NULL
      AND G.NoST IS NULL
      GROUP BY Jenis, Tebal, Lebar, Panjang

      UNION

      SELECT CASE WHEN Jenis LIKE '%KAYU LAT%' THEN 'RACIP '+Jenis ELSE 'ST RACIP '+ Jenis END AS Jenis, Tebal, Lebar, Panjang
      FROM AdjusmentRacipanInput A
      INNER JOIN AdjusmentRacipan_h B ON B.NoAdjusmentRacipan = A.NoAdjusmentRacipan
      INNER JOIN MstJenisKayu C ON C.IdJenisKayu = A.IdJenisKayu
      WHERE Tanggal >= @TglAwal AND Tanggal <= @TglAkhir
      GROUP BY (CASE WHEN Jenis LIKE '%KAYU LAT%' THEN 'RACIP '+Jenis ELSE 'ST RACIP '+ Jenis END), Tebal, Lebar, Panjang

      UNION

      SELECT CASE WHEN Jenis LIKE '%KAYU LAT%' THEN 'RACIP '+Jenis ELSE 'ST RACIP '+ Jenis END AS Jenis, Tebal, Lebar, Panjang
      FROM AdjusmentRacipanOutput A
      INNER JOIN AdjusmentRacipan_h B ON B.NoAdjusmentRacipan = A.NoAdjusmentRacipan
      INNER JOIN MstJenisKayu C ON C.IdJenisKayu = A.IdJenisKayu
      WHERE Tanggal >= @TglAwal AND Tanggal <= @TglAkhir
      GROUP BY (CASE WHEN Jenis LIKE '%KAYU LAT%' THEN 'RACIP '+Jenis ELSE 'ST RACIP '+ Jenis END), Tebal, Lebar, Panjang
      ) Z

      LEFT JOIN
      (
      select GG.Jenis, GG.Tebal, GG.Lebar, GG.Panjang, Z3.Masuk, Z3.JlhBtg as MasukJlhBtg, Z4.Keluar, z4.JmlBtg as KeluarJlhBtg,
      (
       ((CASE WHEN Z1.Sawal IS NULL THEN 0 ELSE Z1.Sawal END)) +
       ((CASE WHEN Z3.Masuk IS NULL THEN 0 ELSE Z3.Masuk END)) -
       ((CASE WHEN Z4.Keluar IS NULL THEN 0 ELSE Z4.Keluar END)) -
       ((CASE WHEN Z5.AdjusmentInput IS NULL THEN 0 ELSE Z5.AdjusmentInput END)) +
       ((CASE WHEN Z6.AdjusmentOutput IS NULL THEN 0 ELSE Z6.AdjusmentOutput END))
      ) AS Sawal,

      (
       ((CASE WHEN Z1.Sawal IS NULL THEN 0 ELSE Z1.Sawal END)) +
       ((CASE WHEN Z3.Masuk IS NULL THEN 0 ELSE Z3.Masuk END)) -
       ((CASE WHEN Z4.Keluar IS NULL THEN 0 ELSE Z4.Keluar END)) -
       ((CASE WHEN Z5.AdjusmentInput IS NULL THEN 0 ELSE Z5.AdjusmentInput END)) +
       ((CASE WHEN Z6.AdjusmentOutput IS NULL THEN 0 ELSE Z6.AdjusmentOutput END))
      ) AS Sawal1,

      (
      CASE WHEN Z1.JlhBtg IS NULL THEN 0 ELSE Z1.JlhBtg END
      +
      CASE WHEN Z3.JlhBtg IS NULL THEN 0 ELSE Z3.JlhBtg END
      -
      CASE WHEN Z4.JmlBtg IS NULL THEN 0 ELSE Z4.JmlBtg END
      -
      CASE WHEN Z5.JmlhBatang IS NULL THEN 0 ELSE Z5.JmlhBatang END
      +
      CASE WHEN Z6.JmlhBatang IS NULL THEN 0 ELSE Z6.JmlhBatang END
      ) AS SawalJlhBtg
      from
      (
      SELECT CASE WHEN Jenis2 LIKE '%KAYU LAT JABON%' THEN 'RACIP KAYU LAT JABON' ELSE Jenis2 END AS Jenis, Tebal, Lebar, Panjang FROM (
      SELECT Jenis, GAB, HASIL, (CASE WHEN HASIL IS NULL THEN 'ST RACIP '+Jenis ELSE HASIL END) AS Jenis2, Tebal, Lebar, Panjang  FROM (
      SELECT Jenis, GAB, (CASE WHEN GAB LIKE '%KAYU LAT%' THEN 'RACIP KAYU LAT ' +Jenis
      ELSE 'ST RACIP ' +Jenis+' - '+GAB END) AS HASIL, Tebal, Lebar, Panjang  FROM(
      Select F.Jenis,
      (CASE WHEN IsLocal = 1 AND IdPengukuran <> 5 THEN 'KAYU LAT' ELSE NamaGrade END) AS GAB, Tebal, Lebar, Panjang
      From STSawmill_h A
      LEFT Join STSawmill_d B On B.NoSTSawmill = A.NoSTSawmill
      LEFT Join STSawmillKG_d C On B.NoSTSawmill = C.NoSTSawmill And B.NoUrut = C.NoUrut
      LEFT Join MstGradeKB D On D.IdGradeKB = C.IdGradeKB
      LEFT Join KayuBulat_h E ON E.NoKayuBulat = A.NoKayuBulat
      INNER JOIN MstJenisKayu F ON F.IdJenisKayu = E.IdJenisKayu
      WHERE (A.TglSawmill < @TglAwal
      AND A.TglSawmill >='2024-07-01')
      OR A.TglSawmill >= @TglAwal AND A.TglSawmill <= @TglAkhir
      ) A
      ) B
      ) C
      GROUP by Jenis2, Tebal, Lebar, Panjang

      UNION

      SELECT CASE WHEN Jenis LIKE '%KAYU LAT%' THEN 'RACIP '+Jenis ELSE 'ST RACIP '+ Jenis END AS Jenis, Tebal, Lebar, Panjang
      FROM ST_h A
      INNER JOIN ST_d B ON B.NoST = A.NoST
      INNER JOIN MstJenisKayu C ON C.IdJenisKayu = A.IdJenisKayu
      WHERE (A.DateCreate >= @TglAwal AND A.DateCreate <= @TglAkhir)
      AND A.IsUpah<>1
      GROUP BY Jenis, Tebal, Lebar, Panjang
      ) GG

      LEFT JOIN

      (
      SELECT (CASE WHEN Z.Jenis LIKE '%KAYU LAT%' THEN 'RACIP ' + Z.Jenis
      ELSE 'ST RACIP ' +Z.Jenis END) AS Jenis, Hasil as Sawal, Tebal, Lebar, Panjang, JlhBtg  FROM(
      SELECT B.Jenis,
      sum(round((Tebal * Lebar * Panjang)*304.8/1000000000/1.416,4)*JmlhBatang) as Hasil, Tebal, Lebar, Panjang,
      sum(JmlhBatang) as JlhBtg
      FROM OffSet A
      INNER JOIN MstJenisKayu B ON B.IdJenisKayu = A.IdJenisKayu
      WHERE Tanggal >=@TglSaldoAwal
      AND Tanggal <=@TglAkhir
      group by Jenis, Tebal, Lebar, Panjang
      ) z
      ) Z1 ON Z1.Jenis = GG.Jenis AND Z1.Tebal = GG.Tebal AND Z1.Lebar = GG.Lebar AND Z1.Panjang = GG.Panjang

      LEFT JOIN

      (
      SELECT CASE WHEN Jenis2 LIKE '%KAYU LAT JABON%' THEN 'RACIP KAYU LAT JABON' ELSE Jenis2 END AS Jenis, sum(Masuk) AS Masuk, Tebal, Lebar, Panjang, sum(JmlhBatang) as JlhBtg FROM(
      SELECT Jenis, GAB, HASIL, (CASE WHEN HASIL IS NULL THEN 'ST RACIP '+Jenis ELSE HASIL END) AS Jenis2, Masuk, Tebal, Lebar, Panjang, JmlhBatang  FROM (
      SELECT Jenis, GAB, (CASE WHEN GAB LIKE '%KAYU LAT%' THEN 'RACIP KAYU LAT ' +Jenis
      ELSE 'ST RACIP ' +Jenis+' - '+GAB END) AS HASIL, Masuk, Tebal, Lebar, Panjang, JmlhBatang  FROM(
      Select Jenis, (CASE WHEN IsLocal = 1 AND IdPengukuran <> 5 THEN 'KAYU LAT' ELSE NamaGrade END) AS GAB,
      (Case When IdUOMTblLebar = 1 And IdUOMPanjang = 4 Then
        				round((Tebal * Lebar * Panjang)*304.8/1000000000/1.416,4)*JmlhBatang
      			When IdUOMTblLebar = 3 And IdUOMPanjang = 4 Then
      				Floor(Tebal * Lebar * Panjang * JmlhBatang/7200.8*10000) / 10000
      			End)
      AS Masuk, Tebal, Lebar, Panjang, JmlhBatang
      From STSawmill_h A
      LEFT Join STSawmill_d B On B.NoSTSawmill = A.NoSTSawmill
      LEFT Join STSawmillKG_d C On B.NoSTSawmill = C.NoSTSawmill And B.NoUrut = C.NoUrut
      LEFT Join MstGradeKB D On D.IdGradeKB = C.IdGradeKB
      LEFT Join KayuBulat_h E ON E.NoKayuBulat = A.NoKayuBulat
      INNER JOIN MstJenisKayu F ON F.IdJenisKayu = E.IdJenisKayu
      WHERE A.TglSawmill>=@TglSaldoAwal AND A.TglSawmill < @TglAwal
      ) A
      ) A
      ) A
      GROUP BY (CASE WHEN Jenis2 LIKE '%KAYU LAT JABON%' THEN 'RACIP KAYU LAT JABON' ELSE Jenis2 END), Tebal, Lebar, Panjang
      ) Z3 ON Z3.Jenis = GG.Jenis AND Z3.Tebal = GG.Tebal AND Z3.Lebar = GG.Lebar AND Z3.Panjang = GG.Panjang

      LEFT JOIN
      (
      SELECT * FROM(
      SELECT Jenis, SUM(Keluar) AS Keluar, Tebal, Lebar, Panjang, SUM(JmlhBatang) JmlBtg FROM(
      SELECT Jenis, CASE WHEN A.DateCreate < @TglStMulai THEN 0 ELSE Keluar END AS Keluar, Tebal, Lebar, Panjang,
      CASE WHEN A.DateCreate < @TglStMulai THEN 0 ELSE JmlhBatang END AS JmlhBatang FROM (
      SELECT CASE WHEN Jenis LIKE '%KAYU LAT%' THEN 'RACIP '+Jenis ELSE 'ST RACIP '+ Jenis END AS Jenis,
      A.DateCreate,
      (Case When IdUOMTblLebar = 1 And IdUOMPanjang = 4 Then
      				round((Tebal * Lebar * Panjang)*304.8/1000000000/1.416,4)*JmlhBatang
      			When IdUOMTblLebar = 3 And IdUOMPanjang = 4 Then
      				Floor(Tebal * Lebar * Panjang * JmlhBatang/7200.8*10000) / 10000
      			End)
      as Keluar, Tebal, Lebar, Panjang, JmlhBatang
      FROM ST_h A
      INNER JOIN ST_d B ON B.NoST = A.NoST
      INNER JOIN MstJenisKayu C ON C.IdJenisKayu = A.IdJenisKayu
      LEFT JOIN AdjustmentOutputST D ON D.NoST = A.NoST
      LEFT JOIN BongkarSusunOutputST E ON E.NoST = A.NoST
      LEFT JOIN PenerimaanSTPembelian_d F ON F.NoST = A.NoST
      LEFT JOIN PenerimaanSTUpah_d G ON G.NoST = A.NoST
      WHERE (
      A.DateCreate < @TglAwal)
      AND D.NoST IS NULL
      AND E.NoST IS NULL
      AND F.NoST IS NULL
      AND G.NoST IS NULL
      ) A
      )A2
      GROUP BY Jenis, Tebal, Lebar, Panjang
      )A
      ) Z4 ON Z4.Jenis = GG.Jenis AND Z4.Tebal = GG.Tebal AND Z4.Lebar = GG.Lebar AND Z4.Panjang = GG.Panjang

      LEFT JOIN

      (
      SELECT CASE WHEN Jenis LIKE '%KAYU LAT%' THEN 'RACIP '+Jenis ELSE 'ST RACIP '+ Jenis END AS Jenis, Tebal, Lebar, Panjang, SUM(JmlhBatang) AS JmlhBatang,
      SUM(round((Tebal * Lebar * Panjang)*304.8/1000000000/1.416,4)*JmlhBatang) as AdjusmentInput
      FROM AdjusmentRacipanInput A
      INNER JOIN AdjusmentRacipan_h B ON B.NoAdjusmentRacipan = A.NoAdjusmentRacipan
      INNER JOIN MstJenisKayu C ON C.IdJenisKayu = A.IdJenisKayu
      WHERE Tanggal <  @TglAwal
      GROUP BY (CASE WHEN Jenis LIKE '%KAYU LAT%' THEN 'RACIP '+Jenis ELSE 'ST RACIP '+ Jenis END), Tebal, Lebar, Panjang
      ) Z5 ON Z5.Jenis = GG.Jenis AND Z5.Tebal = GG.Tebal AND Z5.Lebar = GG.Lebar AND Z5.Panjang = GG.Panjang

      LEFT JOIN

      (
      SELECT CASE WHEN Jenis LIKE '%KAYU LAT%' THEN 'RACIP '+Jenis ELSE 'ST RACIP '+ Jenis END AS Jenis, Tebal, Lebar, Panjang, SUM(JmlhBatang) AS JmlhBatang,
      SUM(round((Tebal * Lebar * Panjang)*304.8/1000000000/1.416,4)*JmlhBatang) as AdjusmentOutput
      FROM AdjusmentRacipanOutput A
      INNER JOIN AdjusmentRacipan_h B ON B.NoAdjusmentRacipan = A.NoAdjusmentRacipan
      INNER JOIN MstJenisKayu C ON C.IdJenisKayu = A.IdJenisKayu
      WHERE Tanggal <  @TglAwal
      GROUP BY (CASE WHEN Jenis LIKE '%KAYU LAT%' THEN 'RACIP '+Jenis ELSE 'ST RACIP '+ Jenis END), Tebal, Lebar, Panjang
      ) Z6 ON Z6.Jenis = GG.Jenis AND Z6.Tebal = GG.Tebal AND Z6.Lebar = GG.Lebar AND Z6.Panjang = GG.Panjang

      ) Z2 ON Z2.Jenis = Z.Jenis AND Z2.Tebal = Z.Tebal AND Z2.Lebar = Z.Lebar AND Z2.Panjang = Z.Panjang

      LEFT JOIN

      (
      SELECT Jenis, SUM (Masuk) AS Masuk, Tebal, Lebar, Panjang, sum(JlhBtg) as JlhBtg  FROM(
      SELECT CASE WHEN Jenis2 LIKE '%KAYU LAT JABON%' THEN 'RACIP KAYU LAT JABON' ELSE Jenis2 END AS Jenis, sum(Masuk) AS Masuk, Tebal, Lebar, Panjang, sum(JmlhBatang) as JlhBtg FROM(
      SELECT Jenis, GAB, HASIL, (CASE WHEN HASIL IS NULL THEN 'ST RACIP '+Jenis ELSE HASIL END) AS Jenis2, Masuk, Tebal, Lebar, Panjang, JmlhBatang  FROM (
      SELECT Jenis, GAB, (CASE WHEN GAB LIKE '%KAYU LAT%' THEN 'RACIP KAYU LAT ' +Jenis
      ELSE 'ST RACIP ' +Jenis+' - '+GAB END) AS HASIL, Masuk, Tebal, Lebar, Panjang, JmlhBatang  FROM(
      Select Jenis, (CASE WHEN IsLocal = 1 AND IdPengukuran <> 5 THEN 'KAYU LAT' ELSE NamaGrade END) AS GAB,
      (Case When IdUOMTblLebar = 1 And IdUOMPanjang = 4 Then
        				round((Tebal * Lebar * Panjang)*304.8/1000000000/1.416,4)*JmlhBatang
      			When IdUOMTblLebar = 3 And IdUOMPanjang = 4 Then
      				Floor(Tebal * Lebar * Panjang * JmlhBatang/7200.8*10000) / 10000
      			End)
      AS Masuk, Tebal, Lebar, Panjang, JmlhBatang
      From STSawmill_h A
      LEFT Join STSawmill_d B On B.NoSTSawmill = A.NoSTSawmill
      LEFT Join STSawmillKG_d C On B.NoSTSawmill = C.NoSTSawmill And B.NoUrut = C.NoUrut
      LEFT Join MstGradeKB D On D.IdGradeKB = C.IdGradeKB
      LEFT Join KayuBulat_h E ON E.NoKayuBulat = A.NoKayuBulat
      INNER JOIN MstJenisKayu F ON F.IdJenisKayu = E.IdJenisKayu
      WHERE A.TglSawmill >= @TglAwal AND A.TglSawmill <= @TglAkhir
      ) A
      ) A
      ) A
      GROUP BY CASE WHEN Jenis2 LIKE '%KAYU LAT JABON%' THEN 'RACIP KAYU LAT JABON' ELSE Jenis2 END, Tebal, Lebar, Panjang
      ) GH
      GROUP BY Jenis, Tebal, Lebar, Panjang
      ) Z3 ON Z3.Jenis = Z.Jenis AND Z3.Tebal = Z.Tebal AND Z3.Lebar = Z.Lebar AND Z3.Panjang = Z.Panjang
      LEFT JOIN

      (
      SELECT Jenis, SUM(Keluar) AS Keluar, Tebal, Lebar, Panjang, sum(JmlhBatang) JlhBtg FROM(
      SELECT Jenis, CASE WHEN A.DateCreate < @TglStMulai THEN 0 ELSE Keluar END AS Keluar, Tebal, Lebar, Panjang,
      CASE WHEN A.DateCreate < @TglStMulai THEN 0 ELSE JmlhBatang END AS JmlhBatang FROM (
      SELECT CASE WHEN Jenis LIKE '%KAYU LAT%' THEN 'RACIP '+Jenis ELSE 'ST RACIP '+ Jenis END AS Jenis,
      A.DateCreate,
      (Case When IdUOMTblLebar = 1 And IdUOMPanjang = 4 Then
      				round((Tebal * Lebar * Panjang)*304.8/1000000000/1.416,4)*JmlhBatang
      			When IdUOMTblLebar = 3 And IdUOMPanjang = 4 Then
      				Floor(Tebal * Lebar * Panjang * JmlhBatang/7200.8*10000) / 10000
      			End)
      as Keluar , Tebal, Lebar, Panjang, JmlhBatang
      FROM ST_h A
      INNER JOIN ST_d B ON B.NoST = A.NoST
      INNER JOIN MstJenisKayu C ON C.IdJenisKayu = A.IdJenisKayu
      LEFT JOIN AdjustmentOutputST D ON D.NoST = A.NoST
      LEFT JOIN BongkarSusunOutputST E ON E.NoST = A.NoST
      LEFT JOIN PenerimaanSTPembelian_d F ON F.NoST = A.NoST
      LEFT JOIN PenerimaanSTUpah_d G ON G.NoST = A.NoST
      WHERE (A.DateCreate >= @TglAwal AND A.DateCreate <= @TglAkhir)
      AND D.NoST IS NULL
      AND E.NoST IS NULL
      AND F.NoST IS NULL
      AND G.NoST IS NULL
      ) A
      )A2
      GROUP BY Jenis, Tebal, Lebar, Panjang
      ) Z4 ON Z4.Jenis = Z.Jenis AND Z4.Tebal = Z.Tebal AND Z4.Lebar = Z.Lebar AND Z4.Panjang = Z.Panjang

      LEFT JOIN

      (
      SELECT CASE WHEN Jenis LIKE '%KAYU LAT%' THEN 'RACIP '+Jenis ELSE 'ST RACIP '+ Jenis END AS Jenis, Tebal, Lebar, Panjang, SUM(JmlhBatang) AS JmlhBatang,
      SUM(round((Tebal * Lebar * Panjang)*304.8/1000000000/1.416,4)*JmlhBatang) as AdjusmentInput
      FROM AdjusmentRacipanInput A
      INNER JOIN AdjusmentRacipan_h B ON B.NoAdjusmentRacipan = A.NoAdjusmentRacipan
      INNER JOIN MstJenisKayu C ON C.IdJenisKayu = A.IdJenisKayu
      WHERE Tanggal >=  @TglAwal and Tanggal <= @TglAkhir
      GROUP BY (CASE WHEN Jenis LIKE '%KAYU LAT%' THEN 'RACIP '+Jenis ELSE 'ST RACIP '+ Jenis END), Tebal, Lebar, Panjang
      ) Z5 ON Z5.Jenis = Z.Jenis AND Z5.Tebal = Z.Tebal AND Z5.Lebar = Z.Lebar AND Z5.Panjang = Z.Panjang

      LEFT JOIN

      (
      SELECT CASE WHEN Jenis LIKE '%KAYU LAT%' THEN 'RACIP '+Jenis ELSE 'ST RACIP '+ Jenis END AS Jenis, Tebal, Lebar, Panjang, SUM(JmlhBatang) AS JmlhBatang,
      SUM(round((Tebal * Lebar * Panjang)*304.8/1000000000/1.416,4)*JmlhBatang) as AdjusmentOutput
      FROM AdjusmentRacipanOutput A
      INNER JOIN AdjusmentRacipan_h B ON B.NoAdjusmentRacipan = A.NoAdjusmentRacipan
      INNER JOIN MstJenisKayu C ON C.IdJenisKayu = A.IdJenisKayu
      WHERE Tanggal >=  @TglAwal and Tanggal <= @TglAkhir
      GROUP BY (CASE WHEN Jenis LIKE '%KAYU LAT%' THEN 'RACIP '+Jenis ELSE 'ST RACIP '+ Jenis END), Tebal, Lebar, Panjang
      ) Z6 ON Z6.Jenis = Z.Jenis AND Z6.Tebal = Z.Tebal AND Z6.Lebar = Z.Lebar AND Z6.Panjang = Z.Panjang

  ) x
  -- Saldo 0 (m3 dan batang) tidak dibekukan; mutasi tanpa saldo juga dilewati.
  WHERE ABS(x.Akhir) >= 0.0001 OR x.AkhirJlhBtg <> 0
`;

// Saldo awal racipan: semua kombinasi Jenis/Tebal/Lebar/Panjang yang pernah
// tercatat, dibekukan ke snapshot saat SO dibuat. Mengikuti snapshotKayuBulat.
async function snapshotRacipan(tx, noSO, tgl) {
  await tx
    .request()
    .input('NoSO', sql.VarChar, noSO)
    .input('Tgl', sql.VarChar, tgl)
    .query(SNAPSHOT_RACIPAN);
}

// Stok awal kayu bulat: semua log yang dibuat 1 bulan terakhir sampai tanggal
// SO (batang balok masuk); balance 0 ikut dibekukan. Angka sistem (Pcs,
// BalokTerpakai) dibekukan ke snapshot; Fisik dihitung saat disajikan.
async function snapshotKayuBulat(tx, noSO, tgl) {
  await tx
    .request()
    .input('NoSO', sql.VarChar, noSO)
    .input('Tgl', sql.VarChar, tgl)
    .query(`
      INSERT INTO [dbo].[StockOpnameKayuBulat] (NoSO, NoKayuBulat, IdLokasi, Pcs, BlkTepakai)
      SELECT @NoSO, A.NoKayuBulat, NULL,
             ISNULL(P.Pcs, 0),
             ISNULL(P.Terpakai, 0)
      FROM [dbo].[KayuBulat_h] A
      CROSS APPLY (
        SELECT
          (ISNULL((SELECT COUNT(*) FROM [dbo].[KayuBulat_d] D WHERE D.NoKayuBulat = A.NoKayuBulat), 0)
           + ISNULL((SELECT SUM(KG.JmlhBatang) FROM [dbo].[KayuBulatKG_d] KG WHERE KG.NoKayuBulat = A.NoKayuBulat), 0)) AS Pcs,
          ISNULL((SELECT SUM(S.BalokTerpakai) FROM [dbo].[STSawmill_h] S
                  WHERE S.NoKayuBulat = A.NoKayuBulat AND S.TglSawmill <= CAST(@Tgl AS date)), 0) AS Terpakai
      ) P
      WHERE A.DateCreate >= DATEADD(month, -1, CAST(@Tgl AS date))
        AND A.DateCreate <= CAST(@Tgl AS date)`);
}

async function create(body, username) {
  const { tgl, jenis, asc } = parseInput(body);
  await assertPeriodeTerbuka(new Date(`${tgl}T00:00:00`));

  const pool = await poolPromise;
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    // No SO berikutnya: 'Q.' + 6 digit (paritas BtnBaru_Click), dikunci agar tidak bentrok.
    const next = await tx.request().query(`
      SELECT 'Q.' + FORMAT(ISNULL(MAX(CAST(RIGHT(NoSO, 6) AS INT)), 0) + 1, '000000') AS NoSO
      FROM StockOpname_h WITH (UPDLOCK, HOLDLOCK)`);
    const noSO = next.recordset[0].NoSO;

    const flags = Object.fromEntries(Object.values(HEADER_FLAG).map((c) => [c, 0]));
    for (const k of jenis) flags[HEADER_FLAG[k]] = 1;

    await tx
      .request()
      .input('NoSO', sql.VarChar, noSO)
      .input('Tgl', sql.VarChar, tgl)
      .input('IsST', sql.Bit, flags.IsST)
      .input('IsS4S', sql.Bit, flags.IsS4S)
      .input('IsFJ', sql.Bit, flags.IsFJ)
      .input('IsMoulding', sql.Bit, flags.IsMoulding)
      .input('IsLaminating', sql.Bit, flags.IsLaminating)
      .input('IsCCAkhir', sql.Bit, flags.IsCCAkhir)
      .input('IsSanding', sql.Bit, flags.IsSanding)
      .input('IsBJ', sql.Bit, flags.IsBJ)
      .input('IsKB', sql.Bit, flags.IsKB)
      .input('IsRacipan', sql.Bit, flags.IsRacipan)
      .input('IsAscend', sql.Bit, asc ? 1 : 0)
      .query(`
        INSERT INTO StockOpname_h
          (NoSO, Tgl, IsKB, IsSTBasah, IsSTKering, IsS4S, IsFJ, IsMoulding, IsLaminating, IsCCAkhir,
           IsSanding, IsReproses, IsWIP, IsBJ, IsST, IsAscend, IsRacipan)
        VALUES
          (@NoSO, CAST(@Tgl AS datetime), @IsKB, 0, 0, @IsS4S, @IsFJ, @IsMoulding, @IsLaminating, @IsCCAkhir,
           @IsSanding, 0, 0, @IsBJ, @IsST, @IsAscend, @IsRacipan)`);

    // Stok awal per jenis label: dibuat sebelum tanggal SO dan belum terpakai pada tanggal SO.
    for (const k of jenis) {
      if (k === 'KB') {
        await snapshotKayuBulat(tx, noSO, tgl);
        continue;
      }
      if (k === 'RC') {
        await snapshotRacipan(tx, noSO, tgl);
        continue;
      }
      const j = JENIS[k];
      await tx
        .request()
        .input('NoSO', sql.VarChar, noSO)
        .input('Tgl', sql.VarChar, tgl)
        .query(`
          INSERT INTO [dbo].[${j.so}] (NoSO, [${j.col}], IdLokasi)
          SELECT @NoSO, A.[${j.col}], A.IdLokasi
          FROM [dbo].[${j.h}] A
          WHERE A.DateCreate < CAST(@Tgl AS datetime)
            AND (A.DateUsage IS NULL OR A.DateUsage >= CAST(@Tgl AS datetime))
          GROUP BY A.[${j.col}], A.IdLokasi
          ORDER BY A.[${j.col}] ASC`);
    }

    if (asc) {
      await tx
        .request()
        .input('NoSO', sql.VarChar, noSO)
        .input('IdWarehouse', sql.Int, asc.warehouseId)
        .query('INSERT INTO StockOpname_h_WarehouseID (NoSO, IdWarehouse) VALUES (@NoSO, @IdWarehouse)');

      for (const familyId of asc.familyIds) {
        await tx
          .request()
          .input('NoSO', sql.VarChar, noSO)
          .input('CategoryID', sql.Int, asc.categoryId)
          .input('FamilyID', sql.Int, familyId)
          .query('INSERT INTO StockOpnameAscend_dFamily (NoSO, CategoryID, FamilyID) VALUES (@NoSO, @CategoryID, @FamilyID)');

        await tx
          .request()
          .input('NoSO', sql.VarChar, noSO)
          .input('CategoryID', sql.Int, asc.categoryId)
          .input('FamilyID', sql.Int, familyId)
          .input('WarehouseID', sql.Int, asc.warehouseId)
          .input('EndDate', sql.VarChar, tgl)
          .query(ASCEND_INSERT.replace(/@EndDate/g, 'CAST(@EndDate AS date)'));
      }
    }

    await riwayat(tx, username, `Menyimpan Data Stock Opname ${noSO}`);
    await tx.commit();
    return { NoSO: noSO, Tgl: tgl };
  } catch (error) {
    try {
      await tx.rollback();
    } catch {
      // transaksi mungkin sudah gagal ditutup driver
    }
    throw error;
  }
}

// ---------- laporan ----------

// Perbandingan stok sistem vs hasil scan per label (semua jenis, atau yang dipilih).
async function laporanKayu(noso, jenisList) {
  const pool = await poolPromise;
  const keys = jenisList && jenisList.length ? jenisList : Object.keys(JENIS);
  if (keys.some((k) => !JENIS[k])) throw badReq('Jenis label tidak dikenal.');
  const union = keys
    .map((k) => {
      const j = JENIS[k];
      return `
        SELECT COALESCE(s.[${j.col}], r.[${j.col}]) AS NoLabel, '${k}' AS Jenis,
               s.IdLokasi AS LokasiSistem, r.IdLokasi AS LokasiScan, r.UserID, r.DateTimeScan,
               CASE WHEN s.[${j.col}] IS NULL THEN 'Tidak Ada di Sistem'
                    WHEN r.[${j.col}] IS NULL THEN 'Belum Discan'
                    WHEN ISNULL(s.IdLokasi,'') <> ISNULL(r.IdLokasi,'') THEN 'Lokasi Berbeda'
                    ELSE 'Cocok' END AS Status
        FROM (SELECT [${j.col}], IdLokasi FROM [dbo].[${j.so}] WHERE NoSO = @NoSO) s
        FULL OUTER JOIN (SELECT [${j.col}], IdLokasi, UserID, DateTimeScan FROM [dbo].[${j.hasil}] WHERE NoSO = @NoSO) r
          ON r.[${j.col}] = s.[${j.col}]`;
    })
    .join(' UNION ALL ');
  const r = await pool.request().input('NoSO', sql.VarChar, noso).query(`${union} ORDER BY Jenis, NoLabel`);
  return (r.recordset || []).map((x) => ({
    NoLabel: clean(x.NoLabel),
    Jenis: x.Jenis,
    JenisNama: JENIS[x.Jenis].nama,
    LokasiSistem: clean(x.LokasiSistem),
    LokasiScan: clean(x.LokasiScan),
    UserID: clean(x.UserID),
    DateTimeScan: x.DateTimeScan,
    Status: x.Status,
  }));
}

// Selisih Ascend: stok sistem (Pcs) vs hasil fisik.
async function laporanAscend(noso) {
  const pool = await poolPromise;
  const r = await pool.request().input('NoSO', sql.VarChar, noso).query(`
    SELECT so.ItemID, it.ItemCode, it.ItemName, uom.UOMCode, so.Pcs,
           sh.QtyFisik, sh.QtyUsage, sh.UsageRemark, sf.FamilyName
    FROM [dbo].[StockOpnameAscend] so
    LEFT JOIN [AS_RU].[dbo].[IC_Items] it ON it.ItemID = so.ItemID
    LEFT JOIN [AS_RU].[dbo].[IC_UOM] uom ON uom.UOMID = it.UOMID1
    LEFT JOIN [AS_RU].[dbo].[IC_StockFamily] sf ON sf.FamilyID = so.FamilyID
    LEFT JOIN [dbo].[StockOpnameAscendHasil] sh ON sh.NoSO = so.NoSO AND sh.ItemID = so.ItemID
    WHERE so.NoSO = @NoSO
    ORDER BY sf.FamilyName, it.ItemName`);
  const num = (v) => (v === null || v === undefined ? null : Number(v));
  return (r.recordset || []).map((x) => {
    const pcs = Number(x.Pcs) || 0;
    const fisik = num(x.QtyFisik);
    const usage = num(x.QtyUsage);
    return {
      ItemID: clean(x.ItemID),
      ItemCode: clean(x.ItemCode),
      ItemName: clean(x.ItemName),
      FamilyName: clean(x.FamilyName),
      Uom: clean(x.UOMCode),
      Pcs: pcs,
      QtyFisik: fisik,
      QtyUsage: usage,
      Selisih: fisik === null ? null : fisik - pcs - (usage ?? 0),
      UsageRemark: clean(x.UsageRemark),
    };
  });
}

// ---------- hapus ----------

// Semua tabel anak ber-kolom NoSO (termasuk tabel lama KayuBulat/STBasah/STKering/Reproses/WIP), dihapus sebelum StockOpname_h.
const SO_CHILD_TABLES = [
  ...Object.values(JENIS).flatMap((j) => [j.hasil, j.so]),
  ...['KayuBulat', 'STBasah', 'STKering', 'Reproses', 'WIP'].flatMap((n) => [`StockOpname_Hasil_d_${n}`, `StockOpname${n}`]),
  'StockOpnameRacipan',
  'StockOpname_Hasil_d_Racipan',
  'StockOpnameAscendHasil',
  'StockOpnameAscend',
  'StockOpnameAscend_dFamily',
  'StockOpname_h_WarehouseID',
];

// Hapus header + seluruh detail (stok awal, hasil scan, data Ascend) satu SO dalam satu transaksi.
async function removeSo(noso, username) {
  const header = await getHeader(noso);
  const noSO = clean(header.NoSO);
  await assertPeriodeTerbuka(new Date(header.Tgl));

  const pool = await poolPromise;
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    for (const table of SO_CHILD_TABLES) {
      await tx.request().input('NoSO', sql.VarChar, noSO).query(`DELETE FROM [dbo].[${table}] WHERE NoSO = @NoSO`);
    }
    await tx.request().input('NoSO', sql.VarChar, noSO).query('DELETE FROM [dbo].[StockOpname_h] WHERE NoSO = @NoSO');

    await riwayat(tx, username, `Menghapus Stock Opname ${noSO}`);
    await tx.commit();
    return { NoSO: noSO };
  } catch (error) {
    try {
      await tx.rollback();
    } catch {
      // transaksi mungkin sudah gagal ditutup driver
    }
    throw error;
  }
}

module.exports = { ascendMeta, ascendFamilyByCategory, create, laporanKayu, laporanAscend, removeSo };
