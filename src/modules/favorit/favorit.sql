/* Tabel favorit per user (menu Favorit di WPS Web).
 * tipe  : jenis entri ('laporan' sekarang; 'menu' menyusul)
 * kode  : laporan = slug viewer; menu = href
 * urutan: urutan tampil di sidebar (1..n) per user
 * Aman dijalankan ulang. */
IF OBJECT_ID('dbo.MstUserFavorit', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.MstUserFavorit (
    IdUsername INT          NOT NULL,
    Tipe       VARCHAR(20)  NOT NULL,
    Kode       VARCHAR(200) NOT NULL,
    Urutan     INT          NOT NULL,
    CONSTRAINT PK_MstUserFavorit PRIMARY KEY (IdUsername, Tipe, Kode)
  );
END
