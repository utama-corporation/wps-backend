-- Stock opname racipan detail: baseline saldo racipan (per Jenis × Tebal × Lebar × Panjang)
-- dibekukan saat SO dibuat (StockOpnameRacipan) dan hasil fisik per baris di
-- StockOpname_Hasil_d_Racipan. Idempotent. Jalankan di SSMS / lewat migrate script.
--
-- Isi baseline: saldo akhir (Akhir m3 + AkhirJlhBtg batang) beserta rincian
-- mutasi (Sawal..AdjusmentOutput) as-of tanggal SO, dihitung dengan logika yang
-- sama dengan SPWps_LapMutasiRacipanDetail (TglAwal = 2024-07-01, TglAkhir = tanggal SO).

IF COL_LENGTH('dbo.StockOpname_h', 'IsRacipan') IS NULL
  ALTER TABLE dbo.StockOpname_h ADD IsRacipan BIT NULL;

IF OBJECT_ID('dbo.StockOpnameRacipan', 'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[StockOpnameRacipan] (
    [NoSO]            VARCHAR(13)   NOT NULL,
    [Jenis]           VARCHAR(100)  NOT NULL,
    [Tebal]           FLOAT         NOT NULL,
    [Lebar]           FLOAT         NOT NULL,
    [Panjang]         FLOAT         NOT NULL,
    [Sawal]           DECIMAL(18,4) NOT NULL CONSTRAINT DF_StockOpnameRacipan_Sawal DEFAULT (0),
    [SawalJlhBtg]     INT           NOT NULL CONSTRAINT DF_StockOpnameRacipan_SawalJlhBtg DEFAULT (0),
    [Masuk]           DECIMAL(18,4) NOT NULL CONSTRAINT DF_StockOpnameRacipan_Masuk DEFAULT (0),
    [MskJlhBtg]       INT           NOT NULL CONSTRAINT DF_StockOpnameRacipan_MskJlhBtg DEFAULT (0),
    [AdjusmentOutput] DECIMAL(18,4) NOT NULL CONSTRAINT DF_StockOpnameRacipan_AdjOut DEFAULT (0),
    [AdjOutJlhBtg]    INT           NOT NULL CONSTRAINT DF_StockOpnameRacipan_AdjOutJlhBtg DEFAULT (0),
    [Keluar]          DECIMAL(18,4) NOT NULL CONSTRAINT DF_StockOpnameRacipan_Keluar DEFAULT (0),
    [KeluarJlhBtg]    INT           NOT NULL CONSTRAINT DF_StockOpnameRacipan_KeluarJlhBtg DEFAULT (0),
    [AdjusmentInput]  DECIMAL(18,4) NOT NULL CONSTRAINT DF_StockOpnameRacipan_AdjIn DEFAULT (0),
    [AdjInJlhBtg]     INT           NOT NULL CONSTRAINT DF_StockOpnameRacipan_AdjInJlhBtg DEFAULT (0),
    [Akhir]           DECIMAL(18,4) NOT NULL CONSTRAINT DF_StockOpnameRacipan_Akhir DEFAULT (0),
    [AkhirJlhBtg]     INT           NOT NULL CONSTRAINT DF_StockOpnameRacipan_AkhirJlhBtg DEFAULT (0),
    CONSTRAINT [PK_StockOpnameRacipan] PRIMARY KEY CLUSTERED ([NoSO], [Jenis], [Tebal], [Lebar], [Panjang])
  );
END

IF OBJECT_ID('dbo.StockOpname_Hasil_d_Racipan', 'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[StockOpname_Hasil_d_Racipan] (
    [NoSO]         VARCHAR(13)  NOT NULL,
    [Jenis]        VARCHAR(100) NOT NULL,
    [Tebal]        FLOAT        NOT NULL,
    [Lebar]        FLOAT        NOT NULL,
    [Panjang]      FLOAT        NOT NULL,
    [QtyFisik]     INT          NULL,          -- batang ("Stok Sekarang")
    [Remark]       VARCHAR(255) NULL,
    [UserID]       VARCHAR(15)  NULL,
    [DateTimeScan] DATETIME     NULL,
    CONSTRAINT [PK_StockOpname_Hasil_d_Racipan] PRIMARY KEY CLUSTERED ([NoSO], [Jenis], [Tebal], [Lebar], [Panjang])
  );
END
