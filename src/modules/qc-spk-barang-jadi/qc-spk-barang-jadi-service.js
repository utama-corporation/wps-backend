const { sql, poolPromise } = require("../../core/config/db");
const { presignedUrl, removeObject } = require("../../core/utils/minio-client");

// ---------------------------------------------------------------------------
// Foto bundle: 3 slot per bidang, disimpan pada 3 kolom terpisah.
// Slot 1 memakai kolom tanpa sufiks (FotoTebal) supaya data sebelum upgrade
// tetap terbaca; slot 2 & 3 memakai FotoTebal2 / FotoTebal3, dst.
// ---------------------------------------------------------------------------
const MAX_PHOTOS = 3;
const PHOTO_FIELDS = ["fotoTebal", "fotoLebar", "fotoPanjang", "fotoBundle"];

// fotoTebal + slot 0 -> "FotoTebal"; slot 1 -> "FotoTebal2"; slot 2 -> "FotoTebal3"
function photoCol(field, slot) {
  const base = field[0].toUpperCase() + field.slice(1);
  return slot === 0 ? base : `${base}${slot + 1}`;
}

const photoCols = (field) =>
  Array.from({ length: MAX_PHOTOS }, (_, i) => photoCol(field, i));

// semua kolom foto, untuk dipakai di SELECT
const PHOTO_COLS_SQL = PHOTO_FIELDS.flatMap(photoCols).join(", ");

// slot foto yang terisi pada sebuah row DB -> [{ col, key }]
function photoSlots(row, field) {
  return photoCols(field)
    .map((col) => ({ col, key: row[col] || null }))
    .filter((s) => s.key);
}

// semua object key MinIO dari beberapa row DB
function collectKeys(rows, field) {
  return rows.flatMap((r) => photoSlots(r, field).map((s) => s.key));
}

// Bangun { fotoTebalUrls: [...], ... } dari row DB; object key -> presigned URL.
// `fotoTebalUrl` (scalar) juga dikirim untuk kompatibilitas app versi lama.
async function photoUrls(row) {
  const out = {};
  await Promise.all(
    PHOTO_FIELDS.map(async (field) => {
      const urls = await Promise.all(
        photoSlots(row, field).map((s) => presignedUrl(s.key))
      );
      out[`${field}Urls`] = urls;
      out[`${field}Url`] = urls[0] || null;
    })
  );
  return out;
}

/*
 * QC SPK Barang Jadi.
 *
 * SPK header  -> MstSPK_h  (Enable = 1)
 * SPK detail  -> MstSPK_d  (tidak punya kolom id; 1 baris diidentifikasi oleh
 *                tuple IdBarangJadi + IdJenisKayu + Tebal + Lebar + Panjang)
 * Hasil QC    -> QcSpkBarangJadi_d (lihat schema.sql)
 *
 * URL memakai `lineNo` 1-based = ROW_NUMBER() atas urutan deterministik di bawah.
 * `resolveLine()` menerjemahkan lineNo -> tuple identitas baris.
 */

// urutan deterministik untuk menghitung nomor baris — HARUS sama di semua query.
// NB: "LineNo" adalah reserved keyword T-SQL (SET LINENO), jadi kolomnya dinamai "LineNum".
const LINE_ORDER =
  "ROW_NUMBER() OVER (ORDER BY IdBarangJadi, IdJenisKayu, Tebal, Lebar, Panjang)";

const DEC = sql.Decimal(18, 2);

// ---------------------------------------------------------------------------
// LIST SPK (paginasi + search)
// ---------------------------------------------------------------------------
exports.getSpkHeaders = async ({ page = 1, pageSize = 20, q = "" } = {}) => {
  const pool = await poolPromise;
  const request = pool.request();

  const offset = (page - 1) * pageSize;
  request.input("pageSize", sql.Int, pageSize);
  request.input("offset", sql.Int, offset);

  const where = ["h.[Enable] = 1"];
  if (q) {
    request.input("q", sql.VarChar, `%${q}%`);
    where.push(
      "(h.NoSPK LIKE @q OR b.Buyer LIKE @q OR h.NoContract LIKE @q OR h.Tujuan LIKE @q)",
    );
  }
  const whereSql = where.join(" AND ");

  const countSql = `
    SELECT COUNT(1) AS total
    FROM MstSPK_h h
    LEFT JOIN MstBuyer b ON h.IdBuyer = b.IdBuyer
    WHERE ${whereSql};
  `;

  const dataSql = `
    SELECT
      h.NoSPK,
      CONVERT(varchar(10), h.Tanggal, 120) AS Tanggal,
      h.NoContract,
      h.IdBuyer,
      b.Buyer AS NamaBuyer,
      h.Tujuan,
      h.ShipmentPlan,
      (SELECT COUNT(1) FROM MstSPK_d d WHERE d.NoSPK = h.NoSPK) AS TotalLine,
      (
        SELECT
          bj.NamaBarangJadi AS namaBarangJadi,
          jk.Jenis          AS namaJenisKayu,
          d.Tebal AS tebal, d.Lebar AS lebar, d.Panjang AS panjang,
          d.Bundle AS bundle, d.PcsPerBundle AS pcsPerBundle
        FROM MstSPK_d d
        LEFT JOIN MstBarangJadi bj ON d.IdBarangJadi = bj.IdBarangJadi
        LEFT JOIN MstJenisKayu  jk ON d.IdJenisKayu  = jk.IdJenisKayu
        WHERE d.NoSPK = h.NoSPK
        ORDER BY d.IdBarangJadi, d.IdJenisKayu, d.Tebal, d.Lebar, d.Panjang
        FOR JSON PATH
      ) AS LinesJson
    FROM MstSPK_h h
    LEFT JOIN MstBuyer b ON h.IdBuyer = b.IdBuyer
    WHERE ${whereSql}
    ORDER BY h.Tanggal DESC, h.NoSPK DESC
    OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY;
  `;

  const [{ recordset: countRs }, { recordset }] = await Promise.all([
    request.query(countSql),
    request.query(dataSql),
  ]);

  const total = countRs?.[0]?.total ?? 0;
  const rows = recordset.map((r) => {
    let lines = [];
    try {
      lines = r.LinesJson ? JSON.parse(r.LinesJson) : [];
    } catch (_) {
      lines = [];
    }
    return {
      noSPK: r.NoSPK,
      tanggal: r.Tanggal,
      noContract: r.NoContract,
      idBuyer: r.IdBuyer,
      namaBuyer: r.NamaBuyer,
      tujuan: r.Tujuan,
      shipmentPlan: r.ShipmentPlan,
      totalLine: r.TotalLine,
      lines,
    };
  });

  return { rows, total };
};

// ---------------------------------------------------------------------------
// LIST baris SPK + progress QC
// ---------------------------------------------------------------------------
exports.getSpkLines = async (noSPK) => {
  const pool = await poolPromise;
  const req = pool.request();
  req.input("noSPK", sql.VarChar, noSPK);

  const rs = await req.query(`
    ;WITH d AS (
      SELECT
        ${LINE_ORDER} AS LineNum,
        IdBarangJadi, IdJenisKayu, Tebal, Lebar, Panjang, Bundle, PcsPerBundle, Keterangan
      FROM MstSPK_d
      WHERE NoSPK = @noSPK
    )
    SELECT
      d.LineNum,
      d.IdBarangJadi,
      bj.NamaBarangJadi,
      d.IdJenisKayu,
      jk.Jenis AS NamaJenisKayu,
      d.Tebal, d.Lebar, d.Panjang, d.Bundle, d.PcsPerBundle, d.Keterangan,
      ISNULL(q.QcCount, 0)    AS QcCount,
      ISNULL(q.QcPcsTotal, 0) AS QcPcsTotal
    FROM d
    LEFT JOIN MstBarangJadi bj ON d.IdBarangJadi = bj.IdBarangJadi
    LEFT JOIN MstJenisKayu  jk ON d.IdJenisKayu  = jk.IdJenisKayu
    OUTER APPLY (
      SELECT COUNT(1) AS QcCount, SUM(x.JumlahPcs) AS QcPcsTotal
      FROM QcSpkBarangJadi_d x
      WHERE x.NoSPK        = @noSPK
        AND x.IdBarangJadi = d.IdBarangJadi
        AND x.IdJenisKayu  = d.IdJenisKayu
        AND x.SpkTebal     = d.Tebal
        AND x.SpkLebar     = d.Lebar
        AND x.SpkPanjang   = d.Panjang
    ) q
    ORDER BY d.LineNum;
  `);

  return rs.recordset.map((r) => ({
    lineNo: r.LineNum,
    idBarangJadi: r.IdBarangJadi,
    namaBarangJadi: r.NamaBarangJadi,
    idJenisKayu: r.IdJenisKayu,
    namaJenisKayu: r.NamaJenisKayu,
    tebal: r.Tebal,
    lebar: r.Lebar,
    panjang: r.Panjang,
    bundle: r.Bundle,
    pcsPerBundle: r.PcsPerBundle,
    keterangan: r.Keterangan,
    qcCount: r.QcCount,
    qcPcsTotal: r.QcPcsTotal,
  }));
};

// ---------------------------------------------------------------------------
// resolve lineNo -> tuple identitas baris SPK
// ---------------------------------------------------------------------------
async function resolveLine(pool, noSPK, lineNo) {
  const req = pool.request();
  req.input("noSPK", sql.VarChar, noSPK);
  req.input("lineNo", sql.Int, lineNo);

  const rs = await req.query(`
    ;WITH d AS (
      SELECT
        ${LINE_ORDER} AS LineNum,
        IdBarangJadi, IdJenisKayu, Tebal, Lebar, Panjang, Bundle, PcsPerBundle
      FROM MstSPK_d
      WHERE NoSPK = @noSPK
    )
    SELECT TOP 1 * FROM d WHERE LineNum = @lineNo;
  `);

  const r = rs.recordset[0];
  if (!r) {
    const err = new Error(
      `Baris SPK lineNo=${lineNo} tidak ditemukan untuk NoSPK ${noSPK}.`,
    );
    err.code = "LINE_NOT_FOUND";
    throw err;
  }

  return {
    idBarangJadi: r.IdBarangJadi,
    idJenisKayu: r.IdJenisKayu,
    tebal: r.Tebal,
    lebar: r.Lebar,
    panjang: r.Panjang,
    bundle: r.Bundle,
    pcsPerBundle: r.PcsPerBundle,
  };
}

// bind tuple identitas (@noSPK, @idbj, @idjk, @t, @l, @p) ke sebuah request
function bindTuple(request, noSPK, line) {
  request.input("noSPK", sql.VarChar, noSPK);
  request.input("idbj", sql.Int, line.idBarangJadi);
  request.input("idjk", sql.Int, line.idJenisKayu);
  request.input("t", DEC, line.tebal);
  request.input("l", DEC, line.lebar);
  request.input("p", DEC, line.panjang);
}

const TUPLE_WHERE = `
  NoSPK = @noSPK AND IdBarangJadi = @idbj AND IdJenisKayu = @idjk
  AND SpkTebal = @t AND SpkLebar = @l AND SpkPanjang = @p
`;

// ---------------------------------------------------------------------------
// GET bundle QC untuk 1 baris SPK
// ---------------------------------------------------------------------------
exports.getBundles = async (noSPK, lineNo) => {
  const pool = await poolPromise;
  const line = await resolveLine(pool, noSPK, lineNo);

  const req = pool.request();
  bindTuple(req, noSPK, line);

  const rs = await req.query(`
    SELECT NoBundle, Tebal, Lebar, Panjang, JumlahPcs,
           ${PHOTO_COLS_SQL}
    FROM QcSpkBarangJadi_d
    WHERE ${TUPLE_WHERE}
    ORDER BY NoBundle;
  `);

  const items = await Promise.all(
    rs.recordset.map(async (r) => ({
      noBundle: r.NoBundle,
      tebal: r.Tebal,
      lebar: r.Lebar,
      panjang: r.Panjang,
      jumlahPcs: r.JumlahPcs,
      ...(await photoUrls(r)),
    })),
  );

  return { line: { lineNo: Number(lineNo), ...line }, items };
};

// ---------------------------------------------------------------------------
// SIMPAN bundle QC (default overwrite: hapus semua lalu insert ulang)
// ---------------------------------------------------------------------------
exports.saveBundles = async (
  noSPK,
  lineNo,
  items,
  { overwrite = true, createdBy = null } = {},
) => {
  const pool = await poolPromise;
  const line = await resolveLine(pool, noSPK, lineNo);

  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    if (overwrite) {
      const delReq = new sql.Request(tx);
      bindTuple(delReq, noSPK, line);
      await delReq.query(`DELETE FROM QcSpkBarangJadi_d WHERE ${TUPLE_WHERE};`);
    }

    let totalInserted = 0;
    if (items.length) {
      const insReq = new sql.Request(tx);
      bindTuple(insReq, noSPK, line);
      insReq.input("createdBy", sql.VarChar, createdBy);

      const valuesSql = [];
      items.forEach((it, idx) => {
        insReq.input(`nb_${idx}`, sql.Int, it.noBundle);
        insReq.input(`bt_${idx}`, DEC, it.tebal ?? null);
        insReq.input(`bl_${idx}`, DEC, it.lebar ?? null);
        insReq.input(`bp_${idx}`, DEC, it.panjang ?? null);
        insReq.input(`bj_${idx}`, sql.Int, it.jumlahPcs ?? null);
        valuesSql.push(
          `(@noSPK, @idbj, @idjk, @t, @l, @p, @nb_${idx}, @bt_${idx}, @bl_${idx}, @bp_${idx}, @bj_${idx}, @createdBy, GETDATE())`,
        );
      });

      await insReq.query(`
        INSERT INTO QcSpkBarangJadi_d
          (NoSPK, IdBarangJadi, IdJenisKayu, SpkTebal, SpkLebar, SpkPanjang,
           NoBundle, Tebal, Lebar, Panjang, JumlahPcs, CreatedBy, CreatedAt)
        VALUES ${valuesSql.join(",\n")};
      `);
      totalInserted = items.length;
    }

    await tx.commit();
    return { totalInserted, overwrite };
  } catch (e) {
    try {
      await tx.rollback();
    } catch (_) {}
    throw e;
  }
};

// ---------------------------------------------------------------------------
// SIMPAN 1 bundle QC (upsert) — save per bundle
// ---------------------------------------------------------------------------
exports.saveOneBundle = async (
  noSPK,
  lineNo,
  noBundle,
  data,
  photos = {},
  createdBy = null,
) => {
  const pool = await poolPromise;
  const line = await resolveLine(pool, noSPK, lineNo);

  // batas maksimal bundle = kolom Bundle di MstSPK_d untuk baris ini
  if (line.bundle && noBundle > line.bundle) {
    const err = new Error(
      `Melebihi batas maksimal ${line.bundle} bundle untuk baris SPK ini.`,
    );
    err.code = "BUNDLE_LIMIT";
    throw err;
  }

  const req = pool.request();
  bindTuple(req, noSPK, line);
  req.input("nb", sql.Int, noBundle);
  req.input("bt", DEC, data.tebal ?? null);
  req.input("bl", DEC, data.lebar ?? null);
  req.input("bp", DEC, data.panjang ?? null);
  req.input("bj", sql.Int, data.jumlahPcs ?? null);
  req.input("createdBy", sql.VarChar, createdBy);

  // hanya kolom foto yang punya file baru yang di-set
  const setPhoto = [];
  const insCols = [];
  const insVals = [];

  // Foto baru MENGISI slot kosong pertama pada field-nya; foto lama tidak
  // ditimpa (frontend hanya mengirim foto yang baru diambil).
  const pending = PHOTO_FIELDS.map((field) => ({
    field,
    keys: (photos[field] || []).filter(Boolean),
  })).filter((p) => p.keys.length);

  if (pending.length) {
    const cur = await req.query(`
      SELECT ${PHOTO_COLS_SQL}
      FROM QcSpkBarangjadi_d
      WHERE ${TUPLE_WHERE} AND NoBundle = @nb;
    `);
    const row = cur.recordset[0] || {};

    for (const { field, keys } of pending) {
      const free = photoCols(field).filter((col) => !row[col]);
      if (keys.length > free.length) {
        // file yang tidak kebagian slot dibuang agar tidak jadi sampah di MinIO
        keys.slice(free.length).forEach((k) => {
          removeObject(k).catch(() => {});
        });
        const err = new Error(
          `Maksimal ${MAX_PHOTOS} foto untuk ${field}; hanya ada ${free.length} slot kosong.`
        );
        err.code = "PHOTO_LIMIT";
        throw err;
      }

      keys.forEach((key, i) => {
        const param = `${field}_${i}`;
        const col = free[i];
        req.input(param, sql.VarChar, key);
        setPhoto.push(`${col} = @${param}`);
        insCols.push(col);
        insVals.push(`@${param}`);
      });
    }
  }

  const chk = await req.query(
    `SELECT 1 AS x FROM QcSpkBarangJadi_d WHERE ${TUPLE_WHERE} AND NoBundle = @nb;`,
  );

  if (chk.recordset.length) {
    await req.query(`
      UPDATE QcSpkBarangJadi_d
      SET Tebal = @bt, Lebar = @bl, Panjang = @bp, JumlahPcs = @bj,
          UpdatedAt = GETDATE()${setPhoto.length ? ", " + setPhoto.join(", ") : ""}
      WHERE ${TUPLE_WHERE} AND NoBundle = @nb;
    `);
  } else {
    await req.query(`
      INSERT INTO QcSpkBarangJadi_d
        (NoSPK, IdBarangJadi, IdJenisKayu, SpkTebal, SpkLebar, SpkPanjang,
         NoBundle, Tebal, Lebar, Panjang, JumlahPcs, CreatedBy, CreatedAt${
           insCols.length ? ", " + insCols.join(", ") : ""
         })
      VALUES
        (@noSPK, @idbj, @idjk, @t, @l, @p, @nb, @bt, @bl, @bp, @bj, @createdBy, GETDATE()${
          insVals.length ? ", " + insVals.join(", ") : ""
        });
    `);
  }

  // ambil row terkini untuk response (termasuk URL foto)
  const selReq = pool.request();
  bindTuple(selReq, noSPK, line);
  selReq.input("nb", sql.Int, noBundle);
  const rs = await selReq.query(`
    SELECT NoBundle, Tebal, Lebar, Panjang, JumlahPcs,
           ${PHOTO_COLS_SQL}
    FROM QcSpkBarangJadi_d
    WHERE ${TUPLE_WHERE} AND NoBundle = @nb;
  `);
  const r = rs.recordset[0] || {};
  return {
    noBundle,
    tebal: r.Tebal ?? data.tebal ?? null,
    lebar: r.Lebar ?? data.lebar ?? null,
    panjang: r.Panjang ?? data.panjang ?? null,
    jumlahPcs: r.JumlahPcs ?? data.jumlahPcs ?? null,
    ...(await photoUrls(r)),
  };
};

// ---------------------------------------------------------------------------
// HAPUS foto dari 1 bundle.
// index = posisi foto pada daftar hasil field tersebut (slot kosong dilewati).
// null / < 0 => hapus SEMUA foto pada field itu (perilaku lama).
// ---------------------------------------------------------------------------
exports.deleteOnePhoto = async (noSPK, lineNo, noBundle, field, index = null) => {
  if (!PHOTO_FIELDS.includes(field)) {
    const err = new Error(`Field foto tidak valid: ${field}`);
    err.code = "BAD_FIELD";
    throw err;
  }

  const pool = await poolPromise;
  const line = await resolveLine(pool, noSPK, lineNo);

  const req = pool.request();
  bindTuple(req, noSPK, line);
  req.input("nb", sql.Int, noBundle);

  const cur = await req.query(
    `SELECT ${photoCols(field).join(", ")} FROM QcSpkBarangJadi_d
     WHERE ${TUPLE_WHERE} AND NoBundle = @nb;`
  );
  const row = cur.recordset[0] || {};

  const filled = photoSlots(row, field);
  const targets =
    index === null || index < 0
      ? filled
      : index < filled.length
        ? [filled[index]]
        : null;

  if (!targets || !targets.length) {
    const err = new Error(
      `Foto ${field} indeks ${index} tidak ada pada bundle #${noBundle}.`
    );
    err.code = "PHOTO_NOT_FOUND";
    throw err;
  }

  for (const t of targets) {
    await req.query(
      `UPDATE QcSpkBarangjadi_d SET ${t.col} = NULL, UpdatedAt = GETDATE()
       WHERE ${TUPLE_WHERE} AND NoBundle = @nb;`
    );
    await removeObject(t.key);
  }

  const selReq = pool.request();
  bindTuple(selReq, noSPK, line);
  selReq.input("nb", sql.Int, noBundle);
  const rs = await selReq.query(`
    SELECT NoBundle, Tebal, Lebar, Panjang, JumlahPcs,
           ${PHOTO_COLS_SQL}
    FROM QcSpkBarangjadi_d
    WHERE ${TUPLE_WHERE} AND NoBundle = @nb;
  `);
  const r = rs.recordset[0] || {};
  return {
    noBundle,
    tebal: r.Tebal ?? null,
    lebar: r.Lebar ?? null,
    panjang: r.Panjang ?? null,
    jumlahPcs: r.JumlahPcs ?? null,
    ...(await photoUrls(r)),
  };
};

// ---------------------------------------------------------------------------
// HAPUS semua bundle QC untuk 1 baris SPK
// ---------------------------------------------------------------------------
exports.deleteBundles = async (noSPK, lineNo) => {
  const pool = await poolPromise;
  const line = await resolveLine(pool, noSPK, lineNo);

  const req = pool.request();
  bindTuple(req, noSPK, line);

  // kumpulkan object key foto lebih dulu untuk dibersihkan dari MinIO
  const keysRs = await req.query(`
    SELECT ${PHOTO_COLS_SQL}
    FROM QcSpkBarangJadi_d WHERE ${TUPLE_WHERE};
  `);

  const delReq = pool.request();
  bindTuple(delReq, noSPK, line);
  const r = await delReq.query(
    `DELETE FROM QcSpkBarangjadi_d WHERE ${TUPLE_WHERE};`,
  );

  const keys = PHOTO_FIELDS.flatMap((f) => collectKeys(keysRs.recordset, f));
  await Promise.all(keys.map((k) => removeObject(k)));

  return { deleted: r.rowsAffected?.[0] ?? 0 };
};

// ---------------------------------------------------------------------------
// HAPUS 1 bundle QC (beserta foto MinIO)
// ---------------------------------------------------------------------------
exports.deleteOneBundle = async (noSPK, lineNo, noBundle) => {
  const pool = await poolPromise;
  const line = await resolveLine(pool, noSPK, lineNo);

  const req = pool.request();
  bindTuple(req, noSPK, line);
  req.input("nb", sql.Int, noBundle);

  // kumpulkan object key foto lebih dulu untuk dibersihkan dari MinIO
  const keysRs = await req.query(`
    SELECT ${PHOTO_COLS_SQL}
    FROM QcSpkBarangjadi_d
    WHERE ${TUPLE_WHERE} AND NoBundle = @nb;
  `);

  const delReq = pool.request();
  bindTuple(delReq, noSPK, line);
  delReq.input("nb", sql.Int, noBundle);
  const r = await delReq.query(
    `DELETE FROM QcSpkBarangjadi_d WHERE ${TUPLE_WHERE} AND NoBundle = @nb;`,
  );

  const keys = PHOTO_FIELDS.flatMap((f) => collectKeys(keysRs.recordset, f));
  await Promise.all(keys.map((k) => removeObject(k)));

  return { deleted: r.rowsAffected?.[0] ?? 0 };
};
