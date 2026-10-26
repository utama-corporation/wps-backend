const { sql, poolPromise } = require("../../core/config/db");

/* ============================================================
 * Paritas desktop: FrmMstPlanningPerMesin.vb ("Master Planning Mesin")
 * 8 tabel berstruktur sama (IdMesin int + Tanggal date +
 * PlanningJamKerja float), dipilih lewat parameter `proses`:
 *   s4s, fj, moulding, laminating, cca, sanding, packing → MstMesin
 *   slp → MstPlanningMesinSLP, IdMesin menyimpan NoMeja MstMesinSawmill
 * PK tiap tabel: (IdMesin, Tanggal).
 * ==========================================================*/

const PROSES = {
  s4s: { table: "MstPlanningMesinS4S", label: "S4S", mesin: "MstMesin" },
  fj: { table: "MstPlanningMesinFJ", label: "FJ", mesin: "MstMesin" },
  moulding: { table: "MstPlanningMesinMoulding", label: "Moulding", mesin: "MstMesin" },
  laminating: { table: "MstPlanningMesinLaminating", label: "Laminating", mesin: "MstMesin" },
  cca: { table: "MstPlanningMesinCCA", label: "CCA", mesin: "MstMesin" },
  sanding: { table: "MstPlanningMesinSanding", label: "Sanding", mesin: "MstMesin" },
  packing: { table: "MstPlanningMesinPacking", label: "Packing", mesin: "MstMesin" },
  slp: { table: "MstPlanningMesinSLP", label: "SLP", mesin: "MstMesinSawmill" },
};

function resolveProses(v) {
  const key = String(v || "").toLowerCase();
  const cfg = PROSES[key];
  if (!cfg) throw httpError(400, `Proses tidak valid. Pilihan: ${Object.keys(PROSES).join(", ")}.`);
  return { key, ...cfg };
}

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

function validateEntry(data) {
  const idMesin = num(data?.idMesin);
  if (!Number.isInteger(idMesin)) throw httpError(400, "Mesin harus dipilih.");
  const tanggal = parseDateOnly(data?.tanggal, "Tanggal");
  const jam = num(data?.planningJamKerja);
  if (jam === null || !Number.isFinite(jam)) throw httpError(400, "Planning jam kerja harus diisi.");
  if (jam < 0) throw httpError(400, "Planning jam kerja tidak boleh negatif.");
  return { idMesin, tanggal, jam };
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

function joinMesin(cfg) {
  return cfg.mesin === "MstMesinSawmill"
    ? `LEFT JOIN MstMesinSawmill m ON m.NoMeja = p.IdMesin`
    : `LEFT JOIN MstMesin m ON m.IdMesin = p.IdMesin`;
}

function namaMesinExpr(cfg) {
  return cfg.mesin === "MstMesinSawmill"
    ? `CAST(m.NoMeja AS varchar(20)) + CASE WHEN m.NamaMeja IS NULL OR m.NamaMeja = '' THEN '' ELSE ' - ' + m.NamaMeja END`
    : `m.NamaMesin`;
}

async function getAll(prosesParam) {
  const cfg = resolveProses(prosesParam);
  const pool = await poolPromise;
  const rs = await pool.request().query(`
    SELECT CONVERT(varchar(10), p.Tanggal, 120) AS Tanggal,
           p.IdMesin, ${namaMesinExpr(cfg)} AS NamaMesin, p.PlanningJamKerja
    FROM ${cfg.table} p
    ${joinMesin(cfg)}
    ORDER BY p.Tanggal DESC, p.IdMesin ASC
  `);
  return rs.recordset;
}

async function getMesin(prosesParam) {
  const cfg = resolveProses(prosesParam);
  const pool = await poolPromise;
  const rs = cfg.mesin === "MstMesinSawmill"
    ? await pool.request().query(`
        SELECT NoMeja AS IdMesin,
               CAST(NoMeja AS varchar(20)) + CASE WHEN NamaMeja IS NULL OR NamaMeja = '' THEN '' ELSE ' - ' + NamaMeja END AS NamaMesin
        FROM MstMesinSawmill ORDER BY NoMeja ASC
      `)
    : await pool.request().query(`
        SELECT IdMesin, NamaMesin FROM MstMesin ORDER BY NamaMesin ASC
      `);
  return rs.recordset;
}

async function assertMesinExists(tx, cfg, idMesin) {
  const r = cfg.mesin === "MstMesinSawmill"
    ? await new sql.Request(tx).input("m", sql.Int, idMesin).query(`SELECT TOP 1 1 AS ok FROM MstMesinSawmill WHERE NoMeja = @m`)
    : await new sql.Request(tx).input("m", sql.Int, idMesin).query(`SELECT TOP 1 1 AS ok FROM MstMesin WHERE IdMesin = @m`);
  if (!r.recordset.length) throw httpError(404, `Mesin id ${idMesin} tidak ditemukan.`);
}

async function create(data, user) {
  const cfg = resolveProses(data?.proses);
  const v = validateEntry(data);
  return withTx(async (tx) => {
    await assertMesinExists(tx, cfg, v.idMesin);
    const dup = await new sql.Request(tx)
      .input("m", sql.Int, v.idMesin)
      .input("t", sql.Date, v.tanggal)
      .query(`SELECT TOP 1 1 AS ok FROM ${cfg.table} WHERE IdMesin = @m AND Tanggal = @t`);
    if (dup.recordset.length) throw httpError(409, `Planning ${cfg.label} untuk mesin & tanggal tersebut sudah terdaftar.`);
    await new sql.Request(tx)
      .input("m", sql.Int, v.idMesin)
      .input("t", sql.Date, v.tanggal)
      .input("j", sql.Float, v.jam)
      .query(`INSERT INTO ${cfg.table} (IdMesin, Tanggal, PlanningJamKerja) VALUES (@m, @t, @j)`);
    await audit(tx, user, `Menyimpan Planning Mesin ${cfg.label} mesin ${v.idMesin} (${v.tanggal}) (Web)`);
    return { proses: cfg.key, idMesin: v.idMesin, tanggal: v.tanggal };
  });
}

async function update(oldKeys, data, user) {
  const cfg = resolveProses(data?.proses);
  const oldIdMesin = num(oldKeys?.idMesin);
  if (!Number.isInteger(oldIdMesin)) throw httpError(400, "Mesin lama tidak valid.");
  const oldTanggal = parseDateOnly(oldKeys?.tanggal, "Tanggal lama");
  const v = validateEntry(data);
  return withTx(async (tx) => {
    const cur = await new sql.Request(tx)
      .input("m", sql.Int, oldIdMesin)
      .input("t", sql.Date, oldTanggal)
      .query(`SELECT TOP 1 1 AS ok FROM ${cfg.table} WHERE IdMesin = @m AND Tanggal = @t`);
    if (!cur.recordset.length) throw httpError(404, `Planning ${cfg.label} tidak ditemukan.`);
    await assertMesinExists(tx, cfg, v.idMesin);
    await new sql.Request(tx)
      .input("om", sql.Int, oldIdMesin)
      .input("ot", sql.Date, oldTanggal)
      .input("m", sql.Int, v.idMesin)
      .input("t", sql.Date, v.tanggal)
      .input("j", sql.Float, v.jam)
      .query(`UPDATE ${cfg.table} SET IdMesin = @m, Tanggal = @t, PlanningJamKerja = @j
              WHERE IdMesin = @om AND Tanggal = @ot`);
    await audit(tx, user, `Mengubah Planning Mesin ${cfg.label} mesin ${v.idMesin} (${v.tanggal}) (Web)`);
    return { proses: cfg.key, idMesin: v.idMesin, tanggal: v.tanggal };
  });
}

async function remove(keys, data, user) {
  const cfg = resolveProses(data?.proses || keys?.proses);
  const idMesin = num(keys?.idMesin);
  if (!Number.isInteger(idMesin)) throw httpError(400, "Mesin tidak valid.");
  const tanggal = parseDateOnly(keys?.tanggal, "Tanggal");
  try {
    return await withTx(async (tx) => {
      const cur = await new sql.Request(tx)
        .input("m", sql.Int, idMesin)
        .input("t", sql.Date, tanggal)
        .query(`SELECT TOP 1 1 AS ok FROM ${cfg.table} WHERE IdMesin = @m AND Tanggal = @t`);
      if (!cur.recordset.length) throw httpError(404, `Planning ${cfg.label} tidak ditemukan.`);
      await new sql.Request(tx)
        .input("m", sql.Int, idMesin)
        .input("t", sql.Date, tanggal)
        .query(`DELETE FROM ${cfg.table} WHERE IdMesin = @m AND Tanggal = @t`);
      await audit(tx, user, `Menghapus Planning Mesin ${cfg.label} mesin ${idMesin} (${tanggal}) (Web)`);
      return { proses: cfg.key, idMesin, tanggal };
    });
  } catch (err) {
    if (err.number === 547 || err.originalError?.info?.number === 547) {
      throw httpError(409, "Planning mesin masih dipakai pada data lain dan tidak dapat dihapus.");
    }
    throw err;
  }
}

function listProses() {
  return Object.entries(PROSES).map(([key, c]) => ({ proses: key, label: c.label }));
}

module.exports = { getAll, getMesin, create, update, remove, listProses };
