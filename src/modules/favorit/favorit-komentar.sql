-- Jalankan sebelum menerapkan API komentar favorit. Aman dijalankan ulang.
IF OBJECT_ID('dbo.MstUserFavorit', 'U') IS NOT NULL
   AND COL_LENGTH('dbo.MstUserFavorit', 'Komentar') IS NULL
BEGIN
  ALTER TABLE dbo.MstUserFavorit ADD Komentar NVARCHAR(500) NULL;
END;
