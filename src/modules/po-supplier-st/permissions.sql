/* Daftarkan permission PO Supplier ST, lalu beri ke grup @GroupName.
 * Aman dijalankan ulang. Super admin ('*') tidak perlu. */
DECLARE @GroupName NVARCHAR(25) = N'Admin'; -- <-- ganti bila perlu

DECLARE @Perm TABLE (NoPermission VARCHAR(100), Permission VARCHAR(50));
INSERT INTO @Perm VALUES
  ('po_supplier_st:read',   'Read PO Supplier ST'),
  ('po_supplier_st:create', 'Create PO Supplier ST'),
  ('po_supplier_st:update', 'Update PO Supplier ST'),
  ('po_supplier_st:delete', 'Delete PO Supplier ST'),
  ('po_supplier_st:close',  'Tutup/Buka PO Supplier ST');

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
