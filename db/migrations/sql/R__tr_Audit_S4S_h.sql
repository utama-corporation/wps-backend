/* ===== [dbo].[tr_Audit_S4S_h] ON [dbo].[S4S_h] ===== */
  CREATE OR ALTER TRIGGER [dbo].[tr_Audit_S4S_h]
  ON [dbo].[S4S_h]
  AFTER INSERT, UPDATE, DELETE
  AS
  BEGIN
    SET NOCOUNT ON;

    BEGIN TRY
      DECLARE @actor nvarchar(128) =
        COALESCE(
          CONVERT(nvarchar(128), TRY_CONVERT(int, SESSION_CONTEXT(N'actor_id'))),
          CAST(SESSION_CONTEXT(N'actor') AS nvarchar(128)),
          SUSER_SNAME()
        );

      DECLARE @rid nvarchar(64) =
        CAST(SESSION_CONTEXT(N'request_id') AS nvarchar(64));

      -- Ikuti panjang kolom AuditTrail agar tidak overflow
      DECLARE @pkMax int = COALESCE(NULLIF(COL_LENGTH('dbo.AuditTrail','PK') / 2, 0), 800);
      DECLARE @pk nvarchar(max);

      ;WITH x AS (
        SELECT NoS4S FROM inserted
        UNION
        SELECT NoS4S FROM deleted
      )
      SELECT
        @pk =
          CASE
            WHEN COUNT(1) = 1
              THEN CONCAT('{"NoS4S":"', MAX(NoS4S), '"}')
            ELSE
              CONCAT('{"PKList":', (SELECT NoS4S FROM x ORDER BY NoS4S FOR JSON PATH), '}')
          END
      FROM x;

      -- Jika kepanjangan, pakai ringkasan agar tidak gagal insert audit
      IF @pk IS NOT NULL AND LEN(@pk) > @pkMax
      BEGIN
        ;WITH x AS (
          SELECT NoS4S FROM inserted
          UNION
          SELECT NoS4S FROM deleted
        )
        SELECT
          @pk = CONCAT(
            '{"PKListSummary":{"Count":', COUNT(1),
            ',"FirstNoS4S":"', MIN(NoS4S),
            '","LastNoS4S":"', MAX(NoS4S), '"}}'
          )
        FROM x;
      END;

      -- Hard cap terakhir
      SET @pk = LEFT(@pk, @pkMax);
      SET @actor = LEFT(@actor, 128);
      SET @rid = LEFT(@rid, 64);

      /* INSERT */
      IF EXISTS (SELECT 1 FROM inserted) AND NOT EXISTS (SELECT 1 FROM deleted)
      BEGIN
        INSERT dbo.AuditTrail(Action, TableName, Actor, RequestId, PK, OldData, NewData)
        SELECT
          'INSERT',
          'S4S_h',
          @actor,
          @rid,
          @pk,
          NULL,
          (
            SELECT
              i.NoS4S, i.IdJenisKayu, i.IdGrade, i.IdOrgTelly, i.DateCreate, i.DateUsage,
              i.NoSTAsal, i.IdUOMTblLebar, i.IdUOMPanjang, i.NoSPK, i.Jam, i.IsReject,
              i.IdWarehouse, i.IdFJProfile, i.IdLokasi, i.IsLembur, i.HasBeenPrinted,
              i.IdFisik, i.NoSPKAsal, i.Remark, i.LastPrintDate, i.IdWarna, i.NoSPKTujuan,
              i.IsRepair, i.IsReproses
            FROM inserted i
            ORDER BY i.NoS4S
            FOR JSON PATH
          );
      END

      /* DELETE */
      IF EXISTS (SELECT 1 FROM deleted) AND NOT EXISTS (SELECT 1 FROM inserted)
      BEGIN
        INSERT dbo.AuditTrail(Action, TableName, Actor, RequestId, PK, OldData, NewData)
        SELECT
          'DELETE',
          'S4S_h',
          @actor,
          @rid,
          @pk,
          (
            SELECT
              d.NoS4S, d.IdJenisKayu, d.IdGrade, d.IdOrgTelly, d.DateCreate, d.DateUsage,
              d.NoSTAsal, d.IdUOMTblLebar, d.IdUOMPanjang, d.NoSPK, d.Jam, d.IsReject,
              d.IdWarehouse, d.IdFJProfile, d.IdLokasi, d.IsLembur, d.HasBeenPrinted,
              d.IdFisik, d.NoSPKAsal, d.Remark, d.LastPrintDate, d.IdWarna, d.NoSPKTujuan,
              d.IsRepair, d.IsReproses
            FROM deleted d
            ORDER BY d.NoS4S
            FOR JSON PATH
          ),
          NULL;
      END

      /* UPDATE */
      IF EXISTS (SELECT 1 FROM inserted) AND EXISTS (SELECT 1 FROM deleted)
      BEGIN
        -- Klasifikasi perubahan per baris: lokasi / cetak / kolom lain.
        DECLARE @chg TABLE (
          NoS4S    nvarchar(100) NOT NULL PRIMARY KEY,
          LokChg   bit NOT NULL,
          PrintChg bit NOT NULL,
          OtherChg bit NOT NULL
        );

        INSERT @chg (NoS4S, LokChg, PrintChg, OtherChg)
        SELECT
          i.NoS4S,
          CASE WHEN ISNULL(i.IdLokasi, '') <> ISNULL(d.IdLokasi, '') THEN 1 ELSE 0 END,
          CASE WHEN ISNULL(i.HasBeenPrinted, 0) <> ISNULL(d.HasBeenPrinted, 0)
                 OR ISNULL(i.LastPrintDate, '1900-01-01') <> ISNULL(d.LastPrintDate, '1900-01-01')
               THEN 1 ELSE 0 END,
          CASE WHEN
                 ISNULL(i.IdJenisKayu, '') <> ISNULL(d.IdJenisKayu, '')
              OR ISNULL(i.IdGrade, '') <> ISNULL(d.IdGrade, '')
              OR ISNULL(i.IdOrgTelly, '') <> ISNULL(d.IdOrgTelly, '')
              OR ISNULL(i.DateCreate, '1900-01-01') <> ISNULL(d.DateCreate, '1900-01-01')
              OR ISNULL(i.DateUsage, '1900-01-01') <> ISNULL(d.DateUsage, '1900-01-01')
              OR ISNULL(i.NoSTAsal, '') <> ISNULL(d.NoSTAsal, '')
              OR ISNULL(i.IdUOMTblLebar, '') <> ISNULL(d.IdUOMTblLebar, '')
              OR ISNULL(i.IdUOMPanjang, '') <> ISNULL(d.IdUOMPanjang, '')
              OR ISNULL(i.NoSPK, '') <> ISNULL(d.NoSPK, '')
              OR ISNULL(i.Jam, '00:00:00.000') <> ISNULL(d.Jam, '00:00:00.000')
              OR ISNULL(i.IsReject, 0) <> ISNULL(d.IsReject, 0)
              OR ISNULL(i.IdWarehouse, '') <> ISNULL(d.IdWarehouse, '')
              OR ISNULL(i.IdFJProfile, '') <> ISNULL(d.IdFJProfile, '')
              OR ISNULL(i.IsLembur, 0) <> ISNULL(d.IsLembur, 0)
              OR ISNULL(i.IdFisik, '') <> ISNULL(d.IdFisik, '')
              OR ISNULL(i.NoSPKAsal, '') <> ISNULL(d.NoSPKAsal, '')
              OR ISNULL(i.Remark, '') <> ISNULL(d.Remark, '')
              OR ISNULL(i.IdWarna, '') <> ISNULL(d.IdWarna, '')
              OR ISNULL(i.NoSPKTujuan, '') <> ISNULL(d.NoSPKTujuan, '')
              OR ISNULL(i.IsRepair, 0) <> ISNULL(d.IsRepair, 0)
              OR ISNULL(i.IsReproses, 0) <> ISNULL(d.IsReproses, 0)
               THEN 1 ELSE 0 END
        FROM inserted i
        INNER JOIN deleted d ON i.NoS4S = d.NoS4S;

        -- Buang baris tanpa perubahan nyata (UPDATE no-op tidak diaudit).
        DELETE FROM @chg WHERE LokChg = 0 AND PrintChg = 0 AND OtherChg = 0;

        IF EXISTS (SELECT 1 FROM @chg)
        BEGIN
          DECLARE @action varchar(50);
          DECLARE @oldData nvarchar(max);
          DECLARE @newData nvarchar(max);

          -- PRINT / MAPPING hanya bila itu SATU-SATUNYA jenis perubahan.
          SET @action =
            CASE
              WHEN EXISTS (SELECT 1 FROM @chg WHERE OtherChg = 1)
                OR (EXISTS (SELECT 1 FROM @chg WHERE LokChg = 1)
                    AND EXISTS (SELECT 1 FROM @chg WHERE PrintChg = 1))
                THEN 'UPDATE'
              WHEN EXISTS (SELECT 1 FROM @chg WHERE PrintChg = 1) THEN 'PRINT'
              ELSE 'MAPPING'
            END;

          IF @action = 'MAPPING'
          BEGIN
            SET @oldData = (
              SELECT d.NoS4S, d.IdLokasi
              FROM deleted d INNER JOIN @chg c ON c.NoS4S = d.NoS4S
              ORDER BY d.NoS4S FOR JSON PATH
            );
            SET @newData = (
              SELECT i.NoS4S, i.IdLokasi
              FROM inserted i INNER JOIN @chg c ON c.NoS4S = i.NoS4S
              ORDER BY i.NoS4S FOR JSON PATH
            );
          END
          ELSE IF @action = 'PRINT'
          BEGIN
            SET @oldData = (
              SELECT d.NoS4S, d.HasBeenPrinted, d.LastPrintDate
              FROM deleted d INNER JOIN @chg c ON c.NoS4S = d.NoS4S
              ORDER BY d.NoS4S FOR JSON PATH
            );
            SET @newData = (
              SELECT i.NoS4S, i.HasBeenPrinted, i.LastPrintDate
              FROM inserted i INNER JOIN @chg c ON c.NoS4S = i.NoS4S
              ORDER BY i.NoS4S FOR JSON PATH
            );
          END
          ELSE
          BEGIN
            SET @oldData = (
              SELECT
                d.NoS4S, d.IdJenisKayu, d.IdGrade, d.IdOrgTelly, d.DateCreate, d.DateUsage,
                d.NoSTAsal, d.IdUOMTblLebar, d.IdUOMPanjang, d.NoSPK, d.Jam, d.IsReject,
                d.IdWarehouse, d.IdFJProfile, d.IdLokasi, d.IsLembur, d.HasBeenPrinted,
                d.IdFisik, d.NoSPKAsal, d.Remark, d.LastPrintDate, d.IdWarna, d.NoSPKTujuan,
                d.IsRepair, d.IsReproses
              FROM deleted d INNER JOIN @chg c ON c.NoS4S = d.NoS4S
              ORDER BY d.NoS4S FOR JSON PATH
            );
            SET @newData = (
              SELECT
                i.NoS4S, i.IdJenisKayu, i.IdGrade, i.IdOrgTelly, i.DateCreate, i.DateUsage,
                i.NoSTAsal, i.IdUOMTblLebar, i.IdUOMPanjang, i.NoSPK, i.Jam, i.IsReject,
                i.IdWarehouse, i.IdFJProfile, i.IdLokasi, i.IsLembur, i.HasBeenPrinted,
                i.IdFisik, i.NoSPKAsal, i.Remark, i.LastPrintDate, i.IdWarna, i.NoSPKTujuan,
                i.IsRepair, i.IsReproses
              FROM inserted i INNER JOIN @chg c ON c.NoS4S = i.NoS4S
              ORDER BY i.NoS4S FOR JSON PATH
            );
          END

          INSERT dbo.AuditTrail(Action, TableName, Actor, RequestId, PK, OldData, NewData)
          VALUES (@action, 'S4S_h', @actor, @rid, @pk, @oldData, @newData);
        END
      END
    END TRY
    BEGIN CATCH
      -- Non-blocking audit: jangan gagalkan transaksi utama
      PRINT CONCAT('[AUDIT_WARN][tr_Audit_S4S_h] ', ERROR_MESSAGE());
    END CATCH
  END;
