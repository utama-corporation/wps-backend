const { sql, poolPromise } = require("../../core/config/db");

/* Daftar Label (WPS Web): gabungan semua label produk yang BELUM dipakai (DateUsage IS NULL),
 * 1 baris per ukuran (detail). Hanya label belum dipakai agar data tetap ringan. */

// Jenis label -> tabel header/detail, kolom kunci, dan sumber "Grade" (barang jadi memakai nama BJ).
const TYPES = [
  { tipe: "S4S", h: "S4S_h", d: "S4S_d", key: "NoS4S" },
  { tipe: "FJ", h: "FJ_h", d: "FJ_d", key: "NoFJ" },
  { tipe: "MLD", h: "Moulding_h", d: "Moulding_d", key: "NoMoulding" },
  { tipe: "LMT", h: "Laminating_h", d: "Laminating_d", key: "NoLaminating" },
  { tipe: "CCA", h: "CCAkhir_h", d: "CCAkhir_d", key: "NoCCAkhir" },
  { tipe: "SND", h: "Sanding_h", d: "Sanding_d", key: "NoSanding" },
  { tipe: "BJ", h: "BarangJadi_h", d: "BarangJadi_d", key: "NoBJ", barangJadi: true },
];

// Sama dengan computeM3 di service label: dibulatkan ke bawah 4 desimal per baris.
const M3_EXPR =
  "FLOOR(CAST(d.Tebal AS FLOAT) * d.Lebar * d.Panjang * d.JmlhBatang / 1000000000.0 * 10000) / 10000.0";

const unionSql = () =>
  TYPES.map((t) => {
    const gradeJoin = t.barangJadi
      ? "LEFT JOIN MstBarangJadi g ON g.IdBarangJadi = h.IdBarangJadi"
      : "LEFT JOIN MstGrade g ON g.IdGrade = h.IdGrade";
    const gradeCol = t.barangJadi ? "g.NamaBarangJadi" : "g.NamaGrade";
    return `
      SELECT '${t.tipe}' AS Tipe, h.${t.key} AS NoLabel, k.Jenis AS Jenis, ${gradeCol} AS Grade,
             CAST(h.IdLokasi AS VARCHAR(50)) AS Lokasi, h.DateCreate, d.NoUrut,
             CAST(d.Tebal AS FLOAT) AS Tebal, CAST(d.Lebar AS FLOAT) AS Lebar, CAST(d.Panjang AS FLOAT) AS Panjang,
             d.JmlhBatang, ${M3_EXPR} AS M3
      FROM ${t.h} h
      INNER JOIN ${t.d} d ON d.${t.key} = h.${t.key}
      LEFT JOIN MstJenisKayu k ON k.IdJenisKayu = h.IdJenisKayu
      ${gradeJoin}
      WHERE h.DateUsage IS NULL`;
  }).join("\n      UNION ALL");

const TEXT_FILTERS = { tipe: "Tipe", jenis: "Jenis", grade: "Grade", lokasi: "Lokasi" };
const NUM_FILTERS = { tebal: "Tebal", lebar: "Lebar", panjang: "Panjang" };
const SORT_COLUMNS = {
  NoLabel: "NoLabel",
  Tipe: "Tipe",
  Jenis: "Jenis",
  Grade: "Grade",
  Lokasi: "Lokasi",
  Tebal: "Tebal",
  Lebar: "Lebar",
  Panjang: "Panjang",
  JmlhBatang: "JmlhBatang",
  M3: "M3",
  DateCreate: "DateCreate",
};

const toArray = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]).map(String).filter((s) => s !== "");

/** Bangun klausa WHERE (parameterized) dari query string; mengisi parameter ke `req`. */
function buildWhere(req, q) {
  const conds = [];
  const noLabel = typeof q.noLabel === "string" ? q.noLabel.trim() : "";
  if (noLabel) {
    req.input("noLabel", sql.VarChar(50), `%${noLabel}%`);
    conds.push("NoLabel LIKE @noLabel");
  }
  for (const [param, col] of Object.entries(TEXT_FILTERS)) {
    const vals = toArray(q[param]);
    if (!vals.length) continue;
    const names = vals.map((v, i) => {
      req.input(`${param}${i}`, sql.VarChar(100), v);
      return `@${param}${i}`;
    });
    conds.push(`${col} IN (${names.join(",")})`);
  }
  for (const [param, col] of Object.entries(NUM_FILTERS)) {
    const vals = toArray(q[param]).map(Number).filter((n) => Number.isFinite(n));
    if (!vals.length) continue;
    const names = vals.map((v, i) => {
      req.input(`${param}${i}`, sql.Float, v);
      return `@${param}${i}`;
    });
    conds.push(`${col} IN (${names.join(",")})`);
  }
  return conds.length ? `WHERE ${conds.join(" AND ")}` : "";
}

const list = async (q) => {
  const page = Math.max(1, parseInt(q.page, 10) || 1);
  const pageSize = Math.min(5000, Math.max(1, parseInt(q.pageSize, 10) || 50));
  const orderBy = SORT_COLUMNS[String(q.sortBy)] || SORT_COLUMNS.NoLabel;
  const orderDirection = String(q.sortDir).toLowerCase() === "asc" ? "ASC" : "DESC";
  const tieOrder = orderBy === "NoLabel" ? "NoUrut" : "NoLabel DESC, NoUrut";

  const pool = await poolPromise;
  const req = pool.request();
  const where = buildWhere(req, q);
  req.input("offset", sql.Int, (page - 1) * pageSize);
  req.input("size", sql.Int, pageSize);

  const result = await req.query(`
    SELECT * INTO #L FROM (${unionSql()}
    ) x
    ${where};

    SELECT COUNT(*) AS Total, ISNULL(SUM(CAST(JmlhBatang AS BIGINT)), 0) AS JmlhBatang, ISNULL(SUM(M3), 0) AS M3 FROM #L;

    SELECT Tipe, NoLabel, Jenis, Grade, Lokasi, Tebal, Lebar, Panjang, JmlhBatang, M3, DateCreate
    FROM #L
    ORDER BY ${orderBy} ${orderDirection}, ${tieOrder}
    OFFSET @offset ROWS FETCH NEXT @size ROWS ONLY;

    DROP TABLE #L;
  `);

  const sum = result.recordsets[0][0];
  return {
    items: result.recordsets[1].map((r) => ({ ...r, DateUsage: null })),
    totals: { jmlhBatang: Number(sum.JmlhBatang), m3: Math.round(Number(sum.M3) * 10000) / 10000 },
    total: sum.Total,
    page,
    pageSize,
  };
};

// Nilai unik untuk dropdown filter header kolom.
const options = async () => {
  const pool = await poolPromise;
  const result = await pool.request().query(`
    SELECT DISTINCT Tipe, Jenis, Grade, Lokasi, Tebal, Lebar, Panjang FROM (${unionSql()}
    ) x
  `);
  const uniq = (key) =>
    [...new Set(result.recordset.map((r) => r[key]).filter((v) => v != null && String(v).trim() !== ""))];
  const text = (key) => uniq(key).map(String).sort((a, b) => a.localeCompare(b));
  const num = (key) => uniq(key).sort((a, b) => a - b).map(String);
  return {
    tipe: text("Tipe"),
    jenis: text("Jenis"),
    grade: text("Grade"),
    lokasi: text("Lokasi"),
    tebal: num("Tebal"),
    lebar: num("Lebar"),
    panjang: num("Panjang"),
  };
};

/* ---------- Template filter + kolom per user ---------- */

const parseJson = (s, fallback) => {
  try {
    return JSON.parse(s);
  } catch {
    return fallback;
  }
};

const listTemplates = async (idUsername) => {
  const pool = await poolPromise;
  const r = await pool
    .request()
    .input("id", sql.Int, idUsername)
    .query(`
      SELECT Id, Nama, Filters, Columns
      FROM dbo.MstUserLabelListTemplate
      WHERE IdUsername = @id
      ORDER BY Nama
    `);
  return r.recordset.map((t) => ({
    id: t.Id,
    nama: t.Nama,
    filters: parseJson(t.Filters, {}),
    columns: parseJson(t.Columns, []),
  }));
};

const createTemplate = async (idUsername, { nama, filters, columns }) => {
  const pool = await poolPromise;
  await pool
    .request()
    .input("id", sql.Int, idUsername)
    .input("nama", sql.NVarChar(100), nama)
    .input("filters", sql.NVarChar(sql.MAX), JSON.stringify(filters))
    .input("columns", sql.NVarChar(sql.MAX), JSON.stringify(columns))
    .query(`
      INSERT INTO dbo.MstUserLabelListTemplate (IdUsername, Nama, Filters, Columns)
      VALUES (@id, @nama, @filters, @columns)
    `);
};

// Mengembalikan jumlah baris terubah (0 = bukan milik user / tidak ada).
const updateTemplate = async (idUsername, idTemplate, { nama, filters, columns }) => {
  const pool = await poolPromise;
  const r = await pool
    .request()
    .input("id", sql.Int, idUsername)
    .input("tid", sql.Int, idTemplate)
    .input("nama", sql.NVarChar(100), nama)
    .input("filters", sql.NVarChar(sql.MAX), JSON.stringify(filters))
    .input("columns", sql.NVarChar(sql.MAX), JSON.stringify(columns))
    .query(`
      UPDATE dbo.MstUserLabelListTemplate
      SET Nama = @nama, Filters = @filters, Columns = @columns, DateUpdate = GETDATE()
      WHERE Id = @tid AND IdUsername = @id
    `);
  return r.rowsAffected[0];
};

const removeTemplate = async (idUsername, idTemplate) => {
  const pool = await poolPromise;
  const r = await pool
    .request()
    .input("id", sql.Int, idUsername)
    .input("tid", sql.Int, idTemplate)
    .query(`DELETE FROM dbo.MstUserLabelListTemplate WHERE Id = @tid AND IdUsername = @id`);
  return r.rowsAffected[0];
};

module.exports = { list, options, listTemplates, createTemplate, updateTemplate, removeTemplate };
