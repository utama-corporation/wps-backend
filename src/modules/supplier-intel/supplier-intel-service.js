const { sql, poolPromise } = require("../../core/config/db");

/* ============================================================
 * Paritas desktop: FrmSupplierIntel.vb
 * Tabel SupplierIntel (IdSupplierIntel, IdOtherFactory, DateIn, NoPlat, TonKB, M3ST,
 * IdOtherSupplier, IdSourceLocation). ID = "SI" + yyMM + urut 7 digit.
 * Master dropdown: MstSupplierIntelOtherFactory / OtherSupplier / SourceLocation.
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

/** Angka opsional: kosong -> null; koma desimal diterima (paritas ParseDecimal VB). */
function toDecimal(v, label) {
  if (v === null || v === undefined || String(v).trim() === "") return null;
  const n = Number(String(v).trim().replace(",", "."));
  if (!Number.isFinite(n)) throw httpError(400, `${label} harus angka!`);
  return n;
}

function toId(v, label) {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw httpError(400, `Pilih ${label}!`);
  return n;
}

function readBody(body) {
  const noPlat = String(body?.noPlat ?? "").trim();
  if (!noPlat) throw httpError(400, "No Plat tidak boleh kosong!");
  if (noPlat.length > 20) throw httpError(400, "No Plat maksimal 20 karakter.");
  const dateIn = new Date(body?.dateIn);
  if (Number.isNaN(dateIn.getTime())) throw httpError(400, "Tanggal masuk tidak valid!");
  return {
    idFactory: toId(body?.idOtherFactory, "Pabrik"),
    idSupplier: toId(body?.idOtherSupplier, "Supplier"),
    idLocation: toId(body?.idSourceLocation, "Lokasi Sumber"),
    dateIn,
    noPlat,
    tonKB: toDecimal(body?.tonKB, "Ton KB"),
    m3ST: toDecimal(body?.m3ST, "M3 ST"),
  };
}

function bindFields(req, d) {
  req.input("factory", sql.Int, d.idFactory);
  req.input("supplier", sql.Int, d.idSupplier);
  req.input("location", sql.Int, d.idLocation);
  req.input("date", sql.DateTime, d.dateIn);
  req.input("plat", sql.VarChar(20), d.noPlat);
  req.input("ton", sql.Decimal(18, 3), d.tonKB);
  req.input("m3", sql.Decimal(18, 3), d.m3ST);
}

async function getAll({ from, to } = {}) {
  const pool = await poolPromise;
  const req = pool.request();
  const where = [];
  if (from) {
    req.input("from", sql.Date, new Date(from));
    where.push("CAST(s.DateIn AS date) >= @from");
  }
  if (to) {
    req.input("to", sql.Date, new Date(to));
    where.push("CAST(s.DateIn AS date) <= @to");
  }
  const rs = await req.query(`
    SELECT s.IdSupplierIntel, s.DateIn, s.NoPlat, s.TonKB, s.M3ST,
           f.NamaPabrik, sup.NamaSupplier, loc.NamaLokasi,
           s.IdOtherFactory, s.IdOtherSupplier, s.IdSourceLocation
    FROM dbo.SupplierIntel s
    LEFT JOIN dbo.MstSupplierIntelOtherFactory f ON s.IdOtherFactory = f.IdOtherFactory
    LEFT JOIN dbo.MstSupplierIntelOtherSupplier sup ON s.IdOtherSupplier = sup.IdOtherSupplier
    LEFT JOIN dbo.MstSupplierIntelSourceLocation loc ON s.IdSourceLocation = loc.IdSourceLocation
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY s.DateIn DESC, s.IdSupplierIntel DESC
  `);
  return rs.recordset;
}

async function getOptions() {
  const pool = await poolPromise;
  const [factories, suppliers, locations] = await Promise.all([
    pool.request().query(`SELECT IdOtherFactory, NamaPabrik FROM dbo.MstSupplierIntelOtherFactory ORDER BY NamaPabrik`),
    pool.request().query(`SELECT IdOtherSupplier, NamaSupplier FROM dbo.MstSupplierIntelOtherSupplier ORDER BY NamaSupplier`),
    pool.request().query(`SELECT IdSourceLocation, NamaLokasi FROM dbo.MstSupplierIntelSourceLocation ORDER BY NamaLokasi`),
  ]);
  return { factories: factories.recordset, suppliers: suppliers.recordset, locations: locations.recordset };
}

/** ID berikutnya: "SI" + yyMM + 7 digit urut bulan berjalan (dikunci agar tidak dobel). */
async function nextId(transaction) {
  const now = new Date();
  const prefix = `SI${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const r = new sql.Request(transaction);
  r.input("like", sql.VarChar(20), `${prefix}%`);
  const rs = await r.query(`
    SELECT TOP 1 IdSupplierIntel FROM dbo.SupplierIntel WITH (UPDLOCK, HOLDLOCK)
    WHERE IdSupplierIntel LIKE @like ORDER BY IdSupplierIntel DESC
  `);
  const last = rs.recordset.length ? parseInt(String(rs.recordset[0].IdSupplierIntel).slice(prefix.length), 10) : 0;
  return `${prefix}${String((Number.isFinite(last) ? last : 0) + 1).padStart(7, "0")}`;
}

async function create(body, user) {
  const d = readBody(body);
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const id = await nextId(transaction);
    const req = new sql.Request(transaction);
    req.input("id", sql.VarChar(20), id);
    bindFields(req, d);
    await req.query(`
      INSERT INTO dbo.SupplierIntel (IdSupplierIntel, IdOtherFactory, DateIn, NoPlat, TonKB, M3ST, IdOtherSupplier, IdSourceLocation)
      VALUES (@id, @factory, @date, @plat, @ton, @m3, @supplier, @location)
    `);
    await audit(transaction, user, `Menyimpan Data Supplier Intel ${id} (${d.noPlat}) (Web)`);
    await transaction.commit();
    return { idSupplierIntel: id };
  } catch (err) {
    try { await transaction.rollback(); } catch { /* ignore */ }
    throw err;
  }
}

async function update(id, body, user) {
  const d = readBody(body);
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const req = new sql.Request(transaction);
    req.input("id", sql.VarChar(20), id);
    bindFields(req, d);
    const r = await req.query(`
      UPDATE dbo.SupplierIntel
      SET IdOtherFactory=@factory, DateIn=@date, NoPlat=@plat, TonKB=@ton, M3ST=@m3,
          IdOtherSupplier=@supplier, IdSourceLocation=@location
      WHERE IdSupplierIntel=@id
    `);
    if (!r.rowsAffected[0]) throw httpError(404, "Data supplier intel tidak ditemukan.");
    await audit(transaction, user, `Mengubah Data Supplier Intel ${id} (${d.noPlat}) (Web)`);
    await transaction.commit();
    return { idSupplierIntel: id };
  } catch (err) {
    try { await transaction.rollback(); } catch { /* ignore */ }
    throw err;
  }
}

async function remove(id, user) {
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const req = new sql.Request(transaction);
    req.input("id", sql.VarChar(20), id);
    const r = await req.query(`DELETE FROM dbo.SupplierIntel WHERE IdSupplierIntel=@id`);
    if (!r.rowsAffected[0]) throw httpError(404, "Data supplier intel tidak ditemukan.");
    await audit(transaction, user, `Menghapus Data Supplier Intel ${id} (Web)`);
    await transaction.commit();
    return { idSupplierIntel: id };
  } catch (err) {
    try { await transaction.rollback(); } catch { /* ignore */ }
    throw err;
  }
}

module.exports = { getAll, getOptions, create, update, remove };
