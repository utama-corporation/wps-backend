const { sql, poolPromise } = require("../config/db");

function formatYmd(d) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Kunci periode transaksi — 2 pengecekan:
 *  1. Bulanan : MstTutupTransaksi (Period di bulan yang sama, Lock = 1)
 *  2. Harian  : MstTutupTransaksiHarian — tanggal <= MAX(PeriodHarian) WHERE Lock = 1
 * Return: { kunci: null|"bulanan"|"harian", lockHarian: Date|null }.
 * Pola sama dengan vacuumv2-service & lembar-tally-hasil-sawmill-service.
 */
async function getKunciPeriode(transaction, tanggal) {
  if (!tanggal) return { kunci: null, lockHarian: null };
  const t = new Date(tanggal);
  if (Number.isNaN(t.getTime())) return { kunci: null, lockHarian: null };

  const req = transaction ? transaction.request() : (await poolPromise).request();
  req.input("month", sql.Int, t.getMonth() + 1);
  req.input("year", sql.Int, t.getFullYear());

  const bulanan = await req.query(`
    SELECT COUNT(*) AS jml FROM MstTutupTransaksi
    WHERE Month(Period) = @month AND Year(Period) = @year AND Lock = 1
  `);
  if (Number(bulanan.recordset[0].jml) > 0) return { kunci: "bulanan", lockHarian: null };

  const harian = await req.query(`
    SELECT Max(PeriodHarian) AS PeriodHarian FROM MstTutupTransaksiHarian WHERE Lock = 1
  `);
  const lockHarian = harian.recordset[0]?.PeriodHarian ?? null;
  if (lockHarian) {
    const lockDate = new Date(lockHarian);
    const pickerDate = new Date(t.getFullYear(), t.getMonth(), t.getDate());
    const lockOnlyDate = new Date(lockDate.getFullYear(), lockDate.getMonth(), lockDate.getDate());
    if (pickerDate <= lockOnlyDate) return { kunci: "harian", lockHarian: lockOnlyDate };
  }

  return { kunci: null, lockHarian: null };
}

async function cekPeriodeTerbuka(transaction, tanggal) {
  return (await getKunciPeriode(transaction, tanggal)).kunci === null;
}

/**
 * Lempar 400 bila periode sudah terkunci — dipanggil sebelum CUD.
 * transaction (opsional) untuk pengecekan di dalam transaksi SQL.
 */
async function assertPeriodeTerbuka(tanggal, transaction) {
  if (!tanggal) return;
  const { kunci, lockHarian } = await getKunciPeriode(transaction, tanggal);
  if (!kunci) return;

  const t = new Date(tanggal);
  const err = new Error(
    kunci === "bulanan"
      ? `Maaf, Periode ini sudah terkunci — bulan ${String(t.getMonth() + 1).padStart(2, "0")}/${t.getFullYear()} termasuk Tutup Transaksi`
      : `Maaf, Periode ini sudah terkunci — tanggal ${formatYmd(t)} termasuk Tutup Transaksi Harian (kunci s.d. ${formatYmd(lockHarian)})`,
  );
  err.status = 400;
  err.statusCode = 400;
  throw err;
}

module.exports = {
  getKunciPeriode,
  cekPeriodeTerbuka,
  assertPeriodeTerbuka,
};
