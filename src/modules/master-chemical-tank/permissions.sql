DECLARE @GroupName NVARCHAR(25) = N'Admin'; -- ganti bila perlu

DECLARE @Perm TABLE (NoPermission VARCHAR(100), Permission VARCHAR(50));
INSERT INTO @Perm VALUES
  ('datamaster_chemicaltank:create', 'Create Master Chemical Tank'),
  ('datamaster_chemicaltank:read',   'Read Master Chemical Tank'),
  ('datamaster_chemicaltank:update', 'Update Master Chemical Tank'),
  ('datamaster_chemicaltank:delete', 'Delete Master Chemical Tank');

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
