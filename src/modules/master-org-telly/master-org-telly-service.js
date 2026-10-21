const { sql, poolPromise } = require("../../core/config/db");

/* ============================================================
 * Paritas desktop: FrmMstOrgTelly.vb
 * Master MstOrgTelly (IdOrgTelly, NamaOrgTelly, [Enable]).
 * IdOrgTelly = MAX + 1 (bukan identity / bukan jumlah baris seperti di VB).
 *
 * PENTING: modul proses (S4S, Sanding, dst.) menentukan telly pembuat label dengan mencocokkan
 * MstUsername.FName = MstOrgTelly.NamaOrgTelly. Karena itu nama orang telly harus unik dan
 * mengganti nama memutus hubungan dengan user yang FName-nya masih memakai nama lama.
 * Setiap perubahan dicatat ke Riwayat.
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

function validate(data) {
  const nama = String(data.namaOrgTelly ?? "").trim();
  if (!nama) throw httpError(400, "Nama orang telly harus diisi.");
  return { nama: nama.slice(0, 100), enable: bit(data.enable) };
}

/** Nama harus unik di seluruh orang telly (dipakai sebagai kunci pencocokan ke user). */
async function assertUnique(transaction, nama, exceptId) {
  const r = new sql.Request(transaction);
  r.input("nama", sql.VarChar(100), nama);
  r.input("id", sql.Int, exceptId ?? 0);
  const d = await r.query(
    `SELECT TOP 1 1 AS dup FROM dbo.MstOrgTelly WHERE LTRIM(RTRIM(NamaOrgTelly)) = @nama AND IdOrgTelly <> @id`,
  );
  if (d.recordset.length) throw httpError(409, `Orang telly "${nama}" sudah ada.`);
}

function mapSqlError(err) {
  const n = err.number ?? err.originalError?.info?.number;
  if (n === 2628 || n === 8152) return httpError(400, "Data terlalu panjang untuk disimpan. Persingkat nama.");
  return err;
}

async function getAll() {
  const pool = await poolPromise;
  const rs = await pool.request().query(`
    SELECT t.IdOrgTelly, t.NamaOrgTelly, CAST(ISNULL(t.[Enable], 0) AS bit) AS [Enable],
           (SELECT COUNT(*) FROM dbo.MstUsername u WHERE u.FName = t.NamaOrgTelly) AS JumlahUser
    FROM dbo.MstOrgTelly t
    ORDER BY t.IdOrgTelly ASC
  `);
  return rs.recordset;
}

async function create(data, user) {
  const v = validate(data);
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    await assertUnique(transaction, v.nama, null);

    const m = await new sql.Request(transaction).query(
      `SELECT ISNULL(MAX(IdOrgTelly), 0) + 1 AS NextId FROM dbo.MstOrgTelly WITH (UPDLOCK, HOLDLOCK)`,
    );
    const id = m.recordset[0].NextId;

    const req = new sql.Request(transaction);
    req.input("id", sql.Int, id);
    req.input("nama", sql.VarChar(100), v.nama);
    req.input("enable", sql.Bit, v.enable);
    await req.query(`
      INSERT INTO dbo.MstOrgTelly (IdOrgTelly, NamaOrgTelly, [Enable]) VALUES (@id, @nama, @enable)
    `);
    await audit(transaction, user, `Menyimpan Data Master Orang Telly ${v.nama} (Web)`);
    await transaction.commit();
    return { idOrgTelly: id };
  } catch (err) {
    try { await transaction.rollback(); } catch { /* ignore */ }
    throw mapSqlError(err);
  }
}

async function update(id, data, user) {
  const idNum = Number(id);
  if (!Number.isInteger(idNum)) throw httpError(400, "Id orang telly tidak valid.");
  const v = validate(data);
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const c = new sql.Request(transaction);
    c.input("id", sql.Int, idNum);
    const cur = await c.query(`SELECT NamaOrgTelly FROM dbo.MstOrgTelly WHERE IdOrgTelly = @id`);
    if (!cur.recordset.length) throw httpError(404, "Orang telly tidak ditemukan.");

    // Cek kembar hanya bila nama diganti, agar data lama yang sudah kembar tetap bisa diubah.
    const renamed = String(cur.recordset[0].NamaOrgTelly ?? "").trim().toLowerCase() !== v.nama.toLowerCase();
    if (renamed) await assertUnique(transaction, v.nama, idNum);

    const req = new sql.Request(transaction);
    req.input("id", sql.Int, idNum);
    req.input("nama", sql.VarChar(100), v.nama);
    req.input("enable", sql.Bit, v.enable);
    await req.query(`
      UPDATE dbo.MstOrgTelly SET NamaOrgTelly = @nama, [Enable] = @enable WHERE IdOrgTelly = @id
    `);
    await audit(
      transaction,
      user,
      renamed
        ? `Mengubah Data Master Orang Telly ${cur.recordset[0].NamaOrgTelly} menjadi ${v.nama} (Web)`
        : `Mengubah Data Master Orang Telly ${v.nama} (Web)`,
    );
    await transaction.commit();
    return { idOrgTelly: idNum };
  } catch (err) {
    try { await transaction.rollback(); } catch { /* ignore */ }
    throw mapSqlError(err);
  }
}

async function remove(id, user) {
  const idNum = Number(id);
  if (!Number.isInteger(idNum)) throw httpError(400, "Id orang telly tidak valid.");
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const c = new sql.Request(transaction);
    c.input("id", sql.Int, idNum);
    const cur = await c.query(`
      SELECT t.NamaOrgTelly,
             (SELECT COUNT(*) FROM dbo.MstUsername u WHERE u.FName = t.NamaOrgTelly) AS JumlahUser
      FROM dbo.MstOrgTelly t WHERE t.IdOrgTelly = @id
    `);
    if (!cur.recordset.length) throw httpError(404, "Orang telly tidak ditemukan.");
    if (cur.recordset[0].JumlahUser > 0) {
      throw httpError(
        409,
        `Orang telly "${cur.recordset[0].NamaOrgTelly}" masih terhubung ke ${cur.recordset[0].JumlahUser} user (FName sama) dan tidak dapat dihapus. Ubah statusnya menjadi TIDAK AKTIF sebagai gantinya.`,
      );
    }

    const req = new sql.Request(transaction);
    req.input("id", sql.Int, idNum);
    await req.query(`DELETE FROM dbo.MstOrgTelly WHERE IdOrgTelly = @id`);
    await audit(transaction, user, `Menghapus Data Master Orang Telly ${cur.recordset[0].NamaOrgTelly} (Web)`);
    await transaction.commit();
    return { idOrgTelly: idNum };
  } catch (err) {
    try { await transaction.rollback(); } catch { /* ignore */ }
    // 547 = pelanggaran FK: sudah dipakai di label
    if (err.number === 547 || err.originalError?.info?.number === 547) {
      throw httpError(
        409,
        "Orang telly sudah dipakai pada label dan tidak dapat dihapus. Ubah statusnya menjadi TIDAK AKTIF sebagai gantinya.",
      );
    }
    throw err;
  }
}

module.exports = { getAll, create, update, remove };
