const { sql, poolPromise } = require("../../core/config/db");

/* ============================================================
 * Master Gudang & Lokasi (web). Paritas desktop:
 *  - Warehouse          : FrmMstWarehouse.vb                      -> MstWarehouse
 *  - Lokasi             : FrmMstLokasi.vb                         -> MstLokasi
 *  - Mapping ID Lokasi  : FrmMstBagianJenisKayuGradeIdLocation.vb -> MstBagianJenisKayuGradeWarnaToIDLocation
 *  - Source Location    : FrmMstSupplierIntelSourceLocation.vb    -> MstSupplierIntelSourceLocation
 *  - Other Factory      : FrmMstSupplierIntelOtherFactory.vb      -> MstSupplierIntelOtherFactory
 *  - Surat Tanah        : FrmMstSuratTanah.vb                     -> MstSuratTanah
 * Master "flat" digerakkan oleh konfigurasi FLAT; Mapping ID Lokasi (PK gabungan) ditulis terpisah.
 * ==========================================================*/

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

async function audit(tx, user, aktivitas) {
  await new sql.Request(tx)
    .input("nip", sql.VarChar(50), user || "admin")
    .input("aktivitas", sql.VarChar(500), aktivitas)
    .query(`INSERT INTO Riwayat ([Nip], [Tgl], [Aktivitas]) VALUES (@nip, GETDATE(), @aktivitas)`);
}

async function withTx(fn) {
  const pool = await poolPromise;
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    const out = await fn(tx);
    await tx.commit();
    return out;
  } catch (err) {
    try {
      await tx.rollback();
    } catch {
      /* abaikan */
    }
    throw err;
  }
}

const isFk = (err) => err?.number === 547 || err?.originalError?.info?.number === 547;
const bit = (v) => (v === true || v === 1 || v === "1" || v === "true" ? 1 : 0);
const str = (v) => (v === null || v === undefined ? "" : String(v).trim());

/* ----------------------------------------------------------
 * Konfigurasi master flat
 *  id        : kolom PK; auto = MAX+1 (int), manual = diketik user (varchar)
 *  fields    : kolom data (name = nama kolom = key JSON), type, max, required, int
 *  enable    : tabel punya kolom [Enable]
 *  usedBy    : cek pemakaian sebelum hapus (paritas VB); FK lain ditangkap error 547
 * --------------------------------------------------------*/
const FLAT = {
  warehouse: {
    table: "MstWarehouse",
    label: "Warehouse",
    id: { col: "IdWarehouse", auto: true },
    fields: [
      { name: "NamaWarehouse", max: 40, required: true, title: "Nama Warehouse" },
      { name: "Singkatan", max: 5, title: "Singkatan" },
    ],
    enable: true,
    order: "IdWarehouse ASC",
  },
  lokasi: {
    table: "MstLokasi",
    label: "Lokasi",
    id: { col: "IdLokasi", auto: false, max: 5, title: "ID Lokasi" },
    fields: [{ name: "Description", max: 100, required: true, title: "Deskripsi" }],
    enable: true,
    // Blok = huruf pertama IdLokasi (VB: LEFT(IdLokasi,1)) — hanya saat insert.
    derivedOnInsert: { Blok: "LEFT(@id, 1)" },
    extraSelect: ["Blok"],
    order: "IdLokasi ASC",
  },
  "source-location": {
    table: "MstSupplierIntelSourceLocation",
    label: "Source Location",
    id: { col: "IdSourceLocation", auto: true },
    fields: [{ name: "NamaLokasi", max: 50, required: true, title: "Nama Lokasi" }],
    usedBy: [{ table: "SupplierIntel", col: "IdSourceLocation" }],
    order: "NamaLokasi ASC",
  },
  "other-factory": {
    table: "MstSupplierIntelOtherFactory",
    label: "Other Factory",
    id: { col: "IdOtherFactory", auto: true },
    fields: [{ name: "NamaPabrik", max: 50, required: true, title: "Nama Pabrik" }],
    usedBy: [{ table: "SupplierIntel", col: "IdOtherFactory" }],
    order: "NamaPabrik ASC",
  },
  "surat-tanah": {
    table: "MstSuratTanah",
    label: "Surat Tanah",
    id: { col: "IdTanah", auto: true },
    fields: [
      { name: "NamaTanah", max: 50, required: true, title: "Nama Tanah" },
      { name: "NamaPemilik", max: 50, title: "Nama Pemilik" },
      { name: "NoSuratTanah", max: 50, title: "No. Surat Tanah" },
      { name: "Koordinat", max: 50, title: "Koordinat" },
      { name: "DesaKelurahan", max: 30, title: "Desa / Kelurahan" },
      { name: "KabupatenKota", max: 50, title: "Kabupaten / Kota" },
      { name: "Kecamatan", max: 50, title: "Kecamatan" },
      { name: "Provinsi", max: 30, title: "Provinsi" },
      { name: "Luas", int: true, title: "Luas" },
    ],
    order: "IdTanah ASC",
  },
};

function cfgOf(key) {
  const c = FLAT[key];
  if (!c) throw httpError(404, "Master tidak dikenal.");
  return c;
}

/** Validasi + normalisasi body -> { [kolom]: nilai } sesuai konfigurasi. */
function readFields(cfg, body) {
  const out = {};
  for (const f of cfg.fields) {
    if (f.int) {
      const raw = body?.[f.name];
      if (raw === null || raw === undefined || raw === "") {
        out[f.name] = null;
        continue;
      }
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 0) throw httpError(400, `${f.title} harus berupa bilangan bulat (>= 0).`);
      out[f.name] = n;
      continue;
    }
    const v = str(body?.[f.name]);
    if (f.required && !v) throw httpError(400, `${f.title} wajib diisi.`);
    if (v.length > f.max) throw httpError(400, `${f.title} maksimal ${f.max} karakter.`);
    out[f.name] = v === "" ? null : v;
  }
  return out;
}

function bindField(req, f, value) {
  req.input(f.name, f.int ? sql.Int : sql.VarChar(f.max), value);
}

async function list(key) {
  const c = cfgOf(key);
  const cols = [c.id.col, ...c.fields.map((f) => f.name), ...(c.extraSelect || [])];
  const sel = cols.map((x) => `[${x}]`).join(", ") + (c.enable ? ", CAST(ISNULL([Enable], 0) AS bit) AS [Enable]" : "");
  const pool = await poolPromise;
  const rs = await pool.request().query(`SELECT ${sel} FROM ${c.table} ORDER BY ${c.order}`);
  return rs.recordset;
}

async function create(key, body, user) {
  const c = cfgOf(key);
  const vals = readFields(c, body);
  const enable = c.enable ? bit(body?.Enable ?? true) : null;

  let manualId = null;
  if (!c.id.auto) {
    manualId = str(body?.[c.id.col]).toUpperCase();
    if (!manualId) throw httpError(400, `${c.id.title} wajib diisi.`);
    if (manualId.length > c.id.max) throw httpError(400, `${c.id.title} maksimal ${c.id.max} karakter.`);
    if (!/^[A-Z0-9.\-]+$/.test(manualId)) throw httpError(400, `${c.id.title} hanya boleh huruf, angka, titik, atau strip.`);
  }

  return withTx(async (tx) => {
    let id;
    if (c.id.auto) {
      const m = await new sql.Request(tx).query(
        `SELECT ISNULL(MAX(${c.id.col}), 0) + 1 AS NextId FROM ${c.table} WITH (UPDLOCK, HOLDLOCK)`,
      );
      id = m.recordset[0].NextId;
    } else {
      const dup = await new sql.Request(tx)
        .input("id", sql.VarChar(c.id.max), manualId)
        .query(`SELECT TOP 1 1 AS x FROM ${c.table} WITH (UPDLOCK, HOLDLOCK) WHERE ${c.id.col} = @id`);
      if (dup.recordset.length) throw httpError(409, `${c.id.title} ${manualId} sudah ada.`);
      id = manualId;
    }

    const req = new sql.Request(tx);
    req.input("id", c.id.auto ? sql.Int : sql.VarChar(c.id.max), id);
    for (const f of c.fields) bindField(req, f, vals[f.name]);
    const cols = [c.id.col, ...c.fields.map((f) => f.name)];
    const params = ["@id", ...c.fields.map((f) => `@${f.name}`)];
    if (c.enable) {
      req.input("Enable", sql.Bit, enable);
      cols.push("Enable");
      params.push("@Enable");
    }
    for (const [col, expr] of Object.entries(c.derivedOnInsert || {})) {
      cols.push(col);
      params.push(expr);
    }
    await req.query(`INSERT INTO ${c.table} (${cols.map((x) => `[${x}]`).join(", ")}) VALUES (${params.join(", ")})`);
    await audit(tx, user, `Menyimpan Data Master ${c.label} ${id} (Web)`);
    return { [c.id.col]: id };
  });
}

async function update(key, idParam, body, user) {
  const c = cfgOf(key);
  const vals = readFields(c, body);
  const idSql = c.id.auto ? sql.Int : sql.VarChar(c.id.max);
  const id = c.id.auto ? Number(idParam) : str(idParam).toUpperCase();
  if (c.id.auto && !Number.isInteger(id)) throw httpError(400, "Id tidak valid.");
  if (!c.id.auto && (!id || id.length > c.id.max)) throw httpError(404, `${c.label} tidak ditemukan.`);

  return withTx(async (tx) => {
    const cur = await new sql.Request(tx).input("id", idSql, id).query(`SELECT TOP 1 1 AS x FROM ${c.table} WHERE ${c.id.col} = @id`);
    if (!cur.recordset.length) throw httpError(404, `${c.label} tidak ditemukan.`);

    const req = new sql.Request(tx);
    req.input("id", idSql, id);
    const sets = [];
    for (const f of c.fields) {
      bindField(req, f, vals[f.name]);
      sets.push(`[${f.name}] = @${f.name}`);
    }
    if (c.enable) {
      req.input("Enable", sql.Bit, bit(body?.Enable));
      sets.push("[Enable] = @Enable");
    }
    await req.query(`UPDATE ${c.table} SET ${sets.join(", ")} WHERE ${c.id.col} = @id`);
    await audit(tx, user, `Mengubah Data Master ${c.label} ${id} (Web)`);
    return { [c.id.col]: id };
  });
}

async function remove(key, idParam, user) {
  const c = cfgOf(key);
  const idSql = c.id.auto ? sql.Int : sql.VarChar(c.id.max);
  const id = c.id.auto ? Number(idParam) : str(idParam).toUpperCase();
  if (c.id.auto && !Number.isInteger(id)) throw httpError(400, "Id tidak valid.");
  if (!c.id.auto && (!id || id.length > c.id.max)) throw httpError(404, `${c.label} tidak ditemukan.`);

  try {
    return await withTx(async (tx) => {
      const cur = await new sql.Request(tx).input("id", idSql, id).query(`SELECT TOP 1 1 AS x FROM ${c.table} WHERE ${c.id.col} = @id`);
      if (!cur.recordset.length) throw httpError(404, `${c.label} tidak ditemukan.`);

      for (const u of c.usedBy || []) {
        const r = await new sql.Request(tx).input("id", idSql, id).query(`SELECT COUNT(*) AS n FROM ${u.table} WHERE ${u.col} = @id`);
        if (r.recordset[0].n > 0) throw httpError(409, `${c.label} tidak dapat dihapus karena sedang digunakan.`);
      }

      await new sql.Request(tx).input("id", idSql, id).query(`DELETE FROM ${c.table} WHERE ${c.id.col} = @id`);
      await audit(tx, user, `Menghapus Data Master ${c.label} ${id} (Web)`);
      return { [c.id.col]: id };
    });
  } catch (err) {
    if (isFk(err)) {
      throw httpError(
        409,
        `${c.label} tidak dapat dihapus karena sedang digunakan pada data lain.${c.enable ? " Ubah statusnya menjadi TIDAK AKTIF sebagai gantinya." : ""}`,
      );
    }
    throw err;
  }
}

/* ============================================================
 * Mapping ID Lokasi — PK gabungan (IdBagian, IdJenisKayu, IdGrade)
 * ==========================================================*/
const MAP_TABLE = "MstBagianJenisKayuGradeWarnaToIDLocation";

async function mappingList() {
  const pool = await poolPromise;
  const rs = await pool.request().query(`
    SELECT A.IdBagian, A.IdJenisKayu, A.IdGrade,
           B.NamaBagian, C.Jenis, D.NamaGrade,
           CAST(ISNULL(A.Warna, 0) AS bit) AS Warna, A.IdLokasi, E.Description AS NamaLokasi
    FROM ${MAP_TABLE} A
    LEFT JOIN MstBagian B ON B.IdBagian = A.IdBagian
    LEFT JOIN MstJenisKayu C ON C.IdJenisKayu = A.IdJenisKayu
    LEFT JOIN MstGrade D ON D.IdGrade = A.IdGrade
    LEFT JOIN MstLokasi E ON E.IdLokasi = A.IdLokasi
    ORDER BY B.NamaBagian, C.Jenis, D.NamaGrade ASC
  `);
  return rs.recordset;
}

async function mappingLookups() {
  const pool = await poolPromise;
  const [bagian, jenis, grade, lokasi] = await Promise.all([
    pool.request().query(`SELECT IdBagian, NamaBagian FROM MstBagian WHERE [Enable] = 1 ORDER BY NamaBagian`),
    pool.request().query(`SELECT IdJenisKayu, Jenis FROM MstJenisKayu WHERE [Enable] = 1 ORDER BY Jenis`),
    pool.request().query(`SELECT IdGrade, NamaGrade FROM MstGrade WHERE [Enable] = 1 ORDER BY NamaGrade`),
    pool.request().query(`SELECT IdLokasi, Description FROM MstLokasi WHERE [Enable] = 1 ORDER BY IdLokasi`),
  ]);
  return { bagian: bagian.recordset, jenis: jenis.recordset, grade: grade.recordset, lokasi: lokasi.recordset };
}

function mappingKey(src) {
  const k = {
    bagian: Number(src?.IdBagian ?? src?.bagian),
    jenis: Number(src?.IdJenisKayu ?? src?.jenis),
    grade: Number(src?.IdGrade ?? src?.grade),
  };
  if (![k.bagian, k.jenis, k.grade].every(Number.isInteger)) throw httpError(400, "Bagian, Jenis, dan Grade wajib dipilih.");
  return k;
}

async function mappingLokasi(tx, idLokasi) {
  const id = str(idLokasi).toUpperCase();
  if (!id) throw httpError(400, "Lokasi wajib dipilih.");
  if (id.length > 5) throw httpError(404, `Lokasi ${id} tidak ditemukan.`);
  const r = await new sql.Request(tx).input("l", sql.VarChar(5), id).query(`SELECT TOP 1 1 AS x FROM MstLokasi WHERE IdLokasi = @l`);
  if (!r.recordset.length) throw httpError(404, `Lokasi ${id} tidak ditemukan.`);
  return id;
}

async function mappingExists(tx, k) {
  const r = await new sql.Request(tx)
    .input("b", sql.Int, k.bagian)
    .input("j", sql.Int, k.jenis)
    .input("g", sql.Int, k.grade)
    .query(`SELECT TOP 1 1 AS x FROM ${MAP_TABLE} WITH (UPDLOCK, HOLDLOCK) WHERE IdBagian = @b AND IdJenisKayu = @j AND IdGrade = @g`);
  return r.recordset.length > 0;
}

async function mappingCreate(body, user) {
  const k = mappingKey(body);
  return withTx(async (tx) => {
    const lok = await mappingLokasi(tx, body?.IdLokasi);
    if (await mappingExists(tx, k)) throw httpError(409, "Mapping untuk Bagian, Jenis, dan Grade tersebut sudah ada.");
    await new sql.Request(tx)
      .input("b", sql.Int, k.bagian)
      .input("j", sql.Int, k.jenis)
      .input("g", sql.Int, k.grade)
      .input("w", sql.Bit, bit(body?.Warna))
      .input("l", sql.VarChar(5), lok)
      .query(`INSERT INTO ${MAP_TABLE} (IdBagian, IdJenisKayu, IdGrade, Warna, IdLokasi) VALUES (@b, @j, @g, @w, @l)`);
    await audit(tx, user, `Menyimpan Data Master Mapping ID Lokasi ${k.bagian}/${k.jenis}/${k.grade} -> ${lok} (Web)`);
    return { IdBagian: k.bagian, IdJenisKayu: k.jenis, IdGrade: k.grade };
  });
}

async function mappingUpdate(params, body, user) {
  const k = mappingKey(params);
  return withTx(async (tx) => {
    const lok = await mappingLokasi(tx, body?.IdLokasi);
    if (!(await mappingExists(tx, k))) throw httpError(404, "Data mapping tidak ditemukan.");
    await new sql.Request(tx)
      .input("b", sql.Int, k.bagian)
      .input("j", sql.Int, k.jenis)
      .input("g", sql.Int, k.grade)
      .input("w", sql.Bit, bit(body?.Warna))
      .input("l", sql.VarChar(5), lok)
      .query(`UPDATE ${MAP_TABLE} SET Warna = @w, IdLokasi = @l WHERE IdBagian = @b AND IdJenisKayu = @j AND IdGrade = @g`);
    await audit(tx, user, `Mengubah Data Master Mapping ID Lokasi ${k.bagian}/${k.jenis}/${k.grade} -> ${lok} (Web)`);
    return { IdBagian: k.bagian, IdJenisKayu: k.jenis, IdGrade: k.grade };
  });
}

async function mappingRemove(params, user) {
  const k = mappingKey(params);
  try {
    return await withTx(async (tx) => {
      if (!(await mappingExists(tx, k))) throw httpError(404, "Data mapping tidak ditemukan.");
      await new sql.Request(tx)
        .input("b", sql.Int, k.bagian)
        .input("j", sql.Int, k.jenis)
        .input("g", sql.Int, k.grade)
        .query(`DELETE FROM ${MAP_TABLE} WHERE IdBagian = @b AND IdJenisKayu = @j AND IdGrade = @g`);
      await audit(tx, user, `Menghapus Data Master Mapping ID Lokasi ${k.bagian}/${k.jenis}/${k.grade} (Web)`);
      return { IdBagian: k.bagian, IdJenisKayu: k.jenis, IdGrade: k.grade };
    });
  } catch (err) {
    if (isFk(err)) throw httpError(409, "Mapping masih dipakai pada data lain dan tidak dapat dihapus.");
    throw err;
  }
}

module.exports = {
  FLAT_KEYS: Object.keys(FLAT),
  list,
  create,
  update,
  remove,
  mappingList,
  mappingLookups,
  mappingCreate,
  mappingUpdate,
  mappingRemove,
};
