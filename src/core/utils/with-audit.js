const crypto = require("crypto");
const { sql, poolPromise } = require("../config/db");
const { auditStore } = require("./audit-context");

/**
 * Jalankan `fn(tx)` di dalam satu transaksi dengan SESSION_CONTEXT audit
 * (actor_id + request_id) yang dibaca trigger tr_Audit_*.
 *
 * - Context di-set pada koneksi yang SAMA dengan DML (satu transaksi).
 * - Context SELALU di-reset (NULL) sebelum commit/rollback, supaya tidak bocor
 *   ke request lain yang memakai koneksi pool yang sama.
 * - Semua DML di `fn` memakai `tx.request()`.
 *
 * @param {{ actorId?: string|number|null, requestId?: string }} ctx
 * @param {(tx: import("mssql").Transaction) => Promise<any>} fn
 */
async function withAudit(ctx, fn) {
  const pool = await poolPromise;
  const tx = new sql.Transaction(pool);
  const actorId =
    ctx && ctx.actorId !== undefined && ctx.actorId !== null
      ? String(ctx.actorId)
      : null;
  const requestId = (ctx && ctx.requestId) || crypto.randomUUID();

  await tx.begin();

  const resetContext = async () => {
    await tx
      .request()
      .query(
        `EXEC sp_set_session_context N'actor_id', NULL;
         EXEC sp_set_session_context N'request_id', NULL;`,
      );
  };

  try {
    await tx
      .request()
      .input("actorId", sql.VarChar(128), actorId)
      .input("requestId", sql.VarChar(64), requestId)
      .query(
        `EXEC sp_set_session_context N'actor_id', @actorId;
         EXEC sp_set_session_context N'request_id', @requestId;`,
      );

    const result = await fn(tx);
    await resetContext();
    await tx.commit();
    return result;
  } catch (err) {
    try {
      await resetContext();
    } catch (_) {
      /* koneksi mungkin sudah rusak, abaikan */
    }
    try {
      await tx.rollback();
    } catch (_) {
      /* transaksi sudah di-abort oleh server */
    }
    throw err;
  }
}

/** Ambil identitas actor dari request (diisi verify-token). */
function actorFromReq(req) {
  return {
    actorId: req.idUsername ?? req.username ?? null,
    // Samakan dengan request_id otomatis dari verify-token (db.js) bila ada.
    requestId: auditStore.getStore()?.requestId ?? crypto.randomUUID(),
  };
}

module.exports = { withAudit, actorFromReq };
