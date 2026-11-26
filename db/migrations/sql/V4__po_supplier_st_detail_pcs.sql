/* PO Supplier ST: detail mengikuti bentuk ST_d (Tebal, Lebar, Panjang, JmlhBatang).
 * - Jenis kayu pindah ke header (seperti ST_h).
 * - Satuan TON/PCS, Qty, dan IdUOMPanjang dihapus (panjang selalu feet).
 * - Data lama: qty PCS dipindah ke JmlhBatang. Baris TON tidak bisa dikonversi -> JmlhBatang = 0,
 *   isi ulang lewat Ubah PO.
 * Aman dijalankan ulang. Setelah ini WAJIB jalankan ulang R__tr_Audit_POSupplierST_h/_d. */

IF COL_LENGTH(N'dbo.POSupplierST_h', N'IdJenisKayu') IS NULL
  ALTER TABLE dbo.POSupplierST_h ADD IdJenisKayu int NULL;
GO

IF COL_LENGTH(N'dbo.POSupplierST_d', N'JmlhBatang') IS NULL
  ALTER TABLE dbo.POSupplierST_d ADD JmlhBatang int NOT NULL CONSTRAINT DF_POSupplierST_d_Jmlh DEFAULT (0);
GO

/* Trigger lama masih membaca kolom yang akan dihapus: lepas dulu, dibuat lagi oleh R__. */
IF OBJECT_ID(N'dbo.tr_Audit_POSupplierST_d', N'TR') IS NOT NULL
  DROP TRIGGER dbo.tr_Audit_POSupplierST_d;
GO

IF COL_LENGTH(N'dbo.POSupplierST_d', N'IdJenisKayu') IS NOT NULL
  EXEC(N'
    UPDATE h
    SET IdJenisKayu = (SELECT TOP 1 d.IdJenisKayu FROM dbo.POSupplierST_d d
                       WHERE d.NoPO = h.NoPO ORDER BY d.NoUrut)
    FROM dbo.POSupplierST_h h
    WHERE h.IdJenisKayu IS NULL;
  ');
GO

IF COL_LENGTH(N'dbo.POSupplierST_d', N'Qty') IS NOT NULL
  EXEC(N'UPDATE dbo.POSupplierST_d SET JmlhBatang = CONVERT(int, Qty) WHERE Satuan = ''PCS'';');
GO

IF OBJECT_ID(N'dbo.CK_POSupplierST_d_Satuan', N'C') IS NOT NULL
  ALTER TABLE dbo.POSupplierST_d DROP CONSTRAINT CK_POSupplierST_d_Satuan;
IF OBJECT_ID(N'dbo.CK_POSupplierST_d_Qty', N'C') IS NOT NULL
  ALTER TABLE dbo.POSupplierST_d DROP CONSTRAINT CK_POSupplierST_d_Qty;
GO

IF COL_LENGTH(N'dbo.POSupplierST_d', N'Satuan') IS NOT NULL
  ALTER TABLE dbo.POSupplierST_d DROP COLUMN Satuan;
IF COL_LENGTH(N'dbo.POSupplierST_d', N'Qty') IS NOT NULL
  ALTER TABLE dbo.POSupplierST_d DROP COLUMN Qty;
IF COL_LENGTH(N'dbo.POSupplierST_d', N'IdJenisKayu') IS NOT NULL
  ALTER TABLE dbo.POSupplierST_d DROP COLUMN IdJenisKayu;
IF COL_LENGTH(N'dbo.POSupplierST_d', N'IdUOMPanjang') IS NOT NULL
  ALTER TABLE dbo.POSupplierST_d DROP COLUMN IdUOMPanjang;
GO

/* Panjang wajib (seperti ST_d). Baris lama "semua panjang" jadi 0 -> isi lewat Ubah PO. */
UPDATE dbo.POSupplierST_d SET Panjang = 0 WHERE Panjang IS NULL;
ALTER TABLE dbo.POSupplierST_d ALTER COLUMN Panjang decimal(18,2) NOT NULL;
GO
