/* Permission khusus halaman User SO. Aman dijalankan ulang. */
DECLARE @GroupName NVARCHAR(25) = N'Admin';
DECLARE @Perm TABLE (NoPermission VARCHAR(100), Permission VARCHAR(100));
INSERT INTO @Perm VALUES
  ('tambahakunso:read', 'Read User SO'),
  ('tambahakunso:create', 'Create User SO'),
  ('tambahakunso:update', 'Update User SO'),
  ('tambahakunso:delete', 'Delete User SO');
INSERT INTO dbo.MstPermissionList (NoPermission, Permission)
SELECT p.NoPermission, p.Permission FROM @Perm p
WHERE NOT EXISTS (SELECT 1 FROM dbo.MstPermissionList x WHERE x.NoPermission = p.NoPermission);
DECLARE @IdUGroup INT = (SELECT TOP 1 IdUGroup FROM dbo.MstUserGroup WHERE UGroupName = @GroupName);
IF @IdUGroup IS NOT NULL
  INSERT INTO dbo.MstUserGroupPermission (IdUGroup, NoPermission, Allow)
  SELECT @IdUGroup, p.NoPermission, 1 FROM @Perm p
  WHERE NOT EXISTS (SELECT 1 FROM dbo.MstUserGroupPermission x WHERE x.IdUGroup = @IdUGroup AND x.NoPermission = p.NoPermission);
