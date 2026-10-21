const { sql, poolPromise } = require("../../core/config/db");

/* ============================================================
 * Paritas desktop: FrmReserveForSPK.vb ("Reserve For SPK")
 * ReserveForSPK (IdReserveForSPK = MAX + 1, bukan identity) + detail per kategori
 * ReserveForSPK_{ST,S4S,FJ,MLD,CCA,LMT,SAND,BJ} (IdJenisKayu, Tebal, Lebar, Ton; PK = Id + Jenis + Tebal + Lebar).
 * Ton = "Ton" untuk ST, "M3" untuk kategori lain (kolom sama).
 * Simpan/ubah menulis header + seluruh detail dalam satu transaksi (ubah = hapus lalu isi ulang).
 * ==========================================================*/

const KATEGORI = ["ST", "S4S", "FJ", "MLD", "CCA", "LMT", "SAND", "BJ"];
const tableOf = (k) => `ReserveForSPK_${k}`;

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

const str = (v) => String(v ?? "").trim();
const num = (v) => {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
};

function validate(data) {
  const noSPK = str(data.noSPK);
  if (!noSPK) throw httpError(400, "No. SPK harus dipilih.");
  const tanggal = str(data.tanggal).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) throw httpError(400, "Tanggal harus diisi.");

  const details = (Array.isArray(data.details) ? data.details : []).map((r, i) => {
    const row = `detail baris ${i + 1}`;
    const kategori = str(r.kategori).toUpperCase();
    if (!KATEGORI.includes(kategori)) throw httpError(400, `Kategori tidak valid (${row}).`);
    const idJenisKayu = Number(r.idJenisKayu);
    if (!Number.isInteger(idJenisKayu) || idJenisKayu <= 0) throw httpError(400, `Jenis kayu belum dipilih (${row}).`);
    const tebal = num(r.tebal);
    const lebar = num(r.lebar);
    if (!(tebal > 0)) throw httpError(400, `Tebal harus lebih dari 0 (${row}).`);
    if (!(lebar > 0)) throw httpError(400, `Lebar harus lebih dari 0 (${row}).`);
    let ton = null;
    if (r.ton !== null && r.ton !== undefined && str(r.ton) !== "") {
      ton = num(r.ton);
      if (!(ton >= 0)) throw httpError(400, `${kategori === "ST" ? "Ton" : "M3"} tidak valid (${row}).`);
    }
    return { kategori, idJenisKayu, tebal, lebar, ton };
  });

  const seen = new Set();
  for (const d of details) {
    const k = [d.kategori, d.idJenisKayu, d.tebal, d.lebar].join("|");
    if (seen.has(k)) throw httpError(400, `Data yang sama sudah ada di kategori [${d.kategori}].`);
    seen.add(k);
  }
  return { noSPK, tanggal, details };
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

/* ===================== READ ===================== */

async function getAll() {
  const pool = await poolPromise;
  const exists = KATEGORI.map(
    (k) => `SELECT '${k}' AS Kat, COUNT(*) AS N FROM ${tableOf(k)} WHERE IdReserveForSPK = r.IdReserveForSPK`,
  ).join(" UNION ALL ");
  const rs = await pool.request().query(`
    SELECT r.IdReserveForSPK, r.NoSPK, CONVERT(varchar(10), r.[Date], 23) AS Tanggal,
           b.Buyer,
           (SELECT STRING_AGG(Kat, ',') WITHIN GROUP (ORDER BY Kat) FROM (${exists}) X WHERE N > 0) AS Kategori,
           (SELECT SUM(N) FROM (${exists}) Y) AS JumlahBaris
    FROM ReserveForSPK r
    LEFT JOIN MstSPK_h h ON h.NoSPK = r.NoSPK
    LEFT JOIN MstBuyer b ON b.IdBuyer = h.IdBuyer
    ORDER BY r.IdReserveForSPK DESC
  `);
  return rs.recordset;
}

async function getMasters() {
  const pool = await poolPromise;
  const [spk, jenis] = await Promise.all([
    pool.request().query(`
      SELECT h.NoSPK AS id, h.NoSPK + ' — ' + ISNULL(b.Buyer, '') AS nama
      FROM MstSPK_h h
      LEFT JOIN MstBuyer b ON b.IdBuyer = h.IdBuyer
      WHERE h.[Enable] = 1
      ORDER BY h.NoSPK DESC
    `),
    pool.request().query(`SELECT IdJenisKayu AS id, Jenis AS nama FROM MstJenisKayu WHERE [Enable] = 1 ORDER BY Jenis`),
  ]);
  return { spk: spk.recordset, jenis_kayu: jenis.recordset, kategori: KATEGORI };
}

async function getById(idParam) {
  const id = Number(idParam);
  if (!Number.isInteger(id)) throw httpError(400, "Id reserve tidak valid.");
  const pool = await poolPromise;
  const head = await pool
    .request()
    .input("id", sql.Int, id)
    .query(`
      SELECT r.IdReserveForSPK, r.NoSPK, CONVERT(varchar(10), r.[Date], 23) AS Tanggal, b.Buyer
      FROM ReserveForSPK r
      LEFT JOIN MstSPK_h h ON h.NoSPK = r.NoSPK
      LEFT JOIN MstBuyer b ON b.IdBuyer = h.IdBuyer
      WHERE r.IdReserveForSPK = @id
    `);
  if (!head.recordset[0]) return null;
  const parts = await Promise.all(
    KATEGORI.map((k) =>
      pool
        .request()
        .input("id", sql.Int, id)
        .query(`
          SELECT '${k}' AS Kategori, d.IdJenisKayu, j.Jenis, d.Tebal, d.Lebar, d.Ton
          FROM ${tableOf(k)} d
          LEFT JOIN MstJenisKayu j ON j.IdJenisKayu = d.IdJenisKayu
          WHERE d.IdReserveForSPK = @id
          ORDER BY j.Jenis, d.Tebal, d.Lebar
        `)
        .then((r) => r.recordset),
    ),
  );
  return { header: head.recordset[0], details: parts.flat() };
}

/* ===================== WRITE ===================== */

async function assertRefs(tx, v) {
  const spk = await new sql.Request(tx)
    .input("no", sql.VarChar(20), v.noSPK)
    .query(`SELECT 1 AS ok FROM MstSPK_h WHERE NoSPK = @no`);
  if (!spk.recordset.length) throw httpError(400, `SPK ${v.noSPK} tidak ditemukan.`);
  const ids = [...new Set(v.details.map((d) => d.idJenisKayu))];
  if (ids.length) {
    const r = await new sql.Request(tx).query(`SELECT COUNT(*) AS n FROM MstJenisKayu WHERE IdJenisKayu IN (${ids.join(",")})`);
    if (Number(r.recordset[0].n) !== ids.length) throw httpError(400, "Jenis kayu tidak ditemukan di master.");
  }
}

async function insertDetails(tx, id, details) {
  for (const d of details) {
    await new sql.Request(tx)
      .input("id", sql.Int, id)
      .input("jk", sql.Int, d.idJenisKayu)
      .input("t", sql.Float, d.tebal)
      .input("l", sql.Float, d.lebar)
      .input("ton", sql.Float, d.ton)
      .query(
        `INSERT INTO ${tableOf(d.kategori)} (IdReserveForSPK, IdJenisKayu, Tebal, Lebar, Ton) VALUES (@id, @jk, @t, @l, @ton)`,
      );
  }
}

async function deleteDetails(tx, id) {
  for (const k of KATEGORI) {
    await new sql.Request(tx).input("id", sql.Int, id).query(`DELETE FROM ${tableOf(k)} WHERE IdReserveForSPK = @id`);
  }
}

async function create(data, user) {
  const v = validate(data);
  return withTx(async (tx) => {
    await assertRefs(tx, v);
    const m = await new sql.Request(tx).query(
      `SELECT ISNULL(MAX(IdReserveForSPK), 0) + 1 AS NextId FROM ReserveForSPK WITH (UPDLOCK, HOLDLOCK)`,
    );
    const id = m.recordset[0].NextId;
    await new sql.Request(tx)
      .input("id", sql.Int, id)
      .input("no", sql.VarChar(20), v.noSPK)
      .input("tgl", sql.Date, v.tanggal)
      .query(`INSERT INTO ReserveForSPK (IdReserveForSPK, NoSPK, [Date]) VALUES (@id, @no, @tgl)`);
    await insertDetails(tx, id, v.details);
    await audit(tx, user, `Menyimpan Data Reserve For SPK ${id} (${v.noSPK}) (Web)`);
    return { idReserveForSPK: id };
  });
}

async function update(idParam, data, user) {
  const id = Number(idParam);
  if (!Number.isInteger(id)) throw httpError(400, "Id reserve tidak valid.");
  const v = validate(data);
  return withTx(async (tx) => {
    const cur = await new sql.Request(tx)
      .input("id", sql.Int, id)
      .query(`SELECT 1 AS ok FROM ReserveForSPK WITH (UPDLOCK, HOLDLOCK) WHERE IdReserveForSPK = @id`);
    if (!cur.recordset.length) throw httpError(404, "Reserve For SPK tidak ditemukan.");
    await assertRefs(tx, v);
    await new sql.Request(tx)
      .input("id", sql.Int, id)
      .input("no", sql.VarChar(20), v.noSPK)
      .input("tgl", sql.Date, v.tanggal)
      .query(`UPDATE ReserveForSPK SET NoSPK = @no, [Date] = @tgl WHERE IdReserveForSPK = @id`);
    await deleteDetails(tx, id);
    await insertDetails(tx, id, v.details);
    await audit(tx, user, `Mengubah Data Reserve For SPK ${id} (${v.noSPK}) (Web)`);
    return { idReserveForSPK: id };
  });
}

async function remove(idParam, user) {
  const id = Number(idParam);
  if (!Number.isInteger(id)) throw httpError(400, "Id reserve tidak valid.");
  return withTx(async (tx) => {
    const cur = await new sql.Request(tx)
      .input("id", sql.Int, id)
      .query(`SELECT NoSPK FROM ReserveForSPK WHERE IdReserveForSPK = @id`);
    if (!cur.recordset.length) throw httpError(404, "Reserve For SPK tidak ditemukan.");
    await deleteDetails(tx, id);
    await new sql.Request(tx).input("id", sql.Int, id).query(`DELETE FROM ReserveForSPK WHERE IdReserveForSPK = @id`);
    await audit(tx, user, `Menghapus Data Reserve For SPK ${id} (${cur.recordset[0].NoSPK}) (Web)`);
    return { idReserveForSPK: id };
  });
}

module.exports = { getAll, getMasters, getById, create, update, remove };
