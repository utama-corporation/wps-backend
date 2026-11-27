/* Tarif Upah Stick + upah stick per Label ST (ST_h). Satu label = satu bundle.
 *
 * MstTarifUpahStick: tarif per jenis kayu & tebal (mm), dua kolom tarif
 * (bundle pendek / bundle panjang), berlaku mulai tanggal tertentu.
 * Satu tarif aktif per jenis kayu + tebal + tanggal berlaku.
 *
 * ST_h: JumlahTingkat diisi user di form Label ST; kolom lain adalah hasil
 * hitung yang disimpan saat label disimpan (snapshot), agar upah lama tidak
 * berubah ketika master tarif diedit:
 *   Upah = tarif (pendek/panjang) x JumlahTingkat
 *   Bundle panjang bila batang >= 4 ft mencapai >= 10% dari total batang < 4 ft,
 *   selain itu pendek.
 *
 * Aman dijalankan ulang. */

IF OBJECT_ID(N'dbo.MstTarifUpahStick', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.MstTarifUpahStick (
    IdTarifUpahStick   INT IDENTITY(1, 1) NOT NULL
      CONSTRAINT PK_MstTarifUpahStick PRIMARY KEY,
    IdJenisKayu        INT            NOT NULL,
    Tebal              DECIMAL(10, 2) NOT NULL,
    TarifBundlePendek  DECIMAL(18, 2) NOT NULL,
    TarifBundlePanjang DECIMAL(18, 2) NOT NULL,
    BerlakuMulai       DATE           NOT NULL,
    [Enable]           BIT            NOT NULL
      CONSTRAINT DF_MstTarifUpahStick_Enable DEFAULT (1),
    CONSTRAINT CK_MstTarifUpahStick_Tebal CHECK (Tebal > 0),
    CONSTRAINT CK_MstTarifUpahStick_Tarif CHECK (TarifBundlePendek >= 0 AND TarifBundlePanjang >= 0)
  );
  CREATE UNIQUE INDEX UX_MstTarifUpahStick_Aktif
    ON dbo.MstTarifUpahStick (IdJenisKayu, Tebal, BerlakuMulai)
    WHERE [Enable] = 1;
END;

IF COL_LENGTH(N'dbo.ST_h', N'JumlahTingkat') IS NULL
  ALTER TABLE dbo.ST_h ADD JumlahTingkat INT NULL;

IF COL_LENGTH(N'dbo.ST_h', N'JenisBundleStick') IS NULL
  ALTER TABLE dbo.ST_h ADD JenisBundleStick VARCHAR(10) NULL;

IF COL_LENGTH(N'dbo.ST_h', N'TarifUpahStick') IS NULL
  ALTER TABLE dbo.ST_h ADD TarifUpahStick DECIMAL(18, 2) NULL;

IF COL_LENGTH(N'dbo.ST_h', N'UpahStick') IS NULL
  ALTER TABLE dbo.ST_h ADD UpahStick DECIMAL(18, 2) NULL;

IF COL_LENGTH(N'dbo.ST_h', N'KeteranganUpahStick') IS NULL
  ALTER TABLE dbo.ST_h ADD KeteranganUpahStick VARCHAR(150) NULL;
