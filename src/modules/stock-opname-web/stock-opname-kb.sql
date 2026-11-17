-- Stock opname kayu bulat: baseline sistem dibekukan saat SO dibuat
-- (Pcs/BlkTepakai per log di StockOpnameKayuBulat) dan kolom hasil fisik
-- di StockOpname_Hasil_d_KayuBulat. Idempotent.
IF COL_LENGTH('dbo.StockOpnameKayuBulat', 'Pcs') IS NULL
  ALTER TABLE dbo.StockOpnameKayuBulat ADD Pcs INT NULL;
IF COL_LENGTH('dbo.StockOpnameKayuBulat', 'BlkTepakai') IS NULL
  ALTER TABLE dbo.StockOpnameKayuBulat ADD BlkTepakai INT NULL;
IF COL_LENGTH('dbo.StockOpname_Hasil_d_KayuBulat', 'QtyFisik') IS NULL
  ALTER TABLE dbo.StockOpname_Hasil_d_KayuBulat ADD QtyFisik DECIMAL(18,3) NULL;
IF COL_LENGTH('dbo.StockOpname_Hasil_d_KayuBulat', 'Remark') IS NULL
  ALTER TABLE dbo.StockOpname_Hasil_d_KayuBulat ADD Remark VARCHAR(255) NULL;
