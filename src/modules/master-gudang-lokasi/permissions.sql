-- Permission Master Gudang & Lokasi (web). Jalankan sekali di database WPS.
DECLARE @GroupName NVARCHAR(25) = N'Admin'; -- ganti bila perlu

DECLARE @Perm TABLE (NoPermission VARCHAR(100), Permission VARCHAR(50));
INSERT INTO @Perm VALUES
  ('datamaster_warehouse:create', 'Create Master Warehouse'),
  ('datamaster_warehouse:read',   'Read Master Warehouse'),
  ('datamaster_warehouse:update', 'Update Master Warehouse'),
  ('datamaster_warehouse:delete', 'Delete Master Warehouse'),

  ('datamaster_lokasi:create', 'Create Master Lokasi'),
  ('datamaster_lokasi:read',   'Read Master Lokasi'),
  ('datamaster_lokasi:update', 'Update Master Lokasi'),
  ('datamaster_lokasi:delete', 'Delete Master Lokasi'),

  ('datamaster_mappingidlokasi:create', 'Create Master Mapping ID Lokasi'),
  ('datamaster_mappingidlokasi:read',   'Read Master Mapping ID Lokasi'),
  ('datamaster_mappingidlokasi:update', 'Update Master Mapping ID Lokasi'),
  ('datamaster_mappingidlokasi:delete', 'Delete Master Mapping ID Lokasi'),

  ('datamaster_sourcelocation:create', 'Create Master Source Location'),
  ('datamaster_sourcelocation:read',   'Read Master Source Location'),
  ('datamaster_sourcelocation:update', 'Update Master Source Location'),
  ('datamaster_sourcelocation:delete', 'Delete Master Source Location'),

  ('datamaster_otherfactory:create', 'Create Master Other Factory'),
  ('datamaster_otherfactory:read',   'Read Master Other Factory'),
  ('datamaster_otherfactory:update', 'Update Master Other Factory'),
  ('datamaster_otherfactory:delete', 'Delete Master Other Factory'),

  ('datamaster_surattanah:create', 'Create Master Surat Tanah'),
  ('datamaster_surattanah:read',   'Read Master Surat Tanah'),
  ('datamaster_surattanah:update', 'Update Master Surat Tanah'),
  ('datamaster_surattanah:delete', 'Delete Master Surat Tanah');

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
