const { sql, poolPromise } = require("../../core/config/db");

/* ============================================================
 * Paritas tablet: GradeABC.java + GradeApi + MasterApi.getGradeABCList
 * Header GradeABC_h (GG.XXXXXX) + detail GradeABC_d (IdGradeABC unik per header).
 * ==========================================================*/

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

const clip = (v, max) => {
  const s = v == null || v === "" ? null : String(v).trim();
  return s == null || s === "" ? null : s.slice(0, max);
};

async function audit(transaction, user, aktivitas) {
  const r = new sql.Request(transaction);
  r.input("nip", sql.VarChar(50), user || "admin");
  r.input("aktifitas", sql.VarChar(500), aktivitas);
  await r.query(`INSERT INTO Riwayat ([Nip], [Tgl], [Aktivitas]) VALUES (@nip, GETDATE(), @aktifitas)`);
}

function parsePcs(v) {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw httpError(400, "Pcs harus angka > 0.");
  return n;
}

function parseId(v) {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw httpError(400, "Pilih Grade yang valid.");
  return n;
}

/* GET master grade (dropdown) — paritas MasterApi.getGradeABCList */
async function getMaster() {
  const pool = await poolPromise;
  const r = await pool.request().query(`
    SELECT TOP 1000 IdGradeABC, NamaGrade FROM dbo.MstGradeABC ORDER BY NamaGrade ASC
  `);
  return r.recordset;
}

/* GET list header — paritas getGradeABCData (TOP 500) + pencarian */
async function getAll({ search, topRow }) {
  const pool = await poolPromise;
  const req = pool.request();
  req.input("top", sql.Int, parseInt(topRow, 10) || 500);

  let where = "";
  if (search) {
    req.input("search", sql.VarChar(100), `%${search}%`);
    where = `WHERE NoGradeABC LIKE @search OR Keterangan LIKE @search`;
  }

  const r = await req.query(`
    SELECT TOP (@top) NoGradeABC, Tanggal, Keterangan
    FROM dbo.GradeABC_h
    ${where}
    ORDER BY NoGradeABC DESC
  `);
  return r.recordset;
}

/* GET detail — paritas getGradeABCDetailData */
async function getDetail(no) {
  const pool = await poolPromise;
  const req = pool.request();
  req.input("no", sql.VarChar(50), no);
  const r = await req.query(`
    SELECT d.NoGradeABC, d.IdGradeABC, ISNULL(m.NamaGrade, '') AS NamaGrade, d.JmlhBatang
    FROM dbo.GradeABC_d d
    LEFT JOIN dbo.MstGradeABC m ON d.IdGradeABC = m.IdGradeABC
    WHERE d.NoGradeABC = @no
    ORDER BY d.IdGradeABC ASC
  `);
  return r.recordset;
}

function validateHeader(data) {
  if (!data.tanggal) throw httpError(400, "Tanggal harus diisi");
}

/* CREATE header — generate GG.XXXXXX (paritas insertGradeABCHeaderWithGeneratedNo) */
async function createHeader(data, user) {
  validateHeader(data);
  const pool = await poolPromise;

  let lastErr = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const transaction = new sql.Transaction(pool);
    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    try {
      const g = await transaction.request().query(`
        SELECT ISNULL(MAX(TRY_CONVERT(INT, RIGHT(NoGradeABC, 6))), 0) AS MaxNum
        FROM dbo.GradeABC_h WITH (UPDLOCK, HOLDLOCK)
        WHERE NoGradeABC LIKE 'GG.%' AND LEN(NoGradeABC) = 9
      `);
      const last = Number(g.recordset[0].MaxNum);
      if (last >= 999999) throw httpError(400, "NoGradeABC overflow (>= GG.999999)");
      const no = "GG." + String(last + 1).padStart(6, "0");

      const req = new sql.Request(transaction);
      req.input("no", sql.VarChar(50), no);
      req.input("tanggal", sql.Date, data.tanggal);
      req.input("keterangan", sql.VarChar(255), clip(data.keterangan, 255));
      await req.query(`
        INSERT INTO dbo.GradeABC_h (NoGradeABC, Tanggal, Keterangan) VALUES (@no, @tanggal, @keterangan)
      `);

      await audit(transaction, user, `Membuat Data ${no} Pada Grade ABC (Web)`);
      await transaction.commit();
      return { noGradeABC: no };
    } catch (err) {
      try { await transaction.rollback(); } catch { /* ignore */ }
      lastErr = err;
      if (!/PRIMARY KEY|UNIQUE|duplicate/i.test(err.message)) throw err;
    }
  }
  throw lastErr;
}

/* UPDATE header — paritas updateGradeABCHeader */
async function updateHeader(no, data, user) {
  validateHeader(data);
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const req = new sql.Request(transaction);
    req.input("no", sql.VarChar(50), no);
    req.input("tanggal", sql.Date, data.tanggal);
    req.input("keterangan", sql.VarChar(255), clip(data.keterangan, 255));
    const r = await req.query(`
      UPDATE dbo.GradeABC_h SET Tanggal = @tanggal, Keterangan = @keterangan WHERE NoGradeABC = @no
    `);
    if (!r.rowsAffected[0]) throw httpError(404, `Grade ABC ${no} tidak ditemukan.`);

    await audit(transaction, user, `Mengubah Data ${no} Pada Grade ABC (Web)`);
    await transaction.commit();
    return { noGradeABC: no };
  } catch (err) {
    try { await transaction.rollback(); } catch { /* ignore */ }
    throw err;
  }
}

/* DELETE header + seluruh detail — paritas deleteGradeABCHeaderCascade */
async function deleteHeader(no, user) {
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const d = new sql.Request(transaction);
    d.input("no", sql.VarChar(50), no);
    await d.query(`DELETE FROM dbo.GradeABC_d WHERE NoGradeABC = @no`);

    const h = new sql.Request(transaction);
    h.input("no", sql.VarChar(50), no);
    const r = await h.query(`DELETE FROM dbo.GradeABC_h WHERE NoGradeABC = @no`);
    if (!r.rowsAffected[0]) throw httpError(404, `Grade ABC ${no} tidak ditemukan.`);

    await audit(transaction, user, `Menghapus Data ${no} Pada Grade ABC (Web)`);
    await transaction.commit();
    return { noGradeABC: no };
  } catch (err) {
    try { await transaction.rollback(); } catch { /* ignore */ }
    throw err;
  }
}

async function detailExists(transaction, no, id) {
  const req = new sql.Request(transaction);
  req.input("no", sql.VarChar(50), no);
  req.input("id", sql.Int, id);
  const r = await req.query(`
    SELECT COUNT(*) AS n FROM dbo.GradeABC_d WHERE NoGradeABC = @no AND IdGradeABC = @id
  `);
  return r.recordset[0].n > 0;
}

/* INSERT detail — tolak duplikat grade (paritas existsGradeABCDetail + insertGradeABCDetail) */
async function addDetail(no, data, user) {
  const id = parseId(data.idGradeABC);
  const pcs = parsePcs(data.jmlhBatang);

  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    if (await detailExists(transaction, no, id)) throw httpError(409, "Duplikat! Grade ini telah di input");

    const req = new sql.Request(transaction);
    req.input("no", sql.VarChar(50), no);
    req.input("id", sql.Int, id);
    req.input("pcs", sql.Int, pcs);
    await req.query(`
      INSERT INTO dbo.GradeABC_d (NoGradeABC, IdGradeABC, JmlhBatang) VALUES (@no, @id, @pcs)
    `);

    await audit(transaction, user, `Menambah Detail Grade ${id} (${pcs} pcs) Pada ${no} Grade ABC (Web)`);
    await transaction.commit();
    return { noGradeABC: no, idGradeABC: id };
  } catch (err) {
    try { await transaction.rollback(); } catch { /* ignore */ }
    throw err;
  }
}

/* UPDATE detail — boleh ganti grade (paritas updateGradeABCDetail) */
async function updateDetail(no, oldId, data, user) {
  const from = parseId(oldId);
  const to = parseId(data.idGradeABC);
  const pcs = parsePcs(data.jmlhBatang);

  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    if (to !== from && (await detailExists(transaction, no, to))) {
      throw httpError(409, "Duplikat! Grade ini sudah ada.");
    }

    const req = new sql.Request(transaction);
    req.input("no", sql.VarChar(50), no);
    req.input("from", sql.Int, from);
    req.input("to", sql.Int, to);
    req.input("pcs", sql.Int, pcs);
    const r = await req.query(`
      UPDATE dbo.GradeABC_d SET IdGradeABC = @to, JmlhBatang = @pcs
      WHERE NoGradeABC = @no AND IdGradeABC = @from
    `);
    if (!r.rowsAffected[0]) throw httpError(404, "Detail tidak ditemukan.");

    await audit(transaction, user, `Mengubah Detail Grade ${from} -> ${to} (${pcs} pcs) Pada ${no} Grade ABC (Web)`);
    await transaction.commit();
    return { noGradeABC: no, idGradeABC: to };
  } catch (err) {
    try { await transaction.rollback(); } catch { /* ignore */ }
    throw err;
  }
}

/* DELETE detail — paritas deleteGradeABCDetail */
async function deleteDetail(no, id, user) {
  const gid = parseId(id);
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const req = new sql.Request(transaction);
    req.input("no", sql.VarChar(50), no);
    req.input("id", sql.Int, gid);
    const r = await req.query(`DELETE FROM dbo.GradeABC_d WHERE NoGradeABC = @no AND IdGradeABC = @id`);
    if (!r.rowsAffected[0]) throw httpError(404, "Detail tidak ditemukan.");

    await audit(transaction, user, `Menghapus Detail Grade ${gid} Pada ${no} Grade ABC (Web)`);
    await transaction.commit();
    return { noGradeABC: no, idGradeABC: gid };
  } catch (err) {
    try { await transaction.rollback(); } catch { /* ignore */ }
    throw err;
  }
}

module.exports = {
  getMaster,
  getAll,
  getDetail,
  createHeader,
  updateHeader,
  deleteHeader,
  addDetail,
  updateDetail,
  deleteDetail,
};
