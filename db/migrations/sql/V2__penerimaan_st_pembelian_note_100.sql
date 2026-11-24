/* Note Penerimaan ST Pembelian: maksimal 100 karakter (sebelumnya 50).
 * Hanya melebarkan kolom bila saat ini lebih kecil dari 100 (aman dijalankan ulang). */
IF EXISTS (
  SELECT 1
  FROM sys.columns
  WHERE object_id = OBJECT_ID(N'dbo.PenerimaanSTPembelian_h')
    AND name = N'Note'
    AND max_length > 0          -- bukan varchar(max)
    AND max_length < 100
)
BEGIN
  ALTER TABLE dbo.PenerimaanSTPembelian_h ALTER COLUMN Note VARCHAR(100) NULL;
END
