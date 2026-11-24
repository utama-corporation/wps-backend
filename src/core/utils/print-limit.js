const { sql } = require("../config/db");
const { withAudit, actorFromReq } = require("./with-audit");

/** Batas cetak per label. Cetak ke-(MAX_PRINT+1) diblokir sampai di-reset. */
const MAX_PRINT = 2;

/** Nama tabel/kolom berasal dari konstanta kode (bukan input user). */
const ident = (s) => {
  if (!/^[A-Za-z0-9_]+$/.test(s)) throw new Error("Identifier tidak valid");
  return s;
};

function limitError() {
  const err = new Error(
    `Batas cetak ${MAX_PRINT}x sudah tercapai. Minta admin untuk mereset status cetak.`,
  );
  err.statusCode = 403;
  err.code = "PRINT_LIMIT";
  return err;
}

/**
 * Klaim 1 jatah cetak secara atomik (satu UPDATE bersyarat), tercatat di audit.
 * Dipanggil SEBELUM PDF dikirim. Lempar error 403 bila batas tercapai,
 * 404 bila label tidak ditemukan.
 */
async function claimPrint({ table, keyCol, no, req }) {
  const t = ident(table);
  const k = ident(keyCol);
  return withAudit(actorFromReq(req), async (tx) => {
    const r = await tx
      .request()
      .input("no", sql.VarChar(50), no)
      .input("max", sql.Int, MAX_PRINT).query(`
        UPDATE ${t}
        SET HasBeenPrinted = ISNULL(HasBeenPrinted, 0) + 1,
            LastPrintDate = GETDATE()
        WHERE ${k} = @no AND ISNULL(HasBeenPrinted, 0) < @max
      `);
    if (r.rowsAffected[0] > 0) return true;

    const exists = await tx
      .request()
      .input("no", sql.VarChar(50), no)
      .query(`SELECT 1 AS x FROM ${t} WHERE ${k} = @no`);
    if (exists.recordset.length === 0) {
      const err = new Error(`Label ${no} tidak ditemukan`);
      err.statusCode = 404;
      throw err;
    }
    throw limitError();
  });
}

/** Kembalikan jatah bila pembuatan PDF gagal setelah klaim. */
async function releasePrint({ table, keyCol, no, req }) {
  const t = ident(table);
  const k = ident(keyCol);
  return withAudit(actorFromReq(req), (tx) =>
    tx
      .request()
      .input("no", sql.VarChar(50), no)
      .query(
        `UPDATE ${t} SET HasBeenPrinted = HasBeenPrinted - 1
         WHERE ${k} = @no AND ISNULL(HasBeenPrinted, 0) > 0`,
      ),
  );
}

/** Reset HasBeenPrinted ke 0 (dan LastPrintDate NULL). */
async function resetPrint({ table, keyCol, no, req }) {
  const t = ident(table);
  const k = ident(keyCol);
  return withAudit(actorFromReq(req), async (tx) => {
    const r = await tx
      .request()
      .input("no", sql.VarChar(50), no)
      .query(
        `UPDATE ${t} SET HasBeenPrinted = 0, LastPrintDate = NULL WHERE ${k} = @no`,
      );
    return r.rowsAffected[0] > 0;
  });
}

/**
 * Handler Express PUT .../:param/print/reset.
 * Pasangkan dengan requirePermission("label_<x>:reset_print") di route.
 */
function resetPrintHandler({ table, keyCol, param, label }) {
  return async (req, res) => {
    try {
      const no = String(req.params[param] || "").trim();
      if (!no) {
        return res
          .status(400)
          .json({ success: false, message: `${param} wajib diisi` });
      }
      const ok = await resetPrint({ table, keyCol, no, req });
      if (!ok) {
        return res
          .status(404)
          .json({ success: false, message: `Label ${label} ${no} tidak ditemukan` });
      }
      return res.status(200).json({
        success: true,
        message: "Status cetak berhasil direset",
        data: { no },
      });
    } catch (err) {
      console.error(`${label} ResetPrint Error:`, err);
      return res.status(err.statusCode || 500).json({
        success: false,
        message: err.message || "Terjadi kesalahan server",
      });
    }
  };
}

module.exports = {
  MAX_PRINT,
  claimPrint,
  releasePrint,
  resetPrint,
  resetPrintHandler,
};
