// Menambah kolom stock opname kayu bulat (lihat stock-opname-kb.sql).
// Default hanya WPS_TEST3; berikan nama database lain lewat argumen untuk diterapkan di tempat lain.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const sql = require('mssql');
const migration = fs.readFileSync(path.join(__dirname, '../src/modules/stock-opname-web/stock-opname-kb.sql'), 'utf8');
const databases = process.argv.slice(2).length ? process.argv.slice(2) : ['WPS_TEST3'];
const expected = [
  ['dbo.StockOpnameKayuBulat', 'Pcs'],
  ['dbo.StockOpnameKayuBulat', 'BlkTepakai'],
  ['dbo.StockOpname_Hasil_d_KayuBulat', 'QtyFisik'],
  ['dbo.StockOpname_Hasil_d_KayuBulat', 'Remark'],
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
      requestTimeout: 30000,
    });
    try {
      await pool.connect();
      const before = await pool.request().query("SELECT DB_NAME() AS db, OBJECT_ID('dbo.StockOpnameKayuBulat', 'U') AS kb, OBJECT_ID('dbo.StockOpname_Hasil_d_KayuBulat', 'U') AS hasil");
      const row = before.recordset[0];
      if (row.db.toUpperCase() !== database.toUpperCase() || !row.kb || !row.hasil) {
        throw new Error('Database tidak sesuai atau tabel stock opname kayu bulat tidak ditemukan.');
      }
      await pool.request().batch(migration);
      for (const [table, column] of expected) {
        const result = await pool.request()
          .input('table', sql.VarChar, table)
          .input('column', sql.VarChar, column)
          .query("SELECT COL_LENGTH(@table, @column) AS len");
        if (!result.recordset[0].len) throw new Error(`Kolom ${column} di ${table} belum terbentuk.`);
      }
      console.log(`${database}: kolom Pcs, BlkTepakai, QtyFisik, Remark terverifikasi.`);
    } finally {
      await pool.close();
    }
  }
}
run().catch(error => {
  console.error(`Migrasi gagal: ${error.message}`);
  process.exitCode = 1;
});
