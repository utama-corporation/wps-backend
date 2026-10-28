const { sql, poolPromise } = require("../../core/config/db");

/* ============================================================
 * Paritas desktop: FrmGolPengukuran.vb
 * Master MstGolPengukuran (header) + MstGolPengukuran_d (detail grade/tebal/lebar).
 * Header: IdPengukuran (MAX+1), Kategori, GolPengukuran, CreateDate, Enable (ADA/TIDAK ADA).
 * Detail: NoUrut, NamaGrade, Tebal, Lebar — diganti penuh saat update (delete+insert).
 * ==========================================================*/

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

async function audit(transaction, user, aktivitas) {
  const r = new sql.Request(transaction);
  r.input("nip", sql.VarChar(50), user || "admin");
  r.input("aktivitas", sql.VarChar(500), aktivitas);
  await r.query(`INSERT INTO Riwayat ([Nip], [Tgl], [Aktivitas]) VALUES (@nip, GETDATE(), @aktivitas)`);
}

const bit = (v) => (v === true || v === 1 || v === "1" || v === "true" ? 1 : 0);
const numOrNull = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

function validate(data) {
  const kategori = String(data.kategori ?? "").trim();
  const golPengukuran = String(data.golPengukuran ?? "").trim();
  if (!kategori) throw httpError(400, "Kategori harus diisi.");
  if (!golPengukuran) throw httpError(400, "Golongan Pengukuran harus diisi.");
  if (kategori.length > 5) throw httpError(400, "Kategori maksimal 5 karakter.");
  if (golPengukuran.length > 225) throw httpError(400, "Golongan Pengukuran maksimal 225 karakter.");

  const rawDetail = Array.isArray(data.detail) ? data.detail : [];
  const detail = rawDetail
    .map((d, i) => ({
      noUrut: Number.isInteger(Number(d?.noUrut)) ? Number(d.noUrut) : i + 1,
      namaGrade: String(d?.namaGrade ?? "").trim().slice(0, 15),
      tebal: numOrNull(d?.tebal),
      lebar: numOrNull(d?.lebar),
    }))
    .filter((d) => d.namaGrade || d.tebal !== null || d.lebar !== null);

  return { kategori, golPengukuran, enable: bit(data.enable), detail };
}

async function getAll() {
  const pool = await poolPromise;
  const rs = await pool.request().query(`
    SELECT IdPengukuran, Kategori, GolPengukuran, [Enable]
    FROM dbo.MstGolPengukuran
    ORDER BY IdPengukuran ASC
  `);
  return rs.recordset;
}

async function getDetail(id) {
  const idNum = Number(id);
  if (!Number.isInteger(idNum)) throw httpError(400, "Id pengukuran tidak valid.");
  const pool = await poolPromise;
  const rs = await new sql.Request(pool)
    .input("id", sql.Int, idNum)
    .query(`
      SELECT IdPengukuran, NoUrut, NamaGrade, Tebal, Lebar
      FROM dbo.MstGolPengukuran_d
      WHERE IdPengukuran = @id
      ORDER BY NoUrut ASC
    `);
  return rs.recordset;
}

async function insertDetail(transaction, id, detail) {
  for (const d of detail) {
    const r = new sql.Request(transaction);
    r.input("id", sql.Int, id);
    r.input("noUrut", sql.Int, d.noUrut);
    r.input("namaGrade", sql.VarChar(15), d.namaGrade);
    r.input("tebal", sql.Float, d.tebal);
    r.input("lebar", sql.Float, d.lebar);
    await r.query(`
      INSERT INTO dbo.MstGolPengukuran_d (IdPengukuran, NoUrut, NamaGrade, Tebal, Lebar)
      VALUES (@id, @noUrut, @namaGrade, @tebal, @lebar)
    `);
  }
}

async function create(data, user) {
  const v = validate(data);
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const m = await new sql.Request(transaction).query(
      `SELECT ISNULL(MAX(IdPengukuran), 0) + 1 AS NextId FROM dbo.MstGolPengukuran WITH (UPDLOCK, HOLDLOCK)`,
    );
    const id = m.recordset[0].NextId;

    const req = new sql.Request(transaction);
    req.input("id", sql.Int, id);
    req.input("kategori", sql.NVarChar(5), v.kategori);
    req.input("gol", sql.NVarChar(225), v.golPengukuran);
    req.input("enable", sql.Bit, v.enable);
    await req.query(`
      INSERT INTO dbo.MstGolPengukuran (IdPengukuran, Kategori, GolPengukuran, CreateDate, [Enable])
      VALUES (@id, @kategori, @gol, GETDATE(), @enable)
    `);

    await insertDetail(transaction, id, v.detail);

    await audit(transaction, user, `Menyimpan Data Master Gol.Pengukuran ${v.golPengukuran} (Web)`);
    await transaction.commit();
    return { idPengukuran: id };
  } catch (err) {
    try { await transaction.rollback(); } catch { /* ignore */ }
    throw mapSqlError(err);
  }
}

async function update(id, data, user) {
  const idNum = Number(id);
  if (!Number.isInteger(idNum)) throw httpError(400, "Id pengukuran tidak valid.");
  const v = validate(data);
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const c = new sql.Request(transaction);
    c.input("id", sql.Int, idNum);
    const cur = await c.query(`SELECT GolPengukuran FROM dbo.MstGolPengukuran WHERE IdPengukuran = @id`);
    if (!cur.recordset.length) throw httpError(404, "Data Golongan Pengukuran tidak ditemukan.");

    const req = new sql.Request(transaction);
    req.input("id", sql.Int, idNum);
    req.input("kategori", sql.NVarChar(5), v.kategori);
    req.input("gol", sql.NVarChar(225), v.golPengukuran);
    req.input("enable", sql.Bit, v.enable);
    await req.query(`
      UPDATE dbo.MstGolPengukuran
      SET Kategori = @kategori, GolPengukuran = @gol, [Enable] = @enable
      WHERE IdPengukuran = @id
    `);

    // Ganti penuh detail (paritas vb: delete + insert).
    const del = new sql.Request(transaction);
    del.input("id", sql.Int, idNum);
    await del.query(`DELETE FROM dbo.MstGolPengukuran_d WHERE IdPengukuran = @id`);
    await insertDetail(transaction, idNum, v.detail);

    await audit(transaction, user, `Mengubah Data Master Gol.Pengukuran ${v.golPengukuran} (Web)`);
    await transaction.commit();
    return { idPengukuran: idNum };
  } catch (err) {
    try { await transaction.rollback(); } catch { /* ignore */ }
    throw mapSqlError(err);
  }
}

async function setEnable(id, enable, user) {
  const idNum = Number(id);
  if (!Number.isInteger(idNum)) throw httpError(400, "Id pengukuran tidak valid.");
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const c = new sql.Request(transaction);
    c.input("id", sql.Int, idNum);
    const cur = await c.query(`SELECT GolPengukuran FROM dbo.MstGolPengukuran WHERE IdPengukuran = @id`);
    if (!cur.recordset.length) throw httpError(404, "Data Golongan Pengukuran tidak ditemukan.");

    const req = new sql.Request(transaction);
    req.input("id", sql.Int, idNum);
    req.input("enable", sql.Bit, bit(enable));
    await req.query(`UPDATE dbo.MstGolPengukuran SET [Enable] = @enable WHERE IdPengukuran = @id`);
    await audit(transaction, user, `Mengubah Status Gol.Pengukuran ${cur.recordset[0].GolPengukuran} Menjadi ${bit(enable) ? "ADA" : "TIDAK ADA"} (Web)`);
    await transaction.commit();
    return { idPengukuran: idNum };
  } catch (err) {
    try { await transaction.rollback(); } catch { /* ignore */ }
    throw err;
  }
}

async function remove(id, user) {
  const idNum = Number(id);
  if (!Number.isInteger(idNum)) throw httpError(400, "Id pengukuran tidak valid.");
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const c = new sql.Request(transaction);
    c.input("id", sql.Int, idNum);
    const cur = await c.query(`SELECT GolPengukuran FROM dbo.MstGolPengukuran WHERE IdPengukuran = @id`);
    if (!cur.recordset.length) throw httpError(404, "Data Golongan Pengukuran tidak ditemukan.");

    const del = new sql.Request(transaction);
    del.input("id", sql.Int, idNum);
    await del.query(`DELETE FROM dbo.MstGolPengukuran_d WHERE IdPengukuran = @id`);

    const req = new sql.Request(transaction);
    req.input("id", sql.Int, idNum);
    await req.query(`DELETE FROM dbo.MstGolPengukuran WHERE IdPengukuran = @id`);

    await audit(transaction, user, `Menghapus Data Master Gol.Pengukuran ${cur.recordset[0].GolPengukuran} (Web)`);
    await transaction.commit();
    return { idPengukuran: idNum };
  } catch (err) {
    try { await transaction.rollback(); } catch { /* ignore */ }
    if (err.number === 547 || err.originalError?.info?.number === 547) {
      throw httpError(409, "Golongan Pengukuran sudah dipakai pada transaksi dan tidak dapat dihapus. Ubah statusnya menjadi TIDAK ADA sebagai gantinya.");
    }
    throw err;
  }
}

function mapSqlError(err) {
  const n = err.number ?? err.originalError?.info?.number;
  if (n === 2628 || n === 8152) {
    return httpError(400, "Data terlalu panjang untuk disimpan. Persingkat kategori atau golongan pengukuran.");
  }
  return err;
}

module.exports = { getAll, getDetail, create, update, setEnable, remove };
