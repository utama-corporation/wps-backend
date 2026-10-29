/* Daftarkan permission Master Other Supplier, lalu beri ke grup tertentu.
 * Aman dijalankan ulang. */
DECLARE @GroupName NVARCHAR(25) = N'Admin';

DECLARE @Perm TABLE (NoPermission VARCHAR(100), Permission VARCHAR(50));
INSERT INTO @Perm VALUES
  ('datamaster_othersupplier:create', 'Create Master Other Supplier'),
  ('datamaster_othersupplier:read',   'Read Master Other Supplier'),
  ('datamaster_othersupplier:update', 'Update Master Other Supplier'),
  ('datamaster_othersupplier:delete', 'Delete Master Other Supplier');

INSERT INTO dbo.MstPermissionList (NoPermission, Permission)
SELECT p.NoPermission, p.Permission FROM @Perm p
WHERE NOT EXISTS (SELECT 1 FROM dbo.MstPermissionList x WHERE x.NoPermission = p.NoPermission);

DECLARE @IdUGroup INT = (SELECT TOP 1 IdUGroup FROM dbo.MstUserGroup WHERE UGroupName = @GroupName);
IF @IdUGroup IS NULL
  RAISERROR('Grup tidak ditemukan', 16, 1);
ELSE
  INSERT INTO dbo.MstUserGroupPermission (IdUGroup, NoPermission, Allow)
  SELECT @IdUGroup, p.NoPermission, 1 FROM @Perm p
  WHERE NOT EXISTS (
    SELECT 1 FROM dbo.MstUserGroupPermission x
    WHERE x.IdUGroup = @IdUGroup AND x.NoPermission = p.NoPermission
  );
