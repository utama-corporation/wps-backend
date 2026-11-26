/* ===== [dbo].[tr_Audit_POSupplierST_d] ON [dbo].[POSupplierST_d] ===== */
CREATE OR ALTER TRIGGER [dbo].[tr_Audit_POSupplierST_d]
ON [dbo].[POSupplierST_d]
AFTER INSERT, UPDATE, DELETE
AS
BEGIN
  SET NOCOUNT ON;

  BEGIN TRY
    DECLARE @actor nvarchar(128) = LEFT(COALESCE(
      CONVERT(nvarchar(128), TRY_CONVERT(int, SESSION_CONTEXT(N'actor_id'))),
      CAST(SESSION_CONTEXT(N'actor') AS nvarchar(128)),
      SUSER_SNAME()), 128);
    DECLARE @rid nvarchar(64) = LEFT(CAST(SESSION_CONTEXT(N'request_id') AS nvarchar(64)), 64);

    DECLARE @pk nvarchar(200) = (
      SELECT TOP 1 CONCAT('{"NoPO":"', NoPO, '"}')
      FROM (SELECT NoPO FROM inserted UNION SELECT NoPO FROM deleted) x
    );
    IF @pk IS NULL RETURN;

    DECLARE @action varchar(10) =
      CASE
        WHEN NOT EXISTS (SELECT 1 FROM deleted) THEN 'INSERT'
        WHEN NOT EXISTS (SELECT 1 FROM inserted) THEN 'DELETE'
        ELSE 'UPDATE'
      END;

    DECLARE @old nvarchar(max) = (
      SELECT NoPO, NoUrut, IdJenisKayu, Tebal, Lebar, Panjang, JmlhBatang, IdUOMTblLebar
      FROM deleted ORDER BY NoPO, NoUrut FOR JSON PATH, INCLUDE_NULL_VALUES);
    DECLARE @new nvarchar(max) = (
      SELECT NoPO, NoUrut, IdJenisKayu, Tebal, Lebar, Panjang, JmlhBatang, IdUOMTblLebar
      FROM inserted ORDER BY NoPO, NoUrut FOR JSON PATH, INCLUDE_NULL_VALUES);

    IF @action = 'UPDATE' AND @old = @new RETURN;

    INSERT dbo.AuditTrail(Action, TableName, Actor, RequestId, PK, OldData, NewData)
    VALUES (@action, 'POSupplierST_d', @actor, @rid, @pk, @old, @new);
  END TRY
  BEGIN CATCH
    PRINT CONCAT('[AUDIT_WARN][tr_Audit_POSupplierST_d] ', ERROR_MESSAGE());
  END CATCH
END;
