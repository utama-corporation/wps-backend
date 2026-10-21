const { sql, poolPromise } = require("../../core/config/db");

/* ============================================================
 * Paritas desktop: FrmMstUkuranST.vb ("Data Master Ukuran ST")
 * MstUkuranST PK komposit: (IdJenisKayu, IdUOMTblLebar, Tebal, Lebar) — tanpa kolom Id otomatis.
 * IdUOMTblLebar: 1 = MM, 3 = Inchi (radio button desktop).
 * Update/hapus desktop: WHERE nilai lama (bukan id).
 * API: old key + nilai baru; RowNum (ROW_NUMBER) sebagai identitas baris read-only.
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

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
};

function validateValues(data) {
  const idJenisKayu = num(data?.idJenisKayu);
  const idUomTblLebar = num(data?.idUomTblLebar);
  const tebal = num(data?.tebal);
  const lebar = num(data?.lebar);
  if (!Number.isInteger(idJenisKayu)) throw httpError(400, "Jenis kayu harus dipilih.");
  if (!Number.isInteger(idUomTblLebar)) throw httpError(400, "UOM tebal-lebar harus dipilih (MM/Inchi).");
  if (Number.isNaN(tebal)) throw httpError(400, "Tebal harus angka.");
  if (Number.isNaN(lebar)) throw httpError(400, "Lebar harus angka.");
  return { idJenisKayu, idUomTblLebar, tebal, lebar, enable: data?.enable === undefined || data?.enable === null ? null : (data.enable === true || data.enable === 1 || data.enable === "1" || data.enable === "true" ? 1 : 0) };
}

function validateKey(data) {
  const k = validateValues(data);
  return { idJenisKayu: k.idJenisKayu, idUomTblLebar: k.idUomTblLebar, tebal: k.tebal, lebar: k.lebar };
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
    SELECT ROW_NUMBER() OVER (ORDER BY A.IdJenisKayu ASC, A.IdUOMTblLebar ASC, A.Tebal ASC, A.Lebar ASC) AS RowNum,
           A.IdJenisKayu, B.Jenis, A.IdUOMTblLebar, C.UOM,
           A.Tebal, A.Lebar, CAST(A.[Enable] AS bit) AS [Enable]
    FROM MstUkuranST A
    INNER JOIN MstJenisKayu B ON B.IdJenisKayu = A.IdJenisKayu
    INNER JOIN MstUOM C ON C.IdUOM = A.IdUOMTblLebar
    ORDER BY A.IdJenisKayu ASC, A.IdUOMTblLebar ASC, A.Tebal ASC, A.Lebar ASC
  `);
  return rs.recordset;
}

async function getLookups() {
  const pool = await poolPromise;
  const [jk, uom] = await Promise.all([
    pool.request().query(`SELECT IdJenisKayu, Jenis FROM MstJenisKayu ORDER BY Jenis ASC`),
    pool.request().query(`SELECT IdUOM, UOM FROM MstUOM ORDER BY IdUOM ASC`),
  ]);
  return { jenisKayu: jk.recordset, uom: uom.recordset };
}

async function create(data, user) {
  const v = validateValues(data);
  return withTx(async (tx) => {
    const dup = await new sql.Request(tx)
      .input("j", sql.Int, v.idJenisKayu)
      .input("u", sql.Int, v.idUomTblLebar)
      .input("t", sql.Float, v.tebal)
      .input("l", sql.Float, v.lebar)
      .query(`SELECT TOP 1 1 AS dup FROM MstUkuranST WHERE IdJenisKayu = @j AND IdUOMTblLebar = @u AND Tebal = @t AND Lebar = @l`);
    if (dup.recordset.length) throw httpError(409, "Ukuran ST untuk jenis kayu, UOM, tebal dan lebar tersebut sudah ada.");
    await new sql.Request(tx)
      .input("j", sql.Int, v.idJenisKayu)
      .input("u", sql.Int, v.idUomTblLebar)
      .input("t", sql.Float, v.tebal)
      .input("l", sql.Float, v.lebar)
      .input("e", sql.Bit, v.enable ?? 1)
      .query(`INSERT INTO MstUkuranST (IdJenisKayu, IdUOMTblLebar, Tebal, Lebar, [Enable]) VALUES (@j, @u, @t, @l, @e)`);
    await audit(tx, user, `Menyimpan Data Master Ukuran ST jenis ${v.idJenisKayu} ${v.tebal}x${v.lebar} (Web)`);
    return { idJenisKayu: v.idJenisKayu, idUomTblLebar: v.idUomTblLebar, tebal: v.tebal, lebar: v.lebar };
  });
}

async function update(body, user) {
  const oldKey = validateKey(body?.old || {});
  const v = validateValues(body?.new || body || {});
  return withTx(async (tx) => {
    const req = new sql.Request(tx)
      .input("oj", sql.Int, oldKey.idJenisKayu)
      .input("ou", sql.Int, oldKey.idUomTblLebar)
      .input("ot", sql.Float, oldKey.tebal)
      .input("ol", sql.Float, oldKey.lebar);
    let upd = req;
    if (v.enable === null) {
      upd = req
        .input("j", sql.Int, v.idJenisKayu)
        .input("u", sql.Int, v.idUomTblLebar)
        .input("t", sql.Float, v.tebal)
        .input("l", sql.Float, v.lebar)
        .query(`UPDATE MstUkuranST SET IdJenisKayu = @j, IdUOMTblLebar = @u, Tebal = @t, Lebar = @l
                WHERE IdJenisKayu = @oj AND IdUOMTblLebar = @ou AND Tebal = @ot AND Lebar = @ol`);
    } else {
      upd = req
        .input("j", sql.Int, v.idJenisKayu)
        .input("u", sql.Int, v.idUomTblLebar)
        .input("t", sql.Float, v.tebal)
        .input("l", sql.Float, v.lebar)
        .input("e", sql.Bit, v.enable)
        .query(`UPDATE MstUkuranST SET IdJenisKayu = @j, IdUOMTblLebar = @u, Tebal = @t, Lebar = @l, [Enable] = @e
                WHERE IdJenisKayu = @oj AND IdUOMTblLebar = @ou AND Tebal = @ot AND Lebar = @ol`);
    }
    const r = await upd;
    if (!r.rowsAffected[0]) throw httpError(404, "Ukuran ST tidak ditemukan (key lama tidak cocok).");
    await audit(tx, user, `Mengubah Data Master Ukuran ST jenis ${v.idJenisKayu} ${v.tebal}x${v.lebar} (Web)`);
    return { idJenisKayu: v.idJenisKayu, idUomTblLebar: v.idUomTblLebar, tebal: v.tebal, lebar: v.lebar };
  });
}

async function remove(body, user) {
  const k = validateKey(body || {});
  try {
    return await withTx(async (tx) => {
      const r = await new sql.Request(tx)
        .input("j", sql.Int, k.idJenisKayu)
        .input("u", sql.Int, k.idUomTblLebar)
        .input("t", sql.Float, k.tebal)
        .input("l", sql.Float, k.lebar)
        .query(`DELETE FROM MstUkuranST WHERE IdJenisKayu = @j AND IdUOMTblLebar = @u AND Tebal = @t AND Lebar = @l`);
      if (!r.rowsAffected[0]) throw httpError(404, "Ukuran ST tidak ditemukan.");
      await audit(tx, user, `Menghapus Data Master Ukuran ST jenis ${k.idJenisKayu} ${k.tebal}x${k.lebar} (Web)`);
      return { idJenisKayu: k.idJenisKayu, idUomTblLebar: k.idUomTblLebar, tebal: k.tebal, lebar: k.lebar };
    });
  } catch (err) {
    if (err.number === 547 || err.originalError?.info?.number === 547) {
      throw httpError(409, "Ukuran ST masih dipakai pada data lain dan tidak dapat dihapus. Ubah statusnya menjadi TIDAK AKTIF sebagai gantinya.");
    }
    throw err;
  }
}

module.exports = { getAll, getLookups, create, update, remove };
