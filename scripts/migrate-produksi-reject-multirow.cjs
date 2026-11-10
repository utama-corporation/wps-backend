// Mengizinkan lebih dari satu baris reject per produksi (dulu PK NoProduksi saja).
// Idempoten: aman dijalankan ulang; hanya mengganti PK kolom tunggal menjadi komposit.
// Target default: WPS_TEST3. Untuk produksi (WPS): node scripts/migrate-produksi-reject-multirow.cjs WPS
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const sql = require('mssql');
const migration = fs.readFileSync(path.join(__dirname, '../src/modules/produksi/produksi-reject-multirow.sql'), 'utf8');

const TABLES = [
  'S4SProduksi_Reject', 'PackingProduksi_Reject', 'MouldingProduksi_Reject',
  'LaminatingProduksi_Reject', 'SandingProduksi_Reject',
  'CCAkhirProduksi_Reject', 'FJProduksi_Reject',
];
const EXPECTED_COLS = ['NoProduksi', 'Tebal', 'Lebar', 'Panjang', 'IdUOMTblLebar', 'IdUOMPanjang'];

const targets = process.argv.slice(2);
const databases = targets.length ? targets : ['WPS_TEST3'];

async function run() {
  for (const database of databases) {
    const pool = new sql.ConnectionPool({
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      server: process.env.DB_SERVER,
      port: parseInt(process.env.DB_PORT, 10),
      database,
      options: { encrypt: true, trustServerCertificate: true },
      connectionTimeout: 15000,
      requestTimeout: 60000,
    });
    try {
      await pool.connect();
      const db = await pool.request().query('SELECT DB_NAME() AS db');
      if (db.recordset[0].db.toUpperCase() !== database.toUpperCase()) {
        throw new Error(`Database tidak sesuai: koneksi ke ${db.recordset[0].db}, target ${database}.`);
      }
      await pool.request().batch(migration);
      for (const table of TABLES) {
        const pk = await pool.request().input('t', table).query(`
          SELECT c.name
          FROM sys.key_constraints kc
          JOIN sys.index_columns ic ON ic.object_id = kc.parent_object_id AND ic.index_id = kc.unique_index_id
          JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
          WHERE kc.type = 'PK' AND kc.parent_object_id = OBJECT_ID('dbo.' + @t)
          ORDER BY ic.key_ordinal
        `);
        const cols = pk.recordset.map((r) => r.name);
        if (cols.join() !== EXPECTED_COLS.join()) {
          throw new Error(`${table}: PK tidak sesuai (${cols.join(', ') || 'tidak ada PK'}).`);
        }
        const rows = await pool.request().query(`SELECT COUNT(*) AS Cnt FROM dbo.${table}`);
        console.log(`${database} ${table}: PK komposit OK (${rows.recordset[0].Cnt} baris utuh)`);
      }
      console.log(`${database}: selesai.`);
    } finally {
      await pool.close();
    }
  }
}

run().catch((error) => {
  console.error(`Migrasi gagal: ${error.message}`);
  process.exitCode = 1;
});
