/* PO Supplier ST: satu PO bisa berisi lebih dari satu jenis kayu.
 * Jenis kayu kembali ke tiap baris detail; data lama disalin dari header.
 * Aman dijalankan ulang. Setelah ini WAJIB jalankan ulang R__tr_Audit_POSupplierST_h/_d. */

/* Trigger lama dilepas dulu (header membaca kolom yang akan dihapus), dibuat lagi oleh R__. */
IF OBJECT_ID(N'dbo.tr_Audit_POSupplierST_h', N'TR') IS NOT NULL
  DROP TRIGGER dbo.tr_Audit_POSupplierST_h;
GO
IF OBJECT_ID(N'dbo.tr_Audit_POSupplierST_d', N'TR') IS NOT NULL
  DROP TRIGGER dbo.tr_Audit_POSupplierST_d;
GO

IF COL_LENGTH(N'dbo.POSupplierST_d', N'IdJenisKayu') IS NULL
  ALTER TABLE dbo.POSupplierST_d ADD IdJenisKayu int NOT NULL CONSTRAINT DF_POSupplierST_d_Jenis DEFAULT (0);
GO

IF COL_LENGTH(N'dbo.POSupplierST_h', N'IdJenisKayu') IS NOT NULL
BEGIN
  EXEC(N'
    UPDATE d
    SET IdJenisKayu = h.IdJenisKayu
    FROM dbo.POSupplierST_d d
    INNER JOIN dbo.POSupplierST_h h ON h.NoPO = d.NoPO
    WHERE d.IdJenisKayu = 0 AND h.IdJenisKayu IS NOT NULL;
  ');
  ALTER TABLE dbo.POSupplierST_h DROP COLUMN IdJenisKayu;
END
GO
