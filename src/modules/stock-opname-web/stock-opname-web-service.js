const sql = require('mssql');
const { poolPromise } = require('../../core/config/db');
const { badReq, notFound } = require('../../core/utils/http-error');

// Konfigurasi jenis label stock opname (paritas WPS-tablet StockOpnameApi).
const JENIS = {
  ST: { nama: 'Sawn Timber', col: 'NoST', so: 'StockOpnameST', h: 'ST_h', d: null, hasil: 'StockOpname_Hasil_d_ST' },
  S4S: { nama: 'S4S', col: 'NoS4S', so: 'StockOpnameS4S', h: 'S4S_h', d: 'S4S_d', hasil: 'StockOpname_Hasil_d_S4S' },
  FJ: { nama: 'Finger Joint', col: 'NoFJ', so: 'StockOpnameFJ', h: 'FJ_h', d: 'FJ_d', hasil: 'StockOpname_Hasil_d_FJ' },
  MLD: { nama: 'Moulding', col: 'NoMoulding', so: 'StockOpnameMoulding', h: 'Moulding_h', d: 'Moulding_d', hasil: 'StockOpname_Hasil_d_Moulding' },
  LMT: { nama: 'Laminating', col: 'NoLaminating', so: 'StockOpnameLaminating', h: 'Laminating_h', d: 'Laminating_d', hasil: 'StockOpname_Hasil_d_Laminating' },
  CC: { nama: 'CC Akhir', col: 'NoCCAkhir', so: 'StockOpnameCCAkhir', h: 'CCAkhir_h', d: 'CCAkhir_d', hasil: 'StockOpname_Hasil_d_CCAkhir' },
  SND: { nama: 'Sanding', col: 'NoSanding', so: 'StockOpnameSanding', h: 'Sanding_h', d: 'Sanding_d', hasil: 'StockOpname_Hasil_d_Sanding' },
  BJ: { nama: 'Barang Jadi', col: 'NoBJ', so: 'StockOpnameBJ', h: 'BarangJadi_h', d: 'BarangJadi_d', hasil: 'StockOpname_Hasil_d_BJ' },
};

// Huruf awal label -> kode jenis.
const PREFIX = { E: 'ST', R: 'S4S', S: 'FJ', T: 'MLD', U: 'LMT', V: 'CC', W: 'SND', I: 'BJ' };

function clean(v) {
  return String(v ?? '').trim();
}

function toInt(v, fallback = 0) {
  const n = Number.parseInt(v, 10);
  return Number.isNaN(n) ? fallback : n;
}

function paging(q) {
  const page = Math.max(1, toInt(q.page, 1));
  const pageSize = Math.min(200, Math.max(1, toInt(q.pageSize, 50)));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

// "ST,S4S" / "all" / kosong -> daftar kode jenis valid.
function pickJenis(raw) {
  const v = clean(raw);
  if (!v || v.toLowerCase() === 'all') return Object.keys(JENIS);
  const list = [...new Set(v.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean))];
  if (list.some((k) => !JENIS[k])) throw badReq('Jenis label tidak dikenal.');
  return list;
}

async function getHeader(noso) {
  const pool = await poolPromise;
  const r = await pool
    .request()
    .input('NoSO', sql.VarChar, clean(noso))
    .query('SELECT NoSO, Tgl, IsAscend FROM [dbo].[StockOpname_h] WHERE NoSO = @NoSO');
  const row = (r.recordset || [])[0];
  if (!row) throw notFound('No Stock Opname tidak ditemukan');
  return row;
}

async function listHeaders(ascend) {
  const pool = await poolPromise;
  const r = await pool.request().query(`
    SELECT NoSO, Tgl
    FROM [dbo].[StockOpname_h]
    WHERE Tgl > (SELECT MAX(PeriodHarian) FROM [dbo].[MstTutupTransaksiHarian])
      AND ${ascend ? 'IsAscend = 1' : 'ISNULL(IsAscend, 0) <> 1'}
    ORDER BY NoSO DESC;
  `);
  return (r.recordset || []).map((x) => ({ NoSO: clean(x.NoSO), Tgl: x.Tgl }));
}

async function getLokasi() {
  const pool = await poolPromise;
  const r = await pool.request().query('SELECT IdLokasi, Blok FROM [dbo].[MstLokasi] ORDER BY Blok, IdLokasi');
  return (r.recordset || []).map((x) => ({ IdLokasi: clean(x.IdLokasi), Blok: clean(x.Blok) }));
}

function lokasiFilter(request, q) {
  let where = '';
  const blok = clean(q.blok);
  const lokasi = clean(q.lokasi);
  if (blok && blok !== 'Semua') {
    request.input('Blok', sql.VarChar, blok);
    where += ' AND m.Blok = @Blok';
  }
  if (lokasi && lokasi !== 'Semua') {
    request.input('Lokasi', sql.VarChar, lokasi);
    where += ' AND c.IdLokasi = @Lokasi';
  }
  return where;
}

function pageResult(rows, mapRow, total, page, pageSize) {
  return {
    data: (rows || []).map(mapRow),
    page,
    pageSize,
    totalData: total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

// Stok sistem untuk SO ini yang belum ada hasil scan-nya.
async function listStok(noso, q) {
  const header = await getHeader(noso);
  const jenis = pickJenis(q.jenis);
  const { page, pageSize, offset } = paging(q);

  const union = jenis
    .map((k) => {
      const j = JENIS[k];
      const dJoin = j.d ? `AND EXISTS (SELECT 1 FROM [dbo].[${j.d}] d WHERE d.[${j.col}] = s.[${j.col}])` : '';
      return `
        SELECT s.[${j.col}] AS NoLabel, s.IdLokasi, '${k}' AS Jenis
        FROM [dbo].[${j.so}] s
        INNER JOIN [dbo].[${j.h}] h ON h.[${j.col}] = s.[${j.col}]
        WHERE s.NoSO = @NoSO
          AND s.[${j.col}] NOT IN (SELECT [${j.col}] FROM [dbo].[${j.hasil}] WHERE NoSO = @NoSO)
          AND (h.DateUsage > @Tgl OR h.DateUsage IS NULL)
          ${dJoin}`;
    })
    .join(' UNION ALL ');

  const pool = await poolPromise;
  const request = pool.request().input('NoSO', sql.VarChar, clean(header.NoSO)).input('Tgl', sql.DateTime, header.Tgl);
  const where = lokasiFilter(request, q);
  const base = `FROM (${union}) c LEFT JOIN [dbo].[MstLokasi] m ON m.IdLokasi = c.IdLokasi WHERE 1=1 ${where}`;

  const total = await request.query(`SELECT COUNT(*) AS total ${base}`);
  const rows = await request
    .input('Offset', sql.Int, offset)
    .input('Limit', sql.Int, pageSize)
    .query(`
      SELECT c.NoLabel, c.IdLokasi, c.Jenis, m.Blok ${base}
      ORDER BY c.NoLabel OFFSET @Offset ROWS FETCH NEXT @Limit ROWS ONLY`);

  return pageResult(
    rows.recordset,
    (r) => ({
      NoLabel: clean(r.NoLabel),
      IdLokasi: clean(r.IdLokasi),
      Blok: clean(r.Blok),
      Jenis: r.Jenis,
      JenisNama: JENIS[r.Jenis].nama,
    }),
    toInt(total.recordset[0]?.total),
    page,
    pageSize,
  );
}

// Hasil scan (StockOpname_Hasil_d_*).
async function listHasil(noso, q) {
  const header = await getHeader(noso);
  const jenis = pickJenis(q.jenis);
  const { page, pageSize, offset } = paging(q);

  const union = jenis
    .map((k) => {
      const j = JENIS[k];
      return `SELECT [${j.col}] AS NoLabel, IdLokasi, UserID, DateTimeScan, '${k}' AS Jenis
              FROM [dbo].[${j.hasil}] WHERE NoSO = @NoSO`;
    })
    .join(' UNION ALL ');

  const pool = await poolPromise;
  const request = pool.request().input('NoSO', sql.VarChar, clean(header.NoSO));
  let where = lokasiFilter(request, q);
  const user = clean(q.user);
  if (user && user !== 'Semua') {
    request.input('UserID', sql.VarChar, user);
    where += ' AND c.UserID = @UserID';
  }
  const base = `FROM (${union}) c LEFT JOIN [dbo].[MstLokasi] m ON m.IdLokasi = c.IdLokasi WHERE 1=1 ${where}`;

  const total = await request.query(`SELECT COUNT(*) AS total ${base}`);
  const rows = await request
    .input('Offset', sql.Int, offset)
    .input('Limit', sql.Int, pageSize)
    .query(`
      SELECT c.NoLabel, c.IdLokasi, c.UserID, c.DateTimeScan, c.Jenis, m.Blok ${base}
      ORDER BY c.DateTimeScan DESC, c.NoLabel OFFSET @Offset ROWS FETCH NEXT @Limit ROWS ONLY`);

  return pageResult(
    rows.recordset,
    (r) => ({
      NoLabel: clean(r.NoLabel),
      IdLokasi: clean(r.IdLokasi),
      Blok: clean(r.Blok),
      UserID: clean(r.UserID),
      DateTimeScan: r.DateTimeScan,
      Jenis: r.Jenis,
      JenisNama: JENIS[r.Jenis].nama,
    }),
    toInt(total.recordset[0]?.total),
    page,
    pageSize,
  );
}

async function listUsers(noso) {
  const header = await getHeader(noso);
  const union = Object.values(JENIS)
    .map((j) => `SELECT UserID FROM [dbo].[${j.hasil}] WHERE NoSO = @NoSO`)
    .join(' UNION ');
  const pool = await poolPromise;
  const r = await pool.request().input('NoSO', sql.VarChar, clean(header.NoSO)).query(`${union} ORDER BY UserID`);
  return (r.recordset || []).map((x) => clean(x.UserID)).filter(Boolean);
}

// Ringkasan jumlah label per jenis: terjadwal (stok sistem) vs sudah discan.
async function summary(noso) {
  const header = await getHeader(noso);
  const pool = await poolPromise;
  const parts = Object.entries(JENIS).map(
    ([k, j]) => `
      SELECT '${k}' AS Jenis,
        (SELECT COUNT(*) FROM [dbo].[${j.so}] WHERE NoSO = @NoSO) AS Terjadwal,
        (SELECT COUNT(*) FROM [dbo].[${j.hasil}] WHERE NoSO = @NoSO) AS Discan`,
  );
  const r = await pool.request().input('NoSO', sql.VarChar, clean(header.NoSO)).query(parts.join(' UNION ALL '));
  return (r.recordset || []).map((x) => ({
    Jenis: x.Jenis,
    JenisNama: JENIS[x.Jenis].nama,
    Terjadwal: toInt(x.Terjadwal),
    Discan: toInt(x.Discan),
  }));
}

async function removeHasil(noso, label) {
  const header = await getHeader(noso);
  const no = clean(label);
  const k = PREFIX[no.charAt(0).toUpperCase()];
  if (!k) throw badReq('No label tidak valid.');
  const j = JENIS[k];
  const pool = await poolPromise;
  const r = await pool
    .request()
    .input('NoSO', sql.VarChar, clean(header.NoSO))
    .input('NoLabel', sql.VarChar, no)
    .query(`DELETE FROM [dbo].[${j.hasil}] WHERE NoSO = @NoSO AND [${j.col}] = @NoLabel`);
  if (!r.rowsAffected[0]) throw notFound('Hasil scan tidak ditemukan');
  return { NoLabel: no };
}

// ---------- Ascend (spare part) ----------

async function ascendFamilies(noso) {
  const header = await getHeader(noso);
  const pool = await poolPromise;
  const r = await pool.request().input('NoSO', sql.VarChar, clean(header.NoSO)).query(`
    SELECT f.CategoryID, f.FamilyID, ISNULL(sf.FamilyName, '') AS FamilyName,
           COUNT(s.ItemID) AS TotalItem, COUNT(DISTINCT sh.ItemID) AS CompleteItem
    FROM [dbo].[StockOpnameAscend_dFamily] f
    LEFT JOIN [AS_RU].[dbo].[IC_StockFamily] sf ON f.FamilyID = sf.FamilyID
    LEFT JOIN [dbo].[StockOpnameAscend] s
           ON f.NoSO = s.NoSO AND f.CategoryID = s.CategoryID AND f.FamilyID = s.FamilyID
    LEFT JOIN [dbo].[StockOpnameAscendHasil] sh ON s.NoSO = sh.NoSO AND s.ItemID = sh.ItemID
    WHERE f.NoSO = @NoSO
    GROUP BY f.NoSO, f.CategoryID, f.FamilyID, sf.FamilyName
    ORDER BY f.FamilyID ASC`);
  return (r.recordset || []).map((x) => ({
    CategoryID: clean(x.CategoryID),
    FamilyID: clean(x.FamilyID),
    FamilyName: clean(x.FamilyName),
    TotalItem: toInt(x.TotalItem),
    CompleteItem: toInt(x.CompleteItem),
  }));
}

async function ascendItems(noso, q) {
  const header = await getHeader(noso);
  const family = clean(q.family);
  if (!family) throw badReq('Family wajib dipilih.');
  const kw = `%${clean(q.q)}%`;
  const pool = await poolPromise;
  const r = await pool
    .request()
    .input('NoSO', sql.VarChar, clean(header.NoSO))
    .input('Family', sql.VarChar, family)
    .input('Kw', sql.VarChar, kw)
    .query(`
      SELECT so.ItemID, sc.Codes, it.ItemCode, it.ItemName, so.Pcs, uom.UOMCode,
             sh.QtyFisik, sh.QtyUsage, sh.UsageRemark, sh.IsUpdateUsage
      FROM [dbo].[StockOpnameAscend] so
      LEFT JOIN [AS_RU].[dbo].[IC_Items] it ON so.ItemID = it.ItemID
      LEFT JOIN [AS_RU].[dbo].[IC_ItemShelf] sc ON so.ItemID = sc.ItemID
      LEFT JOIN [dbo].[StockOpnameAscendHasil] sh ON so.NoSO = sh.NoSO AND so.ItemID = sh.ItemID
      LEFT JOIN [AS_RU].[dbo].[IC_UOM] uom ON uom.UOMID = it.UOMID1
      WHERE so.NoSO = @NoSO AND so.FamilyID = @Family
        AND (so.ItemID LIKE @Kw OR it.ItemName LIKE @Kw)
      ORDER BY it.ItemName ASC`);
  const num = (v) => (v === null || v === undefined ? null : Number(v));
  return (r.recordset || []).map((x) => ({
    ItemID: clean(x.ItemID),
    ShelfCode: clean(x.Codes),
    ItemCode: clean(x.ItemCode),
    ItemName: clean(x.ItemName),
    Pcs: Number(x.Pcs) || 0,
    Uom: clean(x.UOMCode),
    QtyFisik: num(x.QtyFisik),
    QtyUsage: num(x.QtyUsage),
    UsageRemark: clean(x.UsageRemark),
    IsUpdateUsage: x.IsUpdateUsage === true || x.IsUpdateUsage === 1,
  }));
}

// Pemakaian item sejak tanggal SO (pemakaian, adjustment, penjualan, retur pembelian).
async function ascendUsage(noso, itemId) {
  const header = await getHeader(noso);
  const id = clean(itemId);
  if (!id) throw badReq('ItemID wajib diisi.');
  const pool = await poolPromise;
  const r = await pool
    .request()
    .input('Tgl', sql.DateTime, header.Tgl)
    .input('ItemID', sql.VarChar, id)
    .query(`
      SELECT (0 - ISNULL(Z.QtyUsg,0) + ISNULL(Z.QtyUbb,0) - ISNULL(Z.QtySls,0) - ISNULL(Z.QtyPR,0)) AS Hasil
      FROM (
        SELECT AA.ItemID,
               ISNULL(CC.QtyUsg,0) AS QtyUsg, ISNULL(DD.QtyUsg,0) AS QtyUbb,
               ISNULL(EE.QtySls,0) AS QtySls, ISNULL(FF.QtyPrcOut,0) AS QtyPR
        FROM (SELECT I.ItemID FROM AS_RU.dbo.IC_Items I WHERE I.Disabled=0 AND I.ItemType=0) AA
        LEFT JOIN (
          SELECT U.ItemID, SUM(AS_RU.dbo.UDF_Common_ConvertToSmallestUOMEx(Packing2,Packing3,Packing4,Quantity,UOMLevel)) AS QtyUsg
          FROM AS_RU.dbo.IC_UsageDetails U
          JOIN AS_RU.dbo.IC_Usages UH ON UH.UsageID=U.UsageID
          WHERE UH.UsageDate>=@Tgl AND UH.Void=0 AND Approved=1
          GROUP BY U.ItemID) CC ON CC.ItemID=AA.ItemID
        LEFT JOIN (
          SELECT U.ItemID, SUM(AS_RU.dbo.UDF_Common_ConvertToSmallestUOMEx(Packing2,Packing3,Packing4,QtyAdjustBy,UOMLevel)) AS QtyUsg
          FROM AS_RU.dbo.IC_AdjustmentDetails U
          JOIN AS_RU.dbo.IC_Adjustments UH ON UH.AdjustmentID=U.AdjustmentID
          WHERE UH.AdjustmentDate>=@Tgl AND UH.Void=0 AND UH.Approved=1
          GROUP BY U.ItemID) DD ON DD.ItemID=AA.ItemID
        LEFT JOIN (
          SELECT U.ItemID, SUM(AS_RU.dbo.UDF_Common_ConvertToSmallestUOMEx(Packing2,Packing3,Packing4,Quantity,UOMLevel)) AS QtySls
          FROM AS_RU.dbo.AR_InvoiceDetails U
          JOIN AS_RU.dbo.AR_Invoices UH ON UH.InvoiceID=U.InvoiceID
          WHERE UH.InvoiceDate>=@Tgl AND UH.Void=0
          GROUP BY U.ItemID) EE ON EE.ItemID=AA.ItemID
        LEFT JOIN (
          SELECT D.ItemID, SUM(AS_RU.dbo.UDF_Common_ConvertToSmallestUOMEx(Packing2,Packing3,Packing4,Quantity,UOMLevel)) AS QtyPrcOut
          FROM AS_RU.dbo.AP_PurchaseDetails D
          JOIN AS_RU.dbo.AP_Purchases P ON P.PurchaseID=D.PurchaseID
          WHERE P.PurchaseDate>=@Tgl AND P.Void=0 AND IsPurchase=0
          GROUP BY D.ItemID) FF ON FF.ItemID=AA.ItemID
      ) Z
      WHERE Z.ItemID = @ItemID`);
  return { ItemID: id, QtyUsage: Number(r.recordset[0]?.Hasil) || 0 };
}

async function ascendSave(noso, items) {
  const header = await getHeader(noso);
  const list = (Array.isArray(items) ? items : []).filter(
    (i) => clean(i?.itemId) && i.qtyFisik !== null && i.qtyFisik !== undefined && i.qtyFisik !== '',
  );
  if (!list.length) throw badReq('Tidak ada data yang diisi.');
  for (const i of list) {
    if (!Number.isFinite(Number(i.qtyFisik))) throw badReq(`Qty fisik item ${clean(i.itemId)} tidak valid.`);
  }

  const pool = await poolPromise;
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    for (const i of list) {
      await tx
        .request()
        .input('NoSO', sql.VarChar, clean(header.NoSO))
        .input('ItemID', sql.VarChar, clean(i.itemId))
        .input('QtyFisik', sql.Decimal(18, 6), Number(i.qtyFisik))
        .input('QtyUsage', sql.Decimal(18, 6), Number.isFinite(Number(i.qtyUsage)) ? Number(i.qtyUsage) : 0)
        .input('UsageRemark', sql.VarChar, clean(i.usageRemark))
        .query(`
          MERGE [dbo].[StockOpnameAscendHasil] AS t
          USING (SELECT @NoSO AS NoSO, @ItemID AS ItemID) AS s ON t.NoSO = s.NoSO AND t.ItemID = s.ItemID
          WHEN MATCHED THEN UPDATE SET QtyFisik = @QtyFisik, QtyUsage = @QtyUsage, UsageRemark = @UsageRemark, IsUpdateUsage = 1
          WHEN NOT MATCHED THEN INSERT (NoSO, ItemID, QtyFisik, QtyUsage, UsageRemark, IsUpdateUsage)
            VALUES (@NoSO, @ItemID, @QtyFisik, @QtyUsage, @UsageRemark, 1);`);
    }
    await tx.commit();
    return { saved: list.length };
  } catch (error) {
    try {
      await tx.rollback();
    } catch {
      // transaksi mungkin sudah gagal ditutup driver
    }
    throw error;
  }
}

async function ascendRemove(noso, itemId) {
  const header = await getHeader(noso);
  const id = clean(itemId);
  if (!id) throw badReq('ItemID wajib diisi.');
  const pool = await poolPromise;
  const r = await pool
    .request()
    .input('NoSO', sql.VarChar, clean(header.NoSO))
    .input('ItemID', sql.VarChar, id)
    .query('DELETE FROM [dbo].[StockOpnameAscendHasil] WHERE NoSO = @NoSO AND ItemID = @ItemID');
  if (!r.rowsAffected[0]) throw notFound('Hasil opname item tidak ditemukan');
  return { ItemID: id };
}

module.exports = {
  JENIS,
  getHeader,
  listHeaders,
  getLokasi,
  listStok,
  listHasil,
  listUsers,
  summary,
  removeHasil,
  ascendFamilies,
  ascendItems,
  ascendUsage,
  ascendSave,
  ascendRemove,
};
