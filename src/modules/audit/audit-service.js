const { sql, poolPromise } = require("../../core/config/db");

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function parseJsonSafe(value) {
  if (!value) return null;

  try {
    return JSON.parse(value);
  } catch (_error) {
    return value;
  }
}

function normalizePaging({ page, limit }) {
  const safePage = Math.max(Number.parseInt(page, 10) || DEFAULT_PAGE, 1);
  const rawLimit = Number.parseInt(limit, 10) || DEFAULT_LIMIT;
  const safeLimit = Math.min(Math.max(rawLimit, 1), MAX_LIMIT);

  return {
    page: safePage,
    limit: safeLimit,
    offset: (safePage - 1) * safeLimit,
  };
}

function mapAuditRow(row) {
  return {
    auditId: row.AuditId,
    eventTime: row.EventTime,
    actor: row.Actor,
    actorUsername: row.Username || null,
    requestId: row.RequestId,
    action: row.Action,
    tableName: row.TableName,
    pk: parseJsonSafe(row.PK),
    oldData: parseJsonSafe(row.OldData),
    newData: parseJsonSafe(row.NewData),
  };
}

function collectMasterIds(
  items,
  jenisKayuIds,
  gradeIds,
  orgTellyIds,
  uomIds,
  warehouseIds,
  fjProfileIds,
  barangJadiIds,
) {
  for (const item of items) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;

    if (item.IdJenisKayu !== undefined && item.IdJenisKayu !== null) {
      const idJenisKayu = Number.parseInt(item.IdJenisKayu, 10);
      if (Number.isInteger(idJenisKayu)) jenisKayuIds.add(idJenisKayu);
    }

    if (item.IdGrade !== undefined && item.IdGrade !== null) {
      const idGrade = Number.parseInt(item.IdGrade, 10);
      if (Number.isInteger(idGrade)) gradeIds.add(idGrade);
    }

    if (item.IdOrgTelly !== undefined && item.IdOrgTelly !== null) {
      const idOrgTelly = Number.parseInt(item.IdOrgTelly, 10);
      if (Number.isInteger(idOrgTelly)) orgTellyIds.add(idOrgTelly);
    }

    if (item.IdUOMTblLebar !== undefined && item.IdUOMTblLebar !== null) {
      const idUOMTblLebar = Number.parseInt(item.IdUOMTblLebar, 10);
      if (Number.isInteger(idUOMTblLebar)) uomIds.add(idUOMTblLebar);
    }

    if (item.IdUOMPanjang !== undefined && item.IdUOMPanjang !== null) {
      const idUOMPanjang = Number.parseInt(item.IdUOMPanjang, 10);
      if (Number.isInteger(idUOMPanjang)) uomIds.add(idUOMPanjang);
    }

    if (item.IdWarehouse !== undefined && item.IdWarehouse !== null) {
      const idWarehouse = Number.parseInt(item.IdWarehouse, 10);
      if (Number.isInteger(idWarehouse)) warehouseIds.add(idWarehouse);
    }

    if (item.IdFJProfile !== undefined && item.IdFJProfile !== null) {
      const idFJProfile = Number.parseInt(item.IdFJProfile, 10);
      if (Number.isInteger(idFJProfile)) fjProfileIds.add(idFJProfile);
    }

    if (item.IdBarangJadi !== undefined && item.IdBarangJadi !== null) {
      const idBarangJadi = Number.parseInt(item.IdBarangJadi, 10);
      if (Number.isInteger(idBarangJadi)) barangJadiIds.add(idBarangJadi);
    }
  }
}

function ensureArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

async function getMasterMaps(pool, auditRows) {
  const jenisKayuIds = new Set();
  const gradeIds = new Set();
  const orgTellyIds = new Set();
  const uomIds = new Set();
  const warehouseIds = new Set();
  const fjProfileIds = new Set();
  const barangJadiIds = new Set();

  for (const row of auditRows) {
    collectMasterIds(
      ensureArray(row.oldData),
      jenisKayuIds,
      gradeIds,
      orgTellyIds,
      uomIds,
      warehouseIds,
      fjProfileIds,
      barangJadiIds,
    );
    collectMasterIds(
      ensureArray(row.newData),
      jenisKayuIds,
      gradeIds,
      orgTellyIds,
      uomIds,
      warehouseIds,
      fjProfileIds,
      barangJadiIds,
    );
  }

  const jenisKayuMap = new Map();
  const gradeMap = new Map();
  const orgTellyMap = new Map();
  const uomMap = new Map();
  const warehouseMap = new Map();
  const fjProfileMap = new Map();
  const barangJadiMap = new Map();

  if (jenisKayuIds.size > 0) {
    const req = pool.request();
    const placeholders = [];
    let index = 0;

    for (const id of jenisKayuIds) {
      const param = `idJenisKayu${index++}`;
      req.input(param, sql.Int, id);
      placeholders.push(`@${param}`);
    }

    const result = await req.query(`
      SELECT IdJenisKayu, Jenis
      FROM dbo.MstJenisKayu
      WHERE IdJenisKayu IN (${placeholders.join(", ")});
    `);

    for (const row of result.recordset) {
      jenisKayuMap.set(row.IdJenisKayu, row.Jenis);
    }
  }

  if (gradeIds.size > 0) {
    const req = pool.request();
    const placeholders = [];
    let index = 0;

    for (const id of gradeIds) {
      const param = `idGrade${index++}`;
      req.input(param, sql.Int, id);
      placeholders.push(`@${param}`);
    }

    const result = await req.query(`
      SELECT IdGrade, NamaGrade
      FROM dbo.MstGrade
      WHERE IdGrade IN (${placeholders.join(", ")});
    `);

    for (const row of result.recordset) {
      gradeMap.set(row.IdGrade, row.NamaGrade);
    }
  }

  if (orgTellyIds.size > 0) {
    const req = pool.request();
    const placeholders = [];
    let index = 0;

    for (const id of orgTellyIds) {
      const param = `idOrgTelly${index++}`;
      req.input(param, sql.Int, id);
      placeholders.push(`@${param}`);
    }

    const result = await req.query(`
      SELECT IdOrgTelly, NamaOrgTelly
      FROM dbo.MstOrgTelly
      WHERE IdOrgTelly IN (${placeholders.join(", ")});
    `);

    for (const row of result.recordset) {
      orgTellyMap.set(row.IdOrgTelly, row.NamaOrgTelly);
    }
  }

  if (uomIds.size > 0) {
    const req = pool.request();
    const placeholders = [];
    let index = 0;

    for (const id of uomIds) {
      const param = `idUom${index++}`;
      req.input(param, sql.Int, id);
      placeholders.push(`@${param}`);
    }

    const result = await req.query(`
      SELECT IdUOM, UOM
      FROM dbo.MstUOM
      WHERE IdUOM IN (${placeholders.join(", ")});
    `);

    for (const row of result.recordset) {
      uomMap.set(row.IdUOM, row.UOM);
    }
  }

  if (warehouseIds.size > 0) {
    const req = pool.request();
    const placeholders = [];
    let index = 0;

    for (const id of warehouseIds) {
      const param = `idWarehouse${index++}`;
      req.input(param, sql.Int, id);
      placeholders.push(`@${param}`);
    }

    const result = await req.query(`
      SELECT IdWarehouse, NamaWarehouse, Singkatan
      FROM dbo.MstWarehouse
      WHERE IdWarehouse IN (${placeholders.join(", ")});
    `);

    for (const row of result.recordset) {
      warehouseMap.set(row.IdWarehouse, {
        namaWarehouse: row.NamaWarehouse,
        singkatan: row.Singkatan,
      });
    }
  }

  if (fjProfileIds.size > 0) {
    const req = pool.request();
    const placeholders = [];
    let index = 0;

    for (const id of fjProfileIds) {
      const param = `idFJProfile${index++}`;
      req.input(param, sql.Int, id);
      placeholders.push(`@${param}`);
    }

    const result = await req.query(`
      SELECT IdFJProfile, Profile
      FROM dbo.MstFJProfile
      WHERE IdFJProfile IN (${placeholders.join(", ")});
    `);

    for (const row of result.recordset) {
      fjProfileMap.set(row.IdFJProfile, row.Profile);
    }
  }

  if (barangJadiIds.size > 0) {
    const req = pool.request();
    const placeholders = [];
    let index = 0;

    for (const id of barangJadiIds) {
      const param = `idBarangJadi${index++}`;
      req.input(param, sql.Int, id);
      placeholders.push(`@${param}`);
    }

    const result = await req.query(`
      SELECT IdBarangJadi, NamaBarangJadi
      FROM dbo.MstBarangJadi
      WHERE IdBarangJadi IN (${placeholders.join(", ")});
    `);

    for (const row of result.recordset) {
      barangJadiMap.set(row.IdBarangJadi, row.NamaBarangJadi);
    }
  }

  return {
    jenisKayuMap,
    gradeMap,
    orgTellyMap,
    uomMap,
    warehouseMap,
    fjProfileMap,
    barangJadiMap,
  };
}

function enrichAuditItems(
  items,
  jenisKayuMap,
  gradeMap,
  orgTellyMap,
  uomMap,
  warehouseMap,
  fjProfileMap,
  barangJadiMap,
) {
  return items.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return item;

    const enriched = { ...item };
    const idJenisKayu = Number.parseInt(item.IdJenisKayu, 10);
    const idGrade = Number.parseInt(item.IdGrade, 10);
    const idOrgTelly = Number.parseInt(item.IdOrgTelly, 10);
    const idUOMTblLebar = Number.parseInt(item.IdUOMTblLebar, 10);
    const idUOMPanjang = Number.parseInt(item.IdUOMPanjang, 10);
    const idWarehouse = Number.parseInt(item.IdWarehouse, 10);
    const idFJProfile = Number.parseInt(item.IdFJProfile, 10);
    const idBarangJadi = Number.parseInt(item.IdBarangJadi, 10);

    if (Number.isInteger(idJenisKayu) && jenisKayuMap.has(idJenisKayu)) {
      enriched.JenisKayu = jenisKayuMap.get(idJenisKayu);
      delete enriched.IdJenisKayu;
    }

    if (Number.isInteger(idGrade) && gradeMap.has(idGrade)) {
      enriched.NamaGrade = gradeMap.get(idGrade);
      delete enriched.IdGrade;
    }

    if (Number.isInteger(idOrgTelly) && orgTellyMap.has(idOrgTelly)) {
      enriched.NamaOrgTelly = orgTellyMap.get(idOrgTelly);
      delete enriched.IdOrgTelly;
    }

    if (Number.isInteger(idUOMTblLebar) && uomMap.has(idUOMTblLebar)) {
      enriched.NamaUOMTblLebar = uomMap.get(idUOMTblLebar);
      delete enriched.IdUOMTblLebar;
    }

    if (Number.isInteger(idUOMPanjang) && uomMap.has(idUOMPanjang)) {
      enriched.NamaUOMPanjang = uomMap.get(idUOMPanjang);
      delete enriched.IdUOMPanjang;
    }

    if (Number.isInteger(idWarehouse) && warehouseMap.has(idWarehouse)) {
      enriched.NamaWarehouse = warehouseMap.get(idWarehouse).namaWarehouse;
      delete enriched.IdWarehouse;
    }

    if (Number.isInteger(idFJProfile) && fjProfileMap.has(idFJProfile)) {
      enriched.Profile = fjProfileMap.get(idFJProfile);
      delete enriched.IdFJProfile;
    }

    if (Number.isInteger(idBarangJadi) && barangJadiMap.has(idBarangJadi)) {
      enriched.NamaBarangJadi = barangJadiMap.get(idBarangJadi);
      delete enriched.IdBarangJadi;
    }

    const idFisik = Number.parseInt(item.IdFisik, 10);
    if (Number.isInteger(idFisik) && warehouseMap.has(idFisik)) {
      enriched.SingkatanFisik = warehouseMap.get(idFisik).singkatan;
      delete enriched.IdFisik;
    }

    return enriched;
  });
}

async function enrichAuditRows(pool, rows) {
  if (!rows.length) return rows;

  const {
    jenisKayuMap,
    gradeMap,
    orgTellyMap,
    uomMap,
    warehouseMap,
    fjProfileMap,
    barangJadiMap,
  } = await getMasterMaps(pool, rows);

  if (
    !jenisKayuMap.size &&
    !gradeMap.size &&
    !orgTellyMap.size &&
    !uomMap.size &&
    !warehouseMap.size &&
    !fjProfileMap.size &&
    !barangJadiMap.size
  ) {
    return rows;
  }

  return rows.map((row) => ({
    ...row,
    oldData: row.oldData
      ? enrichAuditItems(
          ensureArray(row.oldData),
          jenisKayuMap,
          gradeMap,
          orgTellyMap,
          uomMap,
          warehouseMap,
          fjProfileMap,
          barangJadiMap,
        )
      : row.oldData,
    newData: row.newData
      ? enrichAuditItems(
          ensureArray(row.newData),
          jenisKayuMap,
          gradeMap,
          orgTellyMap,
          uomMap,
          warehouseMap,
          fjProfileMap,
          barangJadiMap,
        )
      : row.newData,
  }));
}

async function getAuditList({
  page = DEFAULT_PAGE,
  limit = DEFAULT_LIMIT,
  q = "",
  tableName = null,
  action = null,
  actor = null,
  requestId = null,
  dateFrom = null,
  dateTo = null,
} = {}) {
  const pool = await poolPromise;
  const {
    page: safePage,
    limit: safeLimit,
    offset,
  } = normalizePaging({ page, limit });
  const req = pool.request();
  const where = ["1=1"];

  if (q) {
    req.input("q", sql.NVarChar, `%${q}%`);
    where.push(`(
      CAST(a.AuditId AS nvarchar(50)) LIKE @q OR
      a.Actor LIKE @q OR
      a.RequestId LIKE @q OR
      a.Action LIKE @q OR
      a.TableName LIKE @q OR
      a.PK LIKE @q
    )`);
  }

  if (tableName) {
    req.input("tableName", sql.VarChar, tableName);
    where.push("a.TableName = @tableName");
  }

  if (action) {
    req.input("action", sql.VarChar, action);
    where.push("a.Action = @action");
  }

  if (actor) {
    req.input("actor", sql.NVarChar, actor);
    where.push("a.Actor = @actor");
  }

  if (requestId) {
    req.input("requestId", sql.NVarChar, requestId);
    where.push("a.RequestId = @requestId");
  }

  if (dateFrom) {
    req.input("dateFrom", sql.DateTime2, dateFrom);
    where.push("a.EventTime >= @dateFrom");
  }

  if (dateTo) {
    req.input("dateTo", sql.DateTime2, dateTo);
    where.push("a.EventTime <= @dateTo");
  }

  req.input("offset", sql.Int, offset);
  req.input("limit", sql.Int, safeLimit);

  const query = `
    SELECT COUNT(1) AS total
    FROM dbo.AuditTrail a
    WHERE ${where.join(" AND ")};

    SELECT
      a.AuditId,
      CONVERT(varchar(23), a.EventTime, 121) AS EventTime,
      a.Actor,
      u.Username,
      a.RequestId,
      a.Action,
      a.TableName,
      a.PK,
      a.OldData,
      a.NewData
    FROM dbo.AuditTrail a
    LEFT JOIN dbo.MstUsername u
      ON u.IdUsername = TRY_CONVERT(int, a.Actor)
    WHERE ${where.join(" AND ")}
    ORDER BY a.AuditId DESC
    OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY;
  `;

  const result = await req.query(query);
  const total = result.recordsets[0][0]?.total || 0;
  const rows = result.recordsets[1] || [];

  const mappedRows = rows.map(mapAuditRow);
  const enrichedRows = await enrichAuditRows(pool, mappedRows);

  return {
    page: safePage,
    limit: safeLimit,
    total,
    totalPages: Math.ceil(total / safeLimit),
    data: enrichedRows,
  };
}

async function getAuditDetail(auditId) {
  const pool = await poolPromise;
  const req = pool.request();

  req.input("auditId", sql.BigInt, auditId);

  const result = await req.query(`
    SELECT TOP 1
      a.AuditId,
      CONVERT(varchar(23), a.EventTime, 121) AS EventTime,
      a.Actor,
      u.Username,
      a.RequestId,
      a.Action,
      a.TableName,
      a.PK,
      a.OldData,
      a.NewData
    FROM dbo.AuditTrail a
    LEFT JOIN dbo.MstUsername u
      ON u.IdUsername = TRY_CONVERT(int, a.Actor)
    WHERE a.AuditId = @auditId;
  `);

  const row = result.recordset[0];
  if (!row) return null;

  const [enrichedRow] = await enrichAuditRows(pool, [mapAuditRow(row)]);
  return enrichedRow || null;
}

async function getAuditByPkValue({
  pkValue,
  page = DEFAULT_PAGE,
  limit = DEFAULT_LIMIT,
  tableName = null,
  action = null,
} = {}) {
  const pool = await poolPromise;
  const {
    page: safePage,
    limit: safeLimit,
    offset,
  } = normalizePaging({ page, limit });
  const req = pool.request();
  const where = [
    `(
      a.PK LIKE @pkQuotedLike
      OR a.PK LIKE @pkNumericLike
    )`,
  ];

  req.input("pkValue", sql.NVarChar, pkValue);
  req.input("pkQuotedLike", sql.NVarChar, `%:"${pkValue}"%`);
  req.input("pkNumericLike", sql.NVarChar, `%:${pkValue}%`);

  if (tableName) {
    req.input("tableName", sql.VarChar, tableName);
    where.push("a.TableName = @tableName");
  }

  if (action) {
    req.input("action", sql.VarChar, action);
    where.push("a.Action = @action");
  }

  req.input("offset", sql.Int, offset);
  req.input("limit", sql.Int, safeLimit);

  const query = `
    SELECT COUNT(1) AS total
    FROM dbo.AuditTrail a
    WHERE ${where.join(" AND ")};

    SELECT
      a.AuditId,
      CONVERT(varchar(23), a.EventTime, 121) AS EventTime,
      a.Actor,
      u.Username,
      a.RequestId,
      a.Action,
      a.TableName,
      a.PK,
      a.OldData,
      a.NewData
    FROM dbo.AuditTrail a
    LEFT JOIN dbo.MstUsername u
      ON u.IdUsername = TRY_CONVERT(int, a.Actor)
    WHERE ${where.join(" AND ")}
    ORDER BY a.AuditId DESC
    OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY;
  `;

  const result = await req.query(query);
  const total = result.recordsets[0][0]?.total || 0;
  const rows = result.recordsets[1] || [];

  const mappedRows = rows.map(mapAuditRow);
  const enrichedRows = await enrichAuditRows(pool, mappedRows);

  return {
    page: safePage,
    limit: safeLimit,
    total,
    totalPages: Math.ceil(total / safeLimit),
    data: enrichedRows,
  };
}

const MY_ACTIVITY_MAX = 20;
const MY_ACTIVITY_DAYS = 14;

/**
 * Aktivitas terakhir milik satu pengguna. Trigger audit menulis satu baris per baris tabel
 * yang berubah, jadi baris dikelompokkan per RequestId (satu simpan = satu aktivitas);
 * baris pertama (AuditId terkecil) dipakai sebagai wakil, biasanya tabel header.
 * Actor bisa berisi IdUsername atau username, keduanya dicocokkan.
 * Dibatasi 14 hari terakhir (MY_ACTIVITY_DAYS) agar tidak memindai seluruh AuditTrail.
 */
async function getMyActivity({ idUsername, username, limit = 8 } = {}) {
  const ids = [idUsername, username]
    .map((v) => (v === undefined || v === null ? "" : String(v).trim()))
    .filter(Boolean);
  if (!ids.length) return [];
  const safeLimit = Math.min(Math.max(Number.parseInt(limit, 10) || 8, 1), MY_ACTIVITY_MAX);

  const pool = await poolPromise;
  const req = pool.request();
  req.input("actor1", sql.NVarChar(100), ids[0]);
  req.input("actor2", sql.NVarChar(100), ids[1] ?? ids[0]);
  req.input("days", sql.Int, MY_ACTIVITY_DAYS);
  req.input("limit", sql.Int, safeLimit);

  const result = await req.query(`
    WITH Mine AS (
      SELECT a.AuditId, a.EventTime, a.Action, a.TableName, a.PK,
             ISNULL(NULLIF(a.RequestId, N''), CAST(a.AuditId AS nvarchar(50))) AS Grp
      FROM dbo.AuditTrail a
      WHERE a.Actor IN (@actor1, @actor2)
        AND a.EventTime >= DATEADD(DAY, -@days, SYSDATETIME())
    ),
    Ranked AS (
      SELECT *,
             ROW_NUMBER() OVER (PARTITION BY Grp ORDER BY AuditId) AS Rn,
             COUNT(1) OVER (PARTITION BY Grp) AS Jumlah,
             MAX(AuditId) OVER (PARTITION BY Grp) AS LastId,
             MAX(EventTime) OVER (PARTITION BY Grp) AS LastTime
      FROM Mine
    )
    SELECT TOP (@limit)
      AuditId, Grp AS RequestId, Action, TableName, PK, Jumlah,
      CONVERT(varchar(23), LastTime, 121) AS EventTime
    FROM Ranked
    WHERE Rn = 1
    ORDER BY LastId DESC;
  `);

  return result.recordset.map((row) => ({
    auditId: row.AuditId,
    requestId: row.RequestId,
    eventTime: row.EventTime,
    action: row.Action,
    tableName: row.TableName,
    pk: parseJsonSafe(row.PK),
    rows: row.Jumlah,
  }));
}

module.exports = {
  getMyActivity,
  getAuditList,
  getAuditDetail,
  getAuditByPkValue,
};
