// Menambah kolom/tabel stock opname racipan detail (lihat stock-opname-racipan.sql).
// Default hanya WPS_TEST3; berikan nama database lain lewat argumen untuk diterapkan di tempat lain.
// Catatan: user aplikasi (biasanya) tidak punya CREATE TABLE — jika gagal dengan
// pesan permission, minta DBA menjalankan stock-opname-racipan.sql di SSMS, lalu
// jalankan ulang skrip ini untuk verifikasi.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const sql = require('mssql');
const migration = fs.readFileSync(path.join(__dirname, '../src/modules/stock-opname-web/stock-opname-racipan.sql'), 'utf8');
const databases = process.argv.slice(2).length ? process.argv.slice(2) : ['WPS_TEST3'];
const expected = [
  ['dbo.StockOpname_h', 'IsRacipan'],
  ['dbo.StockOpnameRacipan', 'AkhirJlhBtg'],
  ['dbo.StockOpnameRacipan', 'Akhir'],
  ['dbo.StockOpname_Hasil_d_Racipan', 'QtyFisik'],
  ['dbo.StockOpname_Hasil_d_Racipan', 'Remark'],
];
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
      const before = await pool.request().query("SELECT DB_NAME() AS db, OBJECT_ID('dbo.StockOpnameRacipan', 'U') AS racipan, OBJECT_ID('dbo.StockOpname_Hasil_d_Racipan', 'U') AS hasil");
      const row = before.recordset[0];
      if (row.db.toUpperCase() !== database.toUpperCase()) {
        throw new Error('Database tidak sesuai');
      }
      try {
        await pool.request().batch(migration);
      } catch (error) {
        console.warn(`${database}: penerapan SQL gagal (${error.message})`);
        console.warn(`${database}: minta DBA menjalankan src/modules/stock-opname-web/stock-opname-racipan.sql di SSMS, lalu ulangi skrip ini.`);
      }
      for (const [table, column] of expected) {
        const result = await pool.request()
          .input('table', sql.VarChar, table)
          .input('column', sql.VarChar, column)
          .query("SELECT COL_LENGTH(@table, @column) AS len");
        if (!result.recordset[0].len) throw new Error(`Kolom ${column} di ${table} belum terbentuk.`);
      }
      console.log(`${database}: IsRacipan, StockOpnameRacipan, StockOpname_Hasil_d_Racipan terverifikasi.`);
    } finally {
      await pool.close();
    }
  }
}
run().catch(error => {
  console.error(`Migrasi gagal: ${error.message}`);
  process.exitCode = 1;
});
