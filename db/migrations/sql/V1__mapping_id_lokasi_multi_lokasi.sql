/* Mapping ID Lokasi: satu kombinasi Bagian/Jenis/Grade boleh memetakan
 * beberapa lokasi. Kunci unik lama (IdBagian, IdJenisKayu, IdGrade) harus
 * digantikan oleh (IdBagian, IdJenisKayu, IdGrade, IdLokasi).
 * Idempoten: aman dijalankan ulang.
 */

IF EXISTS (
  SELECT IdBagian, IdJenisKayu, IdGrade, IdLokasi
  FROM dbo.MstBagianJenisKayuGradeWarnaToIDLocation
  GROUP BY IdBagian, IdJenisKayu, IdGrade, IdLokasi
  HAVING COUNT(*) > 1
)
  THROW 50010, 'Ada duplikat kombinasi (IdBagian, IdJenisKayu, IdGrade, IdLokasi); unikkan dulu data sebelum migration.', 1;

IF EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('dbo.MstBagianJenisKayuGradeWarnaToIDLocation')
    AND name = 'IdLokasi' AND is_nullable = 1
)
  ALTER TABLE dbo.MstBagianJenisKayuGradeWarnaToIDLocation
    ALTER COLUMN IdLokasi varchar(5) NOT NULL;

IF EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE object_id = OBJECT_ID('dbo.MstBagianJenisKayuGradeWarnaToIDLocation')
    AND name = 'PK_MstBagianJenisKayuGradeWarnaToIDLocation1'
)
  ALTER TABLE dbo.MstBagianJenisKayuGradeWarnaToIDLocation
    DROP CONSTRAINT PK_MstBagianJenisKayuGradeWarnaToIDLocation1;

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE object_id = OBJECT_ID('dbo.MstBagianJenisKayuGradeWarnaToIDLocation')
    AND name = 'UQ_MstBagianJenisKayuGradeWarnaToIDLocation'
)
  CREATE UNIQUE CLUSTERED INDEX UQ_MstBagianJenisKayuGradeWarnaToIDLocation
    ON dbo.MstBagianJenisKayuGradeWarnaToIDLocation (IdBagian, IdJenisKayu, IdGrade, IdLokasi);
