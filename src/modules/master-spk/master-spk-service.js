const { sql, poolPromise } = require("../../core/config/db");

/* ============================================================
 * Paritas desktop: FrmMstSPK.vb
 * Master SPK — header MstSPK_h + detail per bagian:
 *   bj  → MstSPK_d            (Barang Jadi)
 *   s4s → MstSPK_dS4S         fj  → MstSPK_dFJ        mld → MstSPK_dMoulding
 *   lmt → MstSPK_dLaminating  cca → MstSPK_dCCA       sand → MstSPK_dSanding
 *   st  → MstSPK_dST          produk → MstSPK_dProdukSPK
 * Simpan/ubah menulis header + seluruh detail dalam satu transaksi (ubah = hapus lalu isi ulang, seperti VB).
 * NoSPK diinput manual (MstSPK_d.NoSPK hanya varchar(10)).
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
const isOn = (v) => v === true || v === 1;

/** Bagian detail yang memakai grade (kolom sama: Tebal, Lebar, Panjang, Pcs, M3, Ket). */
const GRADE_SECTIONS = {
  s4s: { table: "MstSPK_dS4S", label: "S4S", lock: "LockDimensionS4S", unlock: "UnlockGradeS4S" },
  fj: { table: "MstSPK_dFJ", label: "Finger Joint", lock: "LockDimensionFJ", unlock: "UnlockGradeFJ" },
  mld: { table: "MstSPK_dMoulding", label: "Moulding", lock: "LockDimensionMLD", unlock: "UnlockGradeMLD" },
  lmt: { table: "MstSPK_dLaminating", label: "Laminating", lock: "LockDimensionLMT", unlock: "UnlockGradeLMT" },
  cca: { table: "MstSPK_dCCA", label: "CC Akhir", lock: "LockDimensionCCA", unlock: "UnlockGradeCCA" },
  sand: { table: "MstSPK_dSanding", label: "Sanding", lock: "LockDimensionSAND", unlock: "UnlockGradeSAND" },
};
const LOCK_BJ = "LockDimensionBJ";
const LOCK_ST = "LockDimensionST";

/* ===================== VALIDASI ===================== */

const str = (v) => String(v ?? "").trim();
const num = (v) => {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
};

function posNum(v, label, row) {
  const n = num(v);
  if (!(n > 0)) throw httpError(400, `${label} harus lebih dari 0 (${row}).`);
  return n;
}

function posInt(v, label, row) {
  const n = num(v);
  if (!Number.isInteger(n) || n <= 0) throw httpError(400, `${label} harus bilangan bulat lebih dari 0 (${row}).`);
  return n;
}

function intId(v, label, row) {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw httpError(400, `${label} belum dipilih (${row}).`);
  return n;
}

function assertNoDup(keys, row) {
  const seen = new Set();
  for (const k of keys) {
    if (seen.has(k)) throw httpError(400, `Data duplikat pada ${row}.`);
    seen.add(k);
  }
}

const m3Of = (t, l, p, pcs) => Math.round(((t * l * p * pcs) / 1e9) * 10000) / 10000;

function validate(data) {
  const noSPK = str(data.noSPK);
  if (!noSPK) throw httpError(400, "No. SPK harus diisi.");
  if (noSPK.length > 10) throw httpError(400, "No. SPK maksimal 10 karakter.");
  if (!str(data.noContract)) throw httpError(400, "No. Contract harus diisi.");
  if (!str(data.tujuan)) throw httpError(400, "Tujuan harus diisi.");
  if (!/^\d{4}-\d{2}-\d{2}/.test(str(data.tanggal))) throw httpError(400, "Tanggal harus diisi.");
  const shipment = str(data.shipmentPlan);
  if (shipment && !/^\d{4}-\d{2}-\d{2}/.test(shipment)) throw httpError(400, "Shipment plan tidak valid.");

  const h = {
    noSPK,
    tanggal: str(data.tanggal).slice(0, 10),
    noContract: str(data.noContract).slice(0, 100),
    idBuyer: intId(data.idBuyer, "Buyer", "header"),
    tujuan: str(data.tujuan).slice(0, 35),
    enable: bit(data.enable),
    isTemp: bit(data.isTemp),
    shipmentPlan: shipment ? shipment.slice(0, 10) : null,
    flags: {},
  };

  const f = data.flags || {};
  for (const col of [LOCK_BJ, LOCK_ST]) h.flags[col] = bit(f[col]);
  for (const s of Object.values(GRADE_SECTIONS)) {
    h.flags[s.lock] = bit(f[s.lock]);
    h.flags[s.unlock] = bit(f[s.unlock]);
  }

  const d = data.details || {};

  h.bj = (d.bj || []).map((r, i) => {
    const row = `Barang Jadi baris ${i + 1}`;
    return {
      idBarangJadi: intId(r.idBarangJadi, "Barang jadi", row),
      idJenisKayu: intId(r.idJenisKayu, "Jenis kayu", row),
      tebal: posNum(r.tebal, "Tebal", row),
      lebar: posNum(r.lebar, "Lebar", row),
      panjang: posNum(r.panjang, "Panjang", row),
      bundle: posNum(r.bundle, "Bundle", row),
      pcsPerBundle: posInt(r.pcsPerBundle, "Pcs/bundle", row),
      keterangan: str(r.keterangan).slice(0, 50),
    };
  });
  assertNoDup(
    h.bj.map((r) => [r.idBarangJadi, r.idJenisKayu, r.tebal, r.lebar, r.panjang, r.pcsPerBundle].join("|")),
    "Barang Jadi",
  );

  for (const [key, s] of Object.entries(GRADE_SECTIONS)) {
    h[key] = (d[key] || []).map((r, i) => {
      const row = `${s.label} baris ${i + 1}`;
      const tebal = posNum(r.tebal, "Tebal", row);
      const lebar = posNum(r.lebar, "Lebar", row);
      const panjang = posNum(r.panjang, "Panjang", row);
      const pcs = posInt(r.pcs, "Pcs", row);
      const m3 = num(r.m3);
      return {
        idJenisKayu: intId(r.idJenisKayu, "Jenis kayu", row),
        idGrade: intId(r.idGrade, "Grade", row),
        tebal,
        lebar,
        panjang,
        pcs,
        m3: Number.isFinite(m3) && m3 >= 0 ? m3 : m3Of(tebal, lebar, panjang, pcs),
        ket: str(r.ket).slice(0, 50),
      };
    });
    // PK tabel: NoSPK + Tebal + Lebar + Panjang + IdJenisKayu
    assertNoDup(h[key].map((r) => [r.idJenisKayu, r.tebal, r.lebar, r.panjang].join("|")), s.label);
  }

  h.st = (d.st || []).map((r, i) => {
    const row = `ST baris ${i + 1}`;
    return {
      idJenisKayu: intId(r.idJenisKayu, "Jenis kayu", row),
      tebal: posNum(r.tebal, "Tebal", row),
      lebar: posNum(r.lebar, "Lebar", row),
      pcs: posNum(r.pcs, "Ton", row),
      ket: str(r.ket).slice(0, 50),
    };
  });
  // PK tabel: NoSPK + Tebal + IdJenisKayu
  assertNoDup(h.st.map((r) => [r.idJenisKayu, r.tebal].join("|")), "ST");

  h.produk = (d.produk || []).map((r, i) => {
    const row = `Produk baris ${i + 1}`;
    return {
      idProdukSPK: intId(r.idProdukSPK, "Produk", row),
      ton: posNum(r.ton, "Ton", row),
      isEnable: r.isEnable === undefined || r.isEnable === null ? 1 : bit(r.isEnable),
    };
  });
  assertNoDup(h.produk.map((r) => r.idProdukSPK), "Produk");

  return h;
}

/* ===================== READ ===================== */

async function getAll() {
  const pool = await poolPromise;
  const rs = await pool.request().query(`
    SELECT A.NoSPK, CONVERT(varchar(10), A.Tanggal, 23) AS Tanggal, A.NoContract, A.IdBuyer, B.Buyer,
           A.Tujuan, CAST(ISNULL(A.[Enable], 0) AS bit) AS [Enable], CAST(ISNULL(A.IsTempSPK, 0) AS bit) AS IsTempSPK,
           CONVERT(varchar(10), A.ShipmentPlan, 23) AS ShipmentPlan
    FROM MstSPK_h A
    LEFT JOIN MstBuyer B ON B.IdBuyer = A.IdBuyer
    ORDER BY A.Tanggal DESC, A.NoSPK DESC
  `);
  return rs.recordset;
}

async function getMasters() {
  const pool = await poolPromise;
  const q = (text) => pool.request().query(text);
  const [buyer, jenis, grade, bj, produk] = await Promise.all([
    q(`SELECT IdBuyer AS id, Buyer AS nama FROM MstBuyer ORDER BY Buyer ASC`),
    q(`SELECT IdJenisKayu AS id, Jenis AS nama FROM MstJenisKayu WHERE [Enable] = 1 ORDER BY Jenis ASC`),
    q(`SELECT IdGrade AS id, NamaGrade AS nama FROM MstGrade WHERE [Enable] = 1 ORDER BY NamaGrade ASC`),
    q(`SELECT IdBarangJadi AS id, NamaBarangJadi AS nama FROM MstBarangJadi WHERE [Enable] = 1 ORDER BY NamaBarangJadi ASC`),
    q(`SELECT IdProdukSPK AS id, NamaProduk AS nama FROM MstProdukSPK ORDER BY NamaProduk ASC`),
  ]);
  return {
    buyer: buyer.recordset,
    jenis_kayu: jenis.recordset,
    grade: grade.recordset,
    barang_jadi: bj.recordset,
    produk: produk.recordset,
  };
}

async function getByNo(no) {
  const pool = await poolPromise;
  const hdr = await pool
    .request()
    .input("no", sql.VarChar(20), no)
    .query(`
      SELECT A.NoSPK, CONVERT(varchar(10), A.Tanggal, 23) AS Tanggal, A.NoContract, A.IdBuyer, B.Buyer, A.Tujuan,
             CAST(ISNULL(A.[Enable], 0) AS bit) AS [Enable], CAST(ISNULL(A.IsTempSPK, 0) AS bit) AS IsTempSPK,
             CONVERT(varchar(10), A.ShipmentPlan, 23) AS ShipmentPlan,
             ${[LOCK_BJ, LOCK_ST, ...Object.values(GRADE_SECTIONS).flatMap((s) => [s.lock, s.unlock])]
               .map((c) => `CAST(ISNULL(A.${c}, 0) AS bit) AS ${c}`)
               .join(", ")}
      FROM MstSPK_h A
      LEFT JOIN MstBuyer B ON B.IdBuyer = A.IdBuyer
      WHERE A.NoSPK = @no
    `);
  const h = hdr.recordset[0];
  if (!h) return null;

  const run = (text) => pool.request().input("no", sql.VarChar(20), no).query(text);
  const gradeQueries = Object.entries(GRADE_SECTIONS).map(([key, s]) =>
    run(`
      SELECT A.IdJenisKayu, J.Jenis, A.IdGrade, G.NamaGrade AS Grade, A.Tebal, A.Lebar, A.Panjang, A.Pcs, A.M3, A.Ket
      FROM ${s.table} A
      LEFT JOIN MstJenisKayu J ON J.IdJenisKayu = A.IdJenisKayu
      LEFT JOIN MstGrade G ON G.IdGrade = A.IdGrade
      WHERE A.NoSPK = @no
      ORDER BY J.Jenis, A.Tebal, A.Lebar, A.Panjang
    `).then((r) => [key, r.recordset]),
  );
  const [bj, st, produk, ...grades] = await Promise.all([
    run(`
      SELECT A.IdBarangJadi, B.NamaBarangJadi AS BarangJadi, A.IdJenisKayu, C.Jenis, A.Tebal, A.Lebar, A.Panjang,
             A.Bundle, A.PcsPerBundle, A.Bundle * A.PcsPerBundle AS Pcs, A.Keterangan
      FROM MstSPK_d A
      LEFT JOIN MstBarangJadi B ON B.IdBarangJadi = A.IdBarangJadi
      LEFT JOIN MstJenisKayu C ON C.IdJenisKayu = A.IdJenisKayu
      WHERE A.NoSPK = @no
      ORDER BY B.NamaBarangJadi, C.Jenis, A.Tebal, A.Lebar, A.Panjang
    `).then((r) => r.recordset),
    run(`
      SELECT A.IdJenisKayu, J.Jenis, A.Tebal, A.Lebar, A.Pcs AS Ton, A.Ket
      FROM MstSPK_dST A
      LEFT JOIN MstJenisKayu J ON J.IdJenisKayu = A.IdJenisKayu
      WHERE A.NoSPK = @no
      ORDER BY J.Jenis, A.Tebal
    `).then((r) => r.recordset),
    run(`
      SELECT A.IdProdukSPK, P.NamaProduk AS Produk, A.Ton, CAST(ISNULL(A.IsEnable, 0) AS bit) AS IsEnable
      FROM MstSPK_dProdukSPK A
      LEFT JOIN MstProdukSPK P ON P.IdProdukSPK = A.IdProdukSPK
      WHERE A.NoSPK = @no
      ORDER BY P.NamaProduk
    `).then((r) => r.recordset),
    ...gradeQueries,
  ]);

  return { header: h, details: { bj, st, produk, ...Object.fromEntries(grades) } };
}

/* ===================== WRITE ===================== */

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

function mapFk(err, message) {
  if (err.number === 547 || err.originalError?.info?.number === 547) throw httpError(409, message);
  throw err;
}

const DETAIL_TABLES = [
  "MstSPK_d",
  "MstSPK_dST",
  "MstSPK_dProdukSPK",
  ...Object.values(GRADE_SECTIONS).map((s) => s.table),
];

async function insertDetails(tx, v) {
  const no = v.noSPK;
  const run = (text, bind) => {
    const r = new sql.Request(tx);
    r.input("no", sql.VarChar(20), no);
    bind(r);
    return r.query(text);
  };

  for (const r of v.bj) {
    await run(
      `INSERT INTO MstSPK_d (NoSPK, IdBarangJadi, IdJenisKayu, Tebal, Lebar, Panjang, Bundle, PcsPerBundle, Keterangan)
       VALUES (@no, @bj, @jk, @t, @l, @p, @bundle, @ppb, @ket)`,
      (q) => {
        q.input("bj", sql.Int, r.idBarangJadi);
        q.input("jk", sql.Int, r.idJenisKayu);
        q.input("t", sql.Float, r.tebal);
        q.input("l", sql.Float, r.lebar);
        q.input("p", sql.Float, r.panjang);
        q.input("bundle", sql.Float, r.bundle);
        q.input("ppb", sql.Int, r.pcsPerBundle);
        q.input("ket", sql.VarChar(50), r.keterangan);
      },
    );
  }

  for (const [key, s] of Object.entries(GRADE_SECTIONS)) {
    for (const r of v[key]) {
      await run(
        `INSERT INTO ${s.table} (NoSPK, IdJenisKayu, IdGrade, Tebal, Lebar, Panjang, Pcs, M3, Ket)
         VALUES (@no, @jk, @g, @t, @l, @p, @pcs, @m3, @ket)`,
        (q) => {
          q.input("jk", sql.Int, r.idJenisKayu);
          q.input("g", sql.Int, r.idGrade);
          q.input("t", sql.Float, r.tebal);
          q.input("l", sql.Float, r.lebar);
          q.input("p", sql.Float, r.panjang);
          q.input("pcs", sql.Int, r.pcs);
          q.input("m3", sql.Float, r.m3);
          q.input("ket", sql.VarChar(50), r.ket);
        },
      );
    }
  }

  for (const r of v.st) {
    await run(
      `INSERT INTO MstSPK_dST (NoSPK, IdJenisKayu, Tebal, Lebar, Pcs, Ket) VALUES (@no, @jk, @t, @l, @pcs, @ket)`,
      (q) => {
        q.input("jk", sql.Int, r.idJenisKayu);
        q.input("t", sql.Float, r.tebal);
        q.input("l", sql.Float, r.lebar);
        q.input("pcs", sql.Float, r.pcs);
        q.input("ket", sql.VarChar(50), r.ket);
      },
    );
  }

  for (const r of v.produk) {
    await run(
      `INSERT INTO MstSPK_dProdukSPK (NoSPK, IdProdukSPK, Ton, IsEnable) VALUES (@no, @prod, @ton, @en)`,
      (q) => {
        q.input("prod", sql.Int, r.idProdukSPK);
        q.input("ton", sql.Float, r.ton);
        q.input("en", sql.Bit, r.isEnable);
      },
    );
  }
}

function bindHeader(req, v) {
  req.input("no", sql.VarChar(20), v.noSPK);
  req.input("tanggal", sql.Date, v.tanggal);
  req.input("noContract", sql.VarChar(100), v.noContract);
  req.input("idBuyer", sql.Int, v.idBuyer);
  req.input("tujuan", sql.VarChar(35), v.tujuan);
  req.input("enable", sql.Bit, v.enable);
  req.input("isTemp", sql.Bit, v.isTemp);
  req.input("shipment", sql.Date, v.shipmentPlan);
  for (const [col, val] of Object.entries(v.flags)) req.input(col, sql.Bit, val);
}

async function assertRefs(tx, v) {
  const check = async (table, col, ids, label) => {
    const uniq = [...new Set(ids)];
    if (!uniq.length) return;
    const r = new sql.Request(tx);
    const rs = await r.query(`SELECT COUNT(*) AS n FROM ${table} WHERE ${col} IN (${uniq.join(",")})`);
    if (Number(rs.recordset[0].n) !== uniq.length) throw httpError(400, `${label} tidak ditemukan di master.`);
  };
  const all = (k) => Object.keys(GRADE_SECTIONS).flatMap((s) => v[s].map((r) => r[k]));
  await check("MstBuyer", "IdBuyer", [v.idBuyer], "Buyer");
  await check("MstJenisKayu", "IdJenisKayu", [...v.bj.map((r) => r.idJenisKayu), ...all("idJenisKayu"), ...v.st.map((r) => r.idJenisKayu)], "Jenis kayu");
  await check("MstGrade", "IdGrade", all("idGrade"), "Grade");
  await check("MstBarangJadi", "IdBarangJadi", v.bj.map((r) => r.idBarangJadi), "Barang jadi");
  await check("MstProdukSPK", "IdProdukSPK", v.produk.map((r) => r.idProdukSPK), "Produk");
}

async function create(data, user) {
  const v = validate(data);
  return withTx(async (tx) => {
    const dup = await new sql.Request(tx)
      .input("no", sql.VarChar(20), v.noSPK)
      .query(`SELECT 1 AS ok FROM MstSPK_h WITH (UPDLOCK, HOLDLOCK) WHERE NoSPK = @no`);
    if (dup.recordset.length) throw httpError(409, `No. SPK ${v.noSPK} sudah ada.`);
    await assertRefs(tx, v);

    const cols = Object.keys(v.flags);
    const req = new sql.Request(tx);
    bindHeader(req, v);
    await req.query(`
      INSERT INTO MstSPK_h (NoSPK, Tanggal, NoContract, IdBuyer, Tujuan, [Enable], IsTempSPK, ShipmentPlan, ${cols.join(", ")})
      VALUES (@no, @tanggal, @noContract, @idBuyer, @tujuan, @enable, @isTemp, @shipment, ${cols.map((c) => "@" + c).join(", ")})
    `);
    await insertDetails(tx, v);
    await audit(tx, user, `Menyimpan Data ${v.noSPK} Pada Master SPK (Web)`);
    return { noSPK: v.noSPK };
  });
}

async function update(no, data, user) {
  const v = validate({ ...data, noSPK: no });
  return withTx(async (tx) => {
    const cur = await new sql.Request(tx)
      .input("no", sql.VarChar(20), no)
      .query(`SELECT 1 AS ok FROM MstSPK_h WITH (UPDLOCK, HOLDLOCK) WHERE NoSPK = @no`);
    if (!cur.recordset.length) throw httpError(404, "SPK tidak ditemukan.");
    await assertRefs(tx, v);

    const req = new sql.Request(tx);
    bindHeader(req, v);
    await req.query(`
      UPDATE MstSPK_h SET
        Tanggal = @tanggal, NoContract = @noContract, IdBuyer = @idBuyer, Tujuan = @tujuan,
        [Enable] = @enable, IsTempSPK = @isTemp, ShipmentPlan = @shipment,
        ${Object.keys(v.flags).map((c) => `${c} = @${c}`).join(", ")}
      WHERE NoSPK = @no
    `);
    for (const table of DETAIL_TABLES) {
      await new sql.Request(tx).input("no", sql.VarChar(20), no).query(`DELETE FROM ${table} WHERE NoSPK = @no`);
    }
    await insertDetails(tx, v);
    await audit(tx, user, `Mengubah Data ${no} Pada Master SPK (Web)`);
    return { noSPK: no };
  });
}

async function remove(no, user) {
  try {
    return await withTx(async (tx) => {
      const cur = await new sql.Request(tx)
        .input("no", sql.VarChar(20), no)
        .query(`SELECT 1 AS ok FROM MstSPK_h WHERE NoSPK = @no`);
      if (!cur.recordset.length) throw httpError(404, "SPK tidak ditemukan.");
      for (const table of [...DETAIL_TABLES, "MstSPK_h"]) {
        await new sql.Request(tx).input("no", sql.VarChar(20), no).query(`DELETE FROM ${table} WHERE NoSPK = @no`);
      }
      await audit(tx, user, `Menghapus Data ${no} Pada Master SPK (Web)`);
      return { noSPK: no };
    });
  } catch (err) {
    return mapFk(
      err,
      `SPK ${no} sudah dipakai pada transaksi (produksi / reserve / penjualan) dan tidak dapat dihapus. Ubah statusnya menjadi TIDAK AKTIF sebagai gantinya.`,
    );
  }
}

module.exports = { getAll, getMasters, getByNo, create, update, remove, GRADE_SECTIONS };
