const sql = require('mssql');
const { poolPromise } = require('../../core/config/db');
const { badReq } = require('../../core/utils/http-error');
const { assertPeriodeTerbuka } = require('../../core/utils/periode-lock');
const { JENIS } = require('./stock-opname-web-service');

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
      .input('IsAscend', sql.Bit, asc ? 1 : 0)
      .query(`
        INSERT INTO StockOpname_h
          (NoSO, Tgl, IsKB, IsSTBasah, IsSTKering, IsS4S, IsFJ, IsMoulding, IsLaminating, IsCCAkhir,
           IsSanding, IsReproses, IsWIP, IsBJ, IsST, IsAscend)
        VALUES
          (@NoSO, CAST(@Tgl AS datetime), 0, 0, 0, @IsS4S, @IsFJ, @IsMoulding, @IsLaminating, @IsCCAkhir,
           @IsSanding, 0, 0, @IsBJ, @IsST, @IsAscend)`);

    // Stok awal per jenis label: dibuat sebelum tanggal SO dan belum terpakai pada tanggal SO.
    for (const k of jenis) {
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

module.exports = { ascendMeta, ascendFamilyByCategory, create, laporanKayu, laporanAscend };
