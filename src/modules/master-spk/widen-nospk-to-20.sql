/* Samakan panjang NoSPK = varchar(20) di seluruh tabel MstSPK*.
 * Sebelumnya MstSPK_d dan MstSPK_dProgress masih varchar(10), sehingga SPK dengan
 * No. SPK 11-20 karakter gagal disimpan (error "String or binary data would be truncated").
 *
 * Hasil pengecekan (baca-saja) sebelum script ini dibuat:
 *   - Kolom hanya ada di primary key clustered (PK_MstSPK_d2, PK_MstSPK_dProgress).
 *   - Tidak ada foreign key, trigger, default/check constraint, atau view schema-bound.
 *   - Ukuran key setelah pelebaran: MstSPK_d 56 byte, MstSPK_dProgress 20 byte (batas 900).
 * Memperlebar varchar yang ada di PK diizinkan tanpa drop PK, asal NOT NULL dan COLLATE
 * ditulis ulang (tanpa COLLATE, kolom akan memakai collation default database).
 *
 * Aman dijalankan ulang (hanya mengubah kolom yang masih < 20). Jalankan manual, idealnya
 * saat tidak ada transaksi SPK berjalan karena ALTER mengambil schema lock singkat. */

IF EXISTS (SELECT 1 FROM sys.columns
           WHERE object_id = OBJECT_ID('dbo.MstSPK_d') AND name = 'NoSPK' AND max_length < 20)
  ALTER TABLE dbo.MstSPK_d
    ALTER COLUMN NoSPK VARCHAR(20) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL;

IF EXISTS (SELECT 1 FROM sys.columns
           WHERE object_id = OBJECT_ID('dbo.MstSPK_dProgress') AND name = 'NoSPK' AND max_length < 20)
  ALTER TABLE dbo.MstSPK_dProgress
    ALTER COLUMN NoSPK VARCHAR(20) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL;

/* Verifikasi: semua baris harus Len = 20 */
SELECT TABLE_NAME, CHARACTER_MAXIMUM_LENGTH AS Len
FROM INFORMATION_SCHEMA.COLUMNS
WHERE COLUMN_NAME = 'NoSPK' AND TABLE_NAME LIKE 'MstSPK%'
ORDER BY TABLE_NAME;
