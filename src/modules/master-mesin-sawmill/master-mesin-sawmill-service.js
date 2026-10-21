const { sql, poolPromise } = require("../../core/config/db");

/* ============================================================
 * Paritas desktop: FrmMstMesinSawmill.vb
 * Master MstMesinSawmill (NoMeja, NamaMeja, IdGroupMesinSawmill, Type, [Enable], IdOperator1, IdOperator2)
 * + lookup MstGroupMesinSawmill dan MstOperator (bagian 8 & 9 = operator sawmill).
 * NoMeja = MAX + 1 (bukan identity). Kolom IsSLP / IsGroup hanya ditampilkan, tidak diubah di form.
 * Endpoint /api/mesin-sawmill (GET aktif saja) dipakai modul lain dan tidak diubah.
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

/** Id opsional: kosong / -1 / 0 -> null. */
function optId(v, label) {
  if (v === null || v === undefined || v === "" || Number(v) <= 0) return null;
  const n = Number(v);
  if (!Number.isInteger(n)) throw httpError(400, `${label} tidak valid.`);
  return n;
}

function validate(data) {
  const nama = String(data.namaMeja ?? "").trim();
  if (!nama) throw httpError(400, "Nama meja harus diisi.");
  const idGroup = Number(data.idGroup);
  if (!Number.isInteger(idGroup) || idGroup <= 0) throw httpError(400, "Keterangan (group mesin sawmill) harus dipilih.");
  const idOp1 = optId(data.idOperator1, "Operator 1");
  const idOp2 = optId(data.idOperator2, "Operator 2");
  if (idOp1 !== null && idOp1 === idOp2) throw httpError(400, "Operator 1 dan operator 2 tidak boleh sama.");
  return {
    nama: nama.slice(0, 100),
    idGroup,
    type: String(data.type ?? "").trim().slice(0, 50),
    idOp1,
    idOp2,
    enable: bit(data.enable),
  };
}

function bindFields(req, v) {
  req.input("nama", sql.VarChar(100), v.nama);
  req.input("idGroup", sql.Int, v.idGroup);
  req.input("type", sql.VarChar(50), v.type);
  req.input("idOp1", sql.Int, v.idOp1);
  req.input("idOp2", sql.Int, v.idOp2);
  req.input("enable", sql.Bit, v.enable);
}

/** Pastikan group & operator ada. */
async function assertRefs(transaction, v) {
  const r = new sql.Request(transaction);
  r.input("g", sql.Int, v.idGroup);
  r.input("o1", sql.Int, v.idOp1);
  r.input("o2", sql.Int, v.idOp2);
  const rs = await r.query(`
    SELECT (SELECT 1 FROM dbo.MstGroupMesinSawmill WHERE IdGroupMesinSawmill = @g) AS GroupOk,
           (SELECT 1 FROM dbo.MstOperator WHERE IdOperator = @o1) AS Op1Ok,
           (SELECT 1 FROM dbo.MstOperator WHERE IdOperator = @o2) AS Op2Ok
  `);
  const row = rs.recordset[0];
  if (!row.GroupOk) throw httpError(400, "Keterangan (group mesin sawmill) tidak ditemukan.");
  if (v.idOp1 !== null && !row.Op1Ok) throw httpError(400, "Operator 1 tidak ditemukan.");
  if (v.idOp2 !== null && !row.Op2Ok) throw httpError(400, "Operator 2 tidak ditemukan.");
}

/** Nama meja tidak boleh kembar dalam group yang sama (abaikan huruf besar/kecil). */
async function assertUnique(transaction, nama, idGroup, exceptNo) {
  const r = new sql.Request(transaction);
  r.input("nama", sql.VarChar(100), nama);
  r.input("g", sql.Int, idGroup);
  r.input("no", sql.Int, exceptNo ?? 0);
  const d = await r.query(`
    SELECT TOP 1 1 AS dup FROM dbo.MstMesinSawmill
    WHERE LTRIM(RTRIM(NamaMeja)) = @nama AND IdGroupMesinSawmill = @g AND NoMeja <> @no
  `);
  if (d.recordset.length) throw httpError(409, `Meja "${nama}" sudah ada pada keterangan yang sama.`);
}

function mapSqlError(err) {
  const n = err.number ?? err.originalError?.info?.number;
  if (n === 2628 || n === 8152) return httpError(400, "Data terlalu panjang untuk disimpan. Persingkat nama meja atau type.");
  return err;
}

async function getAll() {
  const pool = await poolPromise;
  const rs = await pool.request().query(`
    SELECT A.NoMeja, A.NamaMeja, A.IdGroupMesinSawmill AS IdGroup, B.NamaGroupMesinSawmill AS NamaGroup,
           A.[Type], A.IdOperator1, C.NamaOperator AS NamaOperator1, A.IdOperator2, D.NamaOperator AS NamaOperator2,
           CAST(ISNULL(A.[Enable], 0) AS bit) AS [Enable],
           CAST(ISNULL(A.IsSLP, 0) AS bit) AS IsSLP,
           CAST(ISNULL(A.IsGroup, 0) AS bit) AS IsGroup
    FROM dbo.MstMesinSawmill A
    LEFT JOIN dbo.MstGroupMesinSawmill B ON B.IdGroupMesinSawmill = A.IdGroupMesinSawmill
    LEFT JOIN dbo.MstOperator C ON C.IdOperator = A.IdOperator1
    LEFT JOIN dbo.MstOperator D ON D.IdOperator = A.IdOperator2
    ORDER BY A.NoMeja ASC
  `);
  return rs.recordset;
}

/** Pilihan dropdown: semua group; operator aktif bagian sawmill (8 & 9) seperti VB. */
async function getOptions() {
  const pool = await poolPromise;
  const [groups, operators] = await Promise.all([
    pool.request().query(`
      SELECT IdGroupMesinSawmill AS IdGroup, NamaGroupMesinSawmill AS NamaGroup
      FROM dbo.MstGroupMesinSawmill ORDER BY NamaGroupMesinSawmill ASC
    `),
    pool.request().query(`
      SELECT IdOperator, NamaOperator FROM dbo.MstOperator
      WHERE [Enable] = 1 AND IdBagian IN (8, 9) ORDER BY NamaOperator ASC
    `),
  ]);
  return { groups: groups.recordset, operators: operators.recordset };
}

async function create(data, user) {
  const v = validate(data);
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    await assertRefs(transaction, v);
    await assertUnique(transaction, v.nama, v.idGroup, null);

    const m = await new sql.Request(transaction).query(
      `SELECT ISNULL(MAX(NoMeja), 0) + 1 AS NextNo FROM dbo.MstMesinSawmill WITH (UPDLOCK, HOLDLOCK)`,
    );
    const no = m.recordset[0].NextNo;

    const req = new sql.Request(transaction);
    req.input("no", sql.Int, no);
    bindFields(req, v);
    await req.query(`
      INSERT INTO dbo.MstMesinSawmill (NoMeja, IdGroupMesinSawmill, [Type], [Enable], IdOperator1, IdOperator2, NamaMeja)
      VALUES (@no, @idGroup, @type, @enable, @idOp1, @idOp2, @nama)
    `);
    await audit(transaction, user, `Menyimpan Data Master Mesin Sawmill ${v.nama} (Web)`);
    await transaction.commit();
    return { noMeja: no };
  } catch (err) {
    try { await transaction.rollback(); } catch { /* ignore */ }
    throw mapSqlError(err);
  }
}

async function update(noMeja, data, user) {
  const no = Number(noMeja);
  if (!Number.isInteger(no)) throw httpError(400, "No meja tidak valid.");
  const v = validate(data);
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const c = new sql.Request(transaction);
    c.input("no", sql.Int, no);
    const cur = await c.query(`SELECT NamaMeja, IdGroupMesinSawmill FROM dbo.MstMesinSawmill WHERE NoMeja = @no`);
    if (!cur.recordset.length) throw httpError(404, "Mesin sawmill tidak ditemukan.");

    await assertRefs(transaction, v);
    // Cek kembar hanya bila nama / group diganti, agar data lama yang sudah kembar tetap bisa diubah.
    const before = cur.recordset[0];
    if (
      String(before.NamaMeja ?? "").trim().toLowerCase() !== v.nama.toLowerCase() ||
      before.IdGroupMesinSawmill !== v.idGroup
    ) {
      await assertUnique(transaction, v.nama, v.idGroup, no);
    }

    const req = new sql.Request(transaction);
    req.input("no", sql.Int, no);
    bindFields(req, v);
    await req.query(`
      UPDATE dbo.MstMesinSawmill
      SET IdGroupMesinSawmill = @idGroup, [Enable] = @enable, IdOperator1 = @idOp1, IdOperator2 = @idOp2,
          NamaMeja = @nama, [Type] = @type
      WHERE NoMeja = @no
    `);
    await audit(transaction, user, `Mengubah Data Master Mesin Sawmill ${v.nama} (Web)`);
    await transaction.commit();
    return { noMeja: no };
  } catch (err) {
    try { await transaction.rollback(); } catch { /* ignore */ }
    throw mapSqlError(err);
  }
}

async function remove(noMeja, user) {
  const no = Number(noMeja);
  if (!Number.isInteger(no)) throw httpError(400, "No meja tidak valid.");
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const c = new sql.Request(transaction);
    c.input("no", sql.Int, no);
    const cur = await c.query(`SELECT NamaMeja FROM dbo.MstMesinSawmill WHERE NoMeja = @no`);
    if (!cur.recordset.length) throw httpError(404, "Mesin sawmill tidak ditemukan.");

    const req = new sql.Request(transaction);
    req.input("no", sql.Int, no);
    await req.query(`DELETE FROM dbo.MstMesinSawmill WHERE NoMeja = @no`);
    await audit(transaction, user, `Menghapus Data Master Mesin Sawmill ${cur.recordset[0].NamaMeja} (Web)`);
    await transaction.commit();
    return { noMeja: no };
  } catch (err) {
    try { await transaction.rollback(); } catch { /* ignore */ }
    // 547 = pelanggaran FK: sudah dipakai lembar tally sawmill
    if (err.number === 547 || err.originalError?.info?.number === 547) {
      throw httpError(
        409,
        "Mesin sawmill sudah dipakai pada transaksi dan tidak dapat dihapus. Ubah statusnya menjadi TIDAK AKTIF sebagai gantinya.",
      );
    }
    throw err;
  }
}

module.exports = { getAll, getOptions, create, update, remove };
