/* Modul PO Supplier ST + hubungan opsional dari ST Pembelian. Aman dijalankan ulang. */

IF OBJECT_ID(N'dbo.POSupplierST_h', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.POSupplierST_h (
    NoPO           varchar(13)   NOT NULL CONSTRAINT PK_POSupplierST_h PRIMARY KEY,
    TglPO          date          NOT NULL,
    TglKirim       date          NULL,
    IdSupplier     int           NOT NULL
      CONSTRAINT FK_POSupplierST_h_MstSupplier REFERENCES dbo.MstSupplier (IdSupplier),
    Note           nvarchar(100) NULL,
    IsClosed       bit           NOT NULL CONSTRAINT DF_POSupplierST_h_IsClosed DEFAULT (0),
    TglClose       datetime      NULL,
    IdUserClose    int           NULL,
    IdUserCreate   int           NULL,
    DateTimeCreate datetime      NOT NULL CONSTRAINT DF_POSupplierST_h_Create DEFAULT (GETDATE())
  );
END
GO

IF OBJECT_ID(N'dbo.POSupplierST_d', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.POSupplierST_d (
    NoPO          varchar(13)   NOT NULL
      CONSTRAINT FK_POSupplierST_d_h REFERENCES dbo.POSupplierST_h (NoPO),
    NoUrut        int           NOT NULL,
    IdJenisKayu   int           NOT NULL,
    Tebal         decimal(18,2) NOT NULL,
    Lebar         decimal(18,2) NOT NULL,
    Panjang       decimal(18,2) NULL,      -- NULL = semua panjang
    IdUOMTblLebar int           NOT NULL,
    IdUOMPanjang  int           NOT NULL,
    Satuan        varchar(3)    NOT NULL CONSTRAINT CK_POSupplierST_d_Satuan CHECK (Satuan IN ('TON', 'PCS')),
    Qty           decimal(18,4) NOT NULL CONSTRAINT CK_POSupplierST_d_Qty CHECK (Qty > 0),
    CONSTRAINT PK_POSupplierST_d PRIMARY KEY (NoPO, NoUrut)
  );
END
GO

IF COL_LENGTH(N'dbo.PenerimaanSTPembelian_h', N'NoPO') IS NULL
  ALTER TABLE dbo.PenerimaanSTPembelian_h ADD NoPO varchar(13) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_PenerimaanSTPembelian_h_PO')
  ALTER TABLE dbo.PenerimaanSTPembelian_h
    ADD CONSTRAINT FK_PenerimaanSTPembelian_h_PO FOREIGN KEY (NoPO) REFERENCES dbo.POSupplierST_h (NoPO);
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = N'IX_PenerimaanSTPembelian_h_NoPO' AND object_id = OBJECT_ID(N'dbo.PenerimaanSTPembelian_h')
)
  CREATE INDEX IX_PenerimaanSTPembelian_h_NoPO ON dbo.PenerimaanSTPembelian_h (NoPO);
GO
