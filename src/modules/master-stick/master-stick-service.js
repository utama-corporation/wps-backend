const { sql, poolPromise } = require("../../core/config/db");

/* ============================================================
 * Paritas desktop: FrmMstStickNew.vb ("Master Stick" — saldo awal)
 * MstStick (PK: TglSaldoAwal date + IdGradeStick int;
 * JumlahStick int).
 * Lookup grade: MstGradeStick. Desktop menyimpan update/delete
 * per IdGradeStick (asumsi 1 baris per grade); versi web memakai
 * composite key lengkap agar aman bila ada beberapa tanggal.
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

const num = (v) => (v === null || v === undefined || v === "" ? null : Number(v));

function parseDateOnly(v, label) {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw httpError(400, `${label} tidak valid.`);
  return d.toISOString().slice(0, 10);
}

function validate(data, { skipTanggal = false } = {}) {
  const idGradeStick = num(data?.idGradeStick);
  if (!Number.isInteger(idGradeStick)) throw httpError(400, "Grade stick harus dipilih.");
  const jumlah = num(data?.jumlahStick);
  if (!Number.isInteger(jumlah)) throw httpError(400, "Jumlah stick harus berupa bilangan bulat.");
  if (jumlah < 0) throw httpError(400, "Jumlah stick tidak boleh negatif.");
  const tglSaldoAwal = skipTanggal ? null : parseDateOnly(data?.tglSaldoAwal, "Tanggal saldo awal");
  return { idGradeStick, jumlah, ...(tglSaldoAwal ? { tglSaldoAwal } : {}) };
}

async function withTx(fn) {
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const out = await fn(transaction);
    await transaction.commit();
    return out;
  } catch (err) {
    try { await transaction.rollback(); } catch { /* ignore */ }
    throw err;
  }
}

async function getAll() {
  const pool = await poolPromise;
  const rs = await pool.request().query(`
    SELECT CONVERT(varchar(10), A.TglSaldoAwal, 120) AS TglSaldoAwal,
           A.IdGradeStick, B.NamaGradeStick, A.JumlahStick
    FROM MstStick A
    LEFT JOIN MstGradeStick B ON B.IdGradeStick = A.IdGradeStick
    ORDER BY A.TglSaldoAwal DESC, A.IdGradeStick ASC
  `);
  return rs.recordset;
}

async function getGrades() {
  const pool = await poolPromise;
  const rs = await pool.request().query(`
    SELECT IdGradeStick, NamaGradeStick FROM MstGradeStick ORDER BY IdGradeStick ASC
  `);
  return rs.recordset;
}

async function create(data, user) {
  const v = validate(data);
  return withTx(async (tx) => {
    const g = await new sql.Request(tx)
      .input("g", sql.Int, v.idGradeStick)
      .query(`SELECT TOP 1 NamaGradeStick FROM MstGradeStick WHERE IdGradeStick = @g`);
    if (!g.recordset.length) throw httpError(404, "Grade stick tidak ditemukan.");
    const dup = await new sql.Request(tx)
      .input("t", sql.Date, v.tglSaldoAwal)
      .input("g", sql.Int, v.idGradeStick)
      .query(`SELECT TOP 1 1 AS ok FROM MstStick WHERE TglSaldoAwal = @t AND IdGradeStick = @g`);
    if (dup.recordset.length) throw httpError(409, "Saldo awal stick untuk grade & tanggal tersebut sudah terdaftar.");
    await new sql.Request(tx)
      .input("t", sql.Date, v.tglSaldoAwal)
      .input("g", sql.Int, v.idGradeStick)
      .input("j", sql.Int, v.jumlah)
      .query(`INSERT INTO MstStick (TglSaldoAwal, IdGradeStick, JumlahStick) VALUES (@t, @g, @j)`);
    await audit(tx, user, `Menyimpan Data Master Stick ${g.recordset[0].NamaGradeStick} (${v.tglSaldoAwal}) (Web)`);
    return { tglSaldoAwal: v.tglSaldoAwal, idGradeStick: v.idGradeStick };
  });
}

async function update(oldKeys, data, user) {
  const oldTgl = parseDateOnly(oldKeys?.tglSaldoAwal, "Tanggal saldo awal lama");
  const oldGrade = num(oldKeys?.idGradeStick);
  if (!Number.isInteger(oldGrade)) throw httpError(400, "Grade stick lama tidak valid.");
  const v = validate(data);
  return withTx(async (tx) => {
    const cur = await new sql.Request(tx)
      .input("t", sql.Date, oldTgl)
      .input("g", sql.Int, oldGrade)
      .query(`SELECT TOP 1 1 AS ok FROM MstStick WHERE TglSaldoAwal = @t AND IdGradeStick = @g`);
    if (!cur.recordset.length) throw httpError(404, "Saldo awal stick tidak ditemukan.");
    const g = await new sql.Request(tx)
      .input("g", sql.Int, v.idGradeStick)
      .query(`SELECT TOP 1 NamaGradeStick FROM MstGradeStick WHERE IdGradeStick = @g`);
    if (!g.recordset.length) throw httpError(404, "Grade stick tidak ditemukan.");
    await new sql.Request(tx)
      .input("ot", sql.Date, oldTgl)
      .input("og", sql.Int, oldGrade)
      .input("t", sql.Date, v.tglSaldoAwal)
      .input("g", sql.Int, v.idGradeStick)
      .input("j", sql.Int, v.jumlah)
      .query(`UPDATE MstStick SET TglSaldoAwal = @t, IdGradeStick = @g, JumlahStick = @j
              WHERE TglSaldoAwal = @ot AND IdGradeStick = @og`);
    await audit(tx, user, `Mengubah Data Master Stick ${g.recordset[0].NamaGradeStick} (${v.tglSaldoAwal}) (Web)`);
    return { tglSaldoAwal: v.tglSaldoAwal, idGradeStick: v.idGradeStick };
  });
}

async function remove(keys, user) {
  const tgl = parseDateOnly(keys?.tglSaldoAwal, "Tanggal saldo awal");
  const grade = num(keys?.idGradeStick);
  if (!Number.isInteger(grade)) throw httpError(400, "Grade stick tidak valid.");
  try {
    return await withTx(async (tx) => {
      const g = await new sql.Request(tx)
        .input("g", sql.Int, grade)
        .query(`SELECT TOP 1 NamaGradeStick FROM MstGradeStick WHERE IdGradeStick = @g`);
      const cur = await new sql.Request(tx)
        .input("t", sql.Date, tgl)
        .input("g", sql.Int, grade)
        .query(`SELECT TOP 1 1 AS ok FROM MstStick WHERE TglSaldoAwal = @t AND IdGradeStick = @g`);
      if (!cur.recordset.length) throw httpError(404, "Saldo awal stick tidak ditemukan.");
      await new sql.Request(tx)
        .input("t", sql.Date, tgl)
        .input("g", sql.Int, grade)
        .query(`DELETE FROM MstStick WHERE TglSaldoAwal = @t AND IdGradeStick = @g`);
      await audit(tx, user, `Menghapus Data Master Stick ${g.recordset[0]?.NamaGradeStick || grade} (${tgl}) (Web)`);
      return { tglSaldoAwal: tgl, idGradeStick: grade };
    });
  } catch (err) {
    if (err.number === 547 || err.originalError?.info?.number === 547) {
      throw httpError(409, "Saldo awal stick masih dipakai pada data lain dan tidak dapat dihapus.");
    }
    throw err;
  }
}

module.exports = { getAll, getGrades, create, update, remove };
