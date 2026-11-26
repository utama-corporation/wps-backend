require('dotenv').config();
const sql = require('mssql');

const dbConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER,
  port: parseInt(process.env.DB_PORT, 10),
  database: process.env.DB_DATABASE,
  options: { encrypt: true, trustServerCertificate: true },
  pool: { max: 10, min: 0, idleTimeoutMillis: 30000 }
};

/**
 * Audit otomatis: setiap query TULIS (INSERT/UPDATE/DELETE/MERGE/EXEC) diawali
 * sp_set_session_context (actor_id + request_id) di batch yang SAMA, sehingga
 * trigger tr_Audit_* mencatat user sebenarnya, bukan login DB (sa).
 * Tanpa user (tidak ada konteks request) nilainya NULL -> menimpa sisa context
 * lama di koneksi pool, jadi tidak bocor antar request.
 */
const { auditStore } = require('../utils/audit-context');
const WRITE_RE = /\b(insert|update|delete|merge|exec|execute)\b/i;
const _query = sql.Request.prototype.query;
sql.Request.prototype.query = function (command, ...rest) {
  if (
    typeof command === 'string' &&
    WRITE_RE.test(command) &&
    !/sp_set_session_context/i.test(command) &&
    typeof rest[0] !== 'function'
  ) {
    const store = auditStore.getStore();
    this.replaceInput('__audit_actor', sql.VarChar(128), store?.actorId != null ? String(store.actorId) : null);
    this.replaceInput('__audit_rid', sql.VarChar(64), store?.requestId ?? null);
    command =
      "SET NOCOUNT ON; EXEC sp_set_session_context N'actor_id', @__audit_actor; " +
      "EXEC sp_set_session_context N'request_id', @__audit_rid; SET NOCOUNT OFF;\n" +
      command;
  }
  return _query.call(this, command, ...rest);
};

// 🔴 PENTING: poolPromise diekspor!
const poolPromise = new sql.ConnectionPool(dbConfig)
  .connect()
  .then(pool => {
    console.log('✅ Koneksi DB berhasil');
    return pool;
  })
  .catch(err => {
    console.error('❌ Koneksi DB gagal:', err.message);
    throw err;
  });

process.on('SIGINT', async () => {
  try {
    const pool = await poolPromise;
    await pool.close();
    console.log('🛑 Pool DB ditutup dengan aman');
    process.exit(0);
  } catch (err) {
    console.error('❌ Gagal menutup pool DB:', err.message);
    process.exit(1);
  }
});

module.exports = { sql, poolPromise };  // ⬅️ harus ada ini
