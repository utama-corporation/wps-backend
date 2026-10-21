const { sql, poolPromise } = require("../../core/config/db");

/* ============================================================
 * Tutup Transaksi — MstTutupTransaksi (bulanan, PK Period) &
 * MstTutupTransaksiHarian (harian, PK Id + PeriodHarian; Id = MAX + 1, bukan identity).
 * Dibaca oleh core/utils/periode-lock.js untuk mengunci transaksi.
 * ==========================================================*/

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

const bit = (v) => (v === true || v === 1 || v === "1" || v === "true" ? 1 : 0);

async function audit(transaction, user, aktivitas) {
  const r = new sql.Request(transaction);
  r.input("nip", sql.VarChar(50), user || "admin");
  r.input("aktivitas", sql.VarChar(500), aktivitas);
  await r.query(`INSERT INTO Riwayat ([Nip], [Tgl], [Aktivitas]) VALUES (@nip, GETDATE(), @aktivitas)`);
}

/** Validasi "YYYY-MM-DD" (atau "YYYY-MM" bila allowMonth) → string tanggal. */
function parseYmd(value, { allowMonth = false } = {}) {
  const s = String(value ?? "").trim();
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(s);
  if (!m || (!m[3] && !allowMonth)) throw httpError(400, "Tanggal tidak valid.");
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3] ?? 1);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (mo < 1 || mo > 12 || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) {
    throw httpError(400, "Tanggal tidak valid.");
  }
  return `${String(y).padStart(4, "0")}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Bulanan selalu disimpan tanggal 1. */
const monthStart = (value) => `${parseYmd(value, { allowMonth: true }).slice(0, 7)}-01`;

async function withTx(fn) {
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const out = await fn(transaction);
    await transaction.commit();
    return out;
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

/* ===================== BULANAN ===================== */

async function getBulanan() {
  const pool = await poolPromise;
  const r = await pool.request().query(`
    SELECT CONVERT(varchar(10), Period, 23) AS Period, CAST(ISNULL(Lock, 0) AS bit) AS Lock
    FROM MstTutupTransaksi
    ORDER BY Period DESC
  `);
  return r.recordset;
}

async function createBulanan(data, user) {
  const period = monthStart(data.period);
  const lock = bit(data.lock);
  return withTx(async (tx) => {
    const exist = await new sql.Request(tx)
      .input("p", sql.Date, period)
      .query(`SELECT 1 AS ok FROM MstTutupTransaksi WITH (UPDLOCK, HOLDLOCK) WHERE Period = @p`);
    if (exist.recordset.length) throw httpError(409, `Periode ${period.slice(0, 7)} sudah ada.`);
    await new sql.Request(tx)
      .input("p", sql.Date, period)
      .input("lock", sql.Bit, lock)
      .query(`INSERT INTO MstTutupTransaksi (Period, Lock) VALUES (@p, @lock)`);
    await audit(tx, user, `Tutup Transaksi Bulanan ${period.slice(0, 7)} ditambah (Lock=${lock})`);
    return { period, lock: !!lock };
  });
}

async function updateBulanan(periodParam, data, user) {
  const period = monthStart(periodParam);
  const lock = bit(data.lock);
  return withTx(async (tx) => {
    const r = await new sql.Request(tx)
      .input("p", sql.Date, period)
      .input("lock", sql.Bit, lock)
      .query(`UPDATE MstTutupTransaksi SET Lock = @lock WHERE Period = @p`);
    if (!r.rowsAffected[0]) throw httpError(404, "Periode tidak ditemukan.");
    await audit(tx, user, `Tutup Transaksi Bulanan ${period.slice(0, 7)} diubah (Lock=${lock})`);
    return { period, lock: !!lock };
  });
}

async function removeBulanan(periodParam, user) {
  const period = monthStart(periodParam);
  return withTx(async (tx) => {
    const r = await new sql.Request(tx)
      .input("p", sql.Date, period)
      .query(`DELETE FROM MstTutupTransaksi WHERE Period = @p`);
    if (!r.rowsAffected[0]) throw httpError(404, "Periode tidak ditemukan.");
    await audit(tx, user, `Tutup Transaksi Bulanan ${period.slice(0, 7)} dihapus`);
    return { period };
  });
}

/* ===================== HARIAN ===================== */

async function getHarian() {
  const pool = await poolPromise;
  const r = await pool.request().query(`
    SELECT Id, CONVERT(varchar(10), PeriodHarian, 23) AS PeriodHarian, CAST(ISNULL(Lock, 0) AS bit) AS Lock
    FROM MstTutupTransaksiHarian
    ORDER BY PeriodHarian DESC, Id DESC
  `);
  return r.recordset;
}

async function createHarian(data, user) {
  const tgl = parseYmd(data.periodHarian);
  const lock = bit(data.lock);
  return withTx(async (tx) => {
    const exist = await new sql.Request(tx)
      .input("t", sql.Date, tgl)
      .query(`SELECT 1 AS ok FROM MstTutupTransaksiHarian WITH (UPDLOCK, HOLDLOCK) WHERE PeriodHarian = @t`);
    if (exist.recordset.length) throw httpError(409, `Tanggal ${tgl} sudah ada.`);
    const seq = await new sql.Request(tx).query(
      `SELECT ISNULL(MAX(Id), 0) + 1 AS Id FROM MstTutupTransaksiHarian WITH (UPDLOCK, HOLDLOCK)`,
    );
    const id = seq.recordset[0].Id;
    await new sql.Request(tx)
      .input("id", sql.Int, id)
      .input("t", sql.Date, tgl)
      .input("lock", sql.Bit, lock)
      .query(`INSERT INTO MstTutupTransaksiHarian (Id, PeriodHarian, Lock) VALUES (@id, @t, @lock)`);
    await audit(tx, user, `Tutup Transaksi Harian ${tgl} ditambah (Lock=${lock})`);
    return { id, periodHarian: tgl, lock: !!lock };
  });
}

async function updateHarian(idParam, data, user) {
  const id = Number(idParam);
  if (!Number.isInteger(id) || id <= 0) throw httpError(400, "Id tidak valid.");
  const tgl = parseYmd(data.periodHarian);
  const lock = bit(data.lock);
  return withTx(async (tx) => {
    const dup = await new sql.Request(tx)
      .input("id", sql.Int, id)
      .input("t", sql.Date, tgl)
      .query(`SELECT 1 AS ok FROM MstTutupTransaksiHarian WHERE PeriodHarian = @t AND Id <> @id`);
    if (dup.recordset.length) throw httpError(409, `Tanggal ${tgl} sudah ada.`);
    const r = await new sql.Request(tx)
      .input("id", sql.Int, id)
      .input("t", sql.Date, tgl)
      .input("lock", sql.Bit, lock)
      .query(`UPDATE MstTutupTransaksiHarian SET PeriodHarian = @t, Lock = @lock WHERE Id = @id`);
    if (!r.rowsAffected[0]) throw httpError(404, "Data tidak ditemukan.");
    await audit(tx, user, `Tutup Transaksi Harian Id ${id} diubah (${tgl}, Lock=${lock})`);
    return { id, periodHarian: tgl, lock: !!lock };
  });
}

async function removeHarian(idParam, user) {
  const id = Number(idParam);
  if (!Number.isInteger(id) || id <= 0) throw httpError(400, "Id tidak valid.");
  return withTx(async (tx) => {
    const r = await new sql.Request(tx)
      .input("id", sql.Int, id)
      .query(`DELETE FROM MstTutupTransaksiHarian WHERE Id = @id`);
    if (!r.rowsAffected[0]) throw httpError(404, "Data tidak ditemukan.");
    await audit(tx, user, `Tutup Transaksi Harian Id ${id} dihapus`);
    return { id };
  });
}

module.exports = {
  getBulanan,
  createBulanan,
  updateBulanan,
  removeBulanan,
  getHarian,
  createHarian,
  updateHarian,
  removeHarian,
};
