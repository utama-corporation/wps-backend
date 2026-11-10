-- Mengizinkan lebih dari satu baris reject per produksi (dulu PK hanya NoProduksi -> maksimal 1 baris).
-- Kunci baru: NoProduksi + ukuran + satuan, selaras dengan merge addReject di backend
-- (ukuran+satuan yang sama digabung batangnya, sehingga kombinasi itu selalu unik).
-- IdUOM NULL (baris lama sebelum kolom UOM dipakai) diisi 1 (mm, default) agar bisa jadi bagian PK.
-- Kolom PK dijadikan NOT NULL (sendiri menjadi syarat PK di SQL Server).

UPDATE dbo.S4SProduksi_Reject        SET IdUOMTblLebar = 1 WHERE IdUOMTblLebar IS NULL;
UPDATE dbo.S4SProduksi_Reject        SET IdUOMPanjang  = 1 WHERE IdUOMPanjang  IS NULL;
UPDATE dbo.PackingProduksi_Reject    SET IdUOMTblLebar = 1 WHERE IdUOMTblLebar IS NULL;
UPDATE dbo.PackingProduksi_Reject    SET IdUOMPanjang  = 1 WHERE IdUOMPanjang  IS NULL;
UPDATE dbo.MouldingProduksi_Reject   SET IdUOMTblLebar = 1 WHERE IdUOMTblLebar IS NULL;
UPDATE dbo.MouldingProduksi_Reject   SET IdUOMPanjang  = 1 WHERE IdUOMPanjang  IS NULL;
UPDATE dbo.LaminatingProduksi_Reject SET IdUOMTblLebar = 1 WHERE IdUOMTblLebar IS NULL;
UPDATE dbo.LaminatingProduksi_Reject SET IdUOMPanjang  = 1 WHERE IdUOMPanjang  IS NULL;
UPDATE dbo.SandingProduksi_Reject    SET IdUOMTblLebar = 1 WHERE IdUOMTblLebar IS NULL;
UPDATE dbo.SandingProduksi_Reject    SET IdUOMPanjang  = 1 WHERE IdUOMPanjang  IS NULL;
UPDATE dbo.CCAkhirProduksi_Reject    SET IdUOMTblLebar = 1 WHERE IdUOMTblLebar IS NULL;
UPDATE dbo.CCAkhirProduksi_Reject    SET IdUOMPanjang  = 1 WHERE IdUOMPanjang  IS NULL;
UPDATE dbo.FJProduksi_Reject         SET IdUOMTblLebar = 1 WHERE IdUOMTblLebar IS NULL;
UPDATE dbo.FJProduksi_Reject         SET IdUOMPanjang  = 1 WHERE IdUOMPanjang  IS NULL;

ALTER TABLE dbo.S4SProduksi_Reject        ALTER COLUMN Tebal INT NOT NULL;
ALTER TABLE dbo.S4SProduksi_Reject        ALTER COLUMN Lebar INT NOT NULL;
ALTER TABLE dbo.S4SProduksi_Reject        ALTER COLUMN Panjang INT NOT NULL;
ALTER TABLE dbo.S4SProduksi_Reject        ALTER COLUMN IdUOMTblLebar INT NOT NULL;
ALTER TABLE dbo.S4SProduksi_Reject        ALTER COLUMN IdUOMPanjang INT NOT NULL;
ALTER TABLE dbo.PackingProduksi_Reject    ALTER COLUMN Tebal INT NOT NULL;
ALTER TABLE dbo.PackingProduksi_Reject    ALTER COLUMN Lebar INT NOT NULL;
ALTER TABLE dbo.PackingProduksi_Reject    ALTER COLUMN Panjang INT NOT NULL;
ALTER TABLE dbo.PackingProduksi_Reject    ALTER COLUMN IdUOMTblLebar INT NOT NULL;
ALTER TABLE dbo.PackingProduksi_Reject    ALTER COLUMN IdUOMPanjang INT NOT NULL;
ALTER TABLE dbo.MouldingProduksi_Reject   ALTER COLUMN Tebal INT NOT NULL;
ALTER TABLE dbo.MouldingProduksi_Reject   ALTER COLUMN Lebar INT NOT NULL;
ALTER TABLE dbo.MouldingProduksi_Reject   ALTER COLUMN Panjang INT NOT NULL;
ALTER TABLE dbo.MouldingProduksi_Reject   ALTER COLUMN IdUOMTblLebar INT NOT NULL;
ALTER TABLE dbo.MouldingProduksi_Reject   ALTER COLUMN IdUOMPanjang INT NOT NULL;
ALTER TABLE dbo.LaminatingProduksi_Reject ALTER COLUMN Tebal INT NOT NULL;
ALTER TABLE dbo.LaminatingProduksi_Reject ALTER COLUMN Lebar INT NOT NULL;
ALTER TABLE dbo.LaminatingProduksi_Reject ALTER COLUMN Panjang INT NOT NULL;
ALTER TABLE dbo.LaminatingProduksi_Reject ALTER COLUMN IdUOMTblLebar INT NOT NULL;
ALTER TABLE dbo.LaminatingProduksi_Reject ALTER COLUMN IdUOMPanjang INT NOT NULL;
ALTER TABLE dbo.SandingProduksi_Reject    ALTER COLUMN Tebal INT NOT NULL;
ALTER TABLE dbo.SandingProduksi_Reject    ALTER COLUMN Lebar INT NOT NULL;
ALTER TABLE dbo.SandingProduksi_Reject    ALTER COLUMN Panjang INT NOT NULL;
ALTER TABLE dbo.SandingProduksi_Reject    ALTER COLUMN IdUOMTblLebar INT NOT NULL;
ALTER TABLE dbo.SandingProduksi_Reject    ALTER COLUMN IdUOMPanjang INT NOT NULL;
ALTER TABLE dbo.CCAkhirProduksi_Reject    ALTER COLUMN Tebal INT NOT NULL;
ALTER TABLE dbo.CCAkhirProduksi_Reject    ALTER COLUMN Lebar INT NOT NULL;
ALTER TABLE dbo.CCAkhirProduksi_Reject    ALTER COLUMN Panjang INT NOT NULL;
ALTER TABLE dbo.CCAkhirProduksi_Reject    ALTER COLUMN IdUOMTblLebar INT NOT NULL;
ALTER TABLE dbo.CCAkhirProduksi_Reject    ALTER COLUMN IdUOMPanjang INT NOT NULL;
ALTER TABLE dbo.FJProduksi_Reject         ALTER COLUMN Tebal INT NOT NULL;
ALTER TABLE dbo.FJProduksi_Reject         ALTER COLUMN Lebar INT NOT NULL;
ALTER TABLE dbo.FJProduksi_Reject         ALTER COLUMN Panjang INT NOT NULL;
ALTER TABLE dbo.FJProduksi_Reject         ALTER COLUMN IdUOMTblLebar INT NOT NULL;
ALTER TABLE dbo.FJProduksi_Reject         ALTER COLUMN IdUOMPanjang INT NOT NULL;

IF EXISTS (SELECT 1 FROM sys.key_constraints WHERE name = 'PK_S4SProduksi_Reject' AND parent_object_id = OBJECT_ID('dbo.S4SProduksi_Reject')
           AND (SELECT COUNT(*) FROM sys.index_columns ic JOIN sys.key_constraints kc ON kc.parent_object_id = ic.object_id AND kc.unique_index_id = ic.index_id WHERE kc.name = 'PK_S4SProduksi_Reject') = 1)
  ALTER TABLE dbo.S4SProduksi_Reject DROP CONSTRAINT PK_S4SProduksi_Reject;
IF NOT EXISTS (SELECT 1 FROM sys.key_constraints WHERE name = 'PK_S4SProduksi_Reject' AND parent_object_id = OBJECT_ID('dbo.S4SProduksi_Reject'))
  ALTER TABLE dbo.S4SProduksi_Reject ADD CONSTRAINT PK_S4SProduksi_Reject PRIMARY KEY CLUSTERED (NoProduksi, Tebal, Lebar, Panjang, IdUOMTblLebar, IdUOMPanjang);

IF EXISTS (SELECT 1 FROM sys.key_constraints WHERE name = 'PK_PackingProduksi_Reject' AND parent_object_id = OBJECT_ID('dbo.PackingProduksi_Reject')
           AND (SELECT COUNT(*) FROM sys.index_columns ic JOIN sys.key_constraints kc ON kc.parent_object_id = ic.object_id AND kc.unique_index_id = ic.index_id WHERE kc.name = 'PK_PackingProduksi_Reject') = 1)
  ALTER TABLE dbo.PackingProduksi_Reject DROP CONSTRAINT PK_PackingProduksi_Reject;
IF NOT EXISTS (SELECT 1 FROM sys.key_constraints WHERE name = 'PK_PackingProduksi_Reject' AND parent_object_id = OBJECT_ID('dbo.PackingProduksi_Reject'))
  ALTER TABLE dbo.PackingProduksi_Reject ADD CONSTRAINT PK_PackingProduksi_Reject PRIMARY KEY CLUSTERED (NoProduksi, Tebal, Lebar, Panjang, IdUOMTblLebar, IdUOMPanjang);

IF EXISTS (SELECT 1 FROM sys.key_constraints WHERE name = 'PK_MouldingProduksi_Reject' AND parent_object_id = OBJECT_ID('dbo.MouldingProduksi_Reject')
           AND (SELECT COUNT(*) FROM sys.index_columns ic JOIN sys.key_constraints kc ON kc.parent_object_id = ic.object_id AND kc.unique_index_id = ic.index_id WHERE kc.name = 'PK_MouldingProduksi_Reject') = 1)
  ALTER TABLE dbo.MouldingProduksi_Reject DROP CONSTRAINT PK_MouldingProduksi_Reject;
IF NOT EXISTS (SELECT 1 FROM sys.key_constraints WHERE name = 'PK_MouldingProduksi_Reject' AND parent_object_id = OBJECT_ID('dbo.MouldingProduksi_Reject'))
  ALTER TABLE dbo.MouldingProduksi_Reject ADD CONSTRAINT PK_MouldingProduksi_Reject PRIMARY KEY CLUSTERED (NoProduksi, Tebal, Lebar, Panjang, IdUOMTblLebar, IdUOMPanjang);

IF EXISTS (SELECT 1 FROM sys.key_constraints WHERE name = 'PK_LaminatingProduksi_Reject' AND parent_object_id = OBJECT_ID('dbo.LaminatingProduksi_Reject')
           AND (SELECT COUNT(*) FROM sys.index_columns ic JOIN sys.key_constraints kc ON kc.parent_object_id = ic.object_id AND kc.unique_index_id = ic.index_id WHERE kc.name = 'PK_LaminatingProduksi_Reject') = 1)
  ALTER TABLE dbo.LaminatingProduksi_Reject DROP CONSTRAINT PK_LaminatingProduksi_Reject;
IF NOT EXISTS (SELECT 1 FROM sys.key_constraints WHERE name = 'PK_LaminatingProduksi_Reject' AND parent_object_id = OBJECT_ID('dbo.LaminatingProduksi_Reject'))
  ALTER TABLE dbo.LaminatingProduksi_Reject ADD CONSTRAINT PK_LaminatingProduksi_Reject PRIMARY KEY CLUSTERED (NoProduksi, Tebal, Lebar, Panjang, IdUOMTblLebar, IdUOMPanjang);

IF EXISTS (SELECT 1 FROM sys.key_constraints WHERE name = 'PK_SandingProduksi_Reject' AND parent_object_id = OBJECT_ID('dbo.SandingProduksi_Reject')
           AND (SELECT COUNT(*) FROM sys.index_columns ic JOIN sys.key_constraints kc ON kc.parent_object_id = ic.object_id AND kc.unique_index_id = ic.index_id WHERE kc.name = 'PK_SandingProduksi_Reject') = 1)
  ALTER TABLE dbo.SandingProduksi_Reject DROP CONSTRAINT PK_SandingProduksi_Reject;
IF NOT EXISTS (SELECT 1 FROM sys.key_constraints WHERE name = 'PK_SandingProduksi_Reject' AND parent_object_id = OBJECT_ID('dbo.SandingProduksi_Reject'))
  ALTER TABLE dbo.SandingProduksi_Reject ADD CONSTRAINT PK_SandingProduksi_Reject PRIMARY KEY CLUSTERED (NoProduksi, Tebal, Lebar, Panjang, IdUOMTblLebar, IdUOMPanjang);

IF EXISTS (SELECT 1 FROM sys.key_constraints WHERE name = 'PK_CCAkhirProduksi_Reject' AND parent_object_id = OBJECT_ID('dbo.CCAkhirProduksi_Reject')
           AND (SELECT COUNT(*) FROM sys.index_columns ic JOIN sys.key_constraints kc ON kc.parent_object_id = ic.object_id AND kc.unique_index_id = ic.index_id WHERE kc.name = 'PK_CCAkhirProduksi_Reject') = 1)
  ALTER TABLE dbo.CCAkhirProduksi_Reject DROP CONSTRAINT PK_CCAkhirProduksi_Reject;
IF NOT EXISTS (SELECT 1 FROM sys.key_constraints WHERE name = 'PK_CCAkhirProduksi_Reject' AND parent_object_id = OBJECT_ID('dbo.CCAkhirProduksi_Reject'))
  ALTER TABLE dbo.CCAkhirProduksi_Reject ADD CONSTRAINT PK_CCAkhirProduksi_Reject PRIMARY KEY CLUSTERED (NoProduksi, Tebal, Lebar, Panjang, IdUOMTblLebar, IdUOMPanjang);

IF EXISTS (SELECT 1 FROM sys.key_constraints WHERE name = 'PK_FJProduksi_Reject' AND parent_object_id = OBJECT_ID('dbo.FJProduksi_Reject')
           AND (SELECT COUNT(*) FROM sys.index_columns ic JOIN sys.key_constraints kc ON kc.parent_object_id = ic.object_id AND kc.unique_index_id = ic.index_id WHERE kc.name = 'PK_FJProduksi_Reject') = 1)
  ALTER TABLE dbo.FJProduksi_Reject DROP CONSTRAINT PK_FJProduksi_Reject;
IF NOT EXISTS (SELECT 1 FROM sys.key_constraints WHERE name = 'PK_FJProduksi_Reject' AND parent_object_id = OBJECT_ID('dbo.FJProduksi_Reject'))
  ALTER TABLE dbo.FJProduksi_Reject ADD CONSTRAINT PK_FJProduksi_Reject PRIMARY KEY CLUSTERED (NoProduksi, Tebal, Lebar, Panjang, IdUOMTblLebar, IdUOMPanjang);
