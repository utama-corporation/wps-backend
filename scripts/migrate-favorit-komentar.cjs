// Menambah kolom opsional tanpa mengubah data favorit yang sudah ada.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const sql = require('mssql');
const migration = fs.readFileSync(path.join(__dirname, '../src/modules/favorit/favorit-komentar.sql'), 'utf8');
const databases = ['WPS', 'WPS_TEST3'];
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
      const before = await pool.request().query("SELECT DB_NAME() AS db, OBJECT_ID('dbo.MstUserFavorit', 'U') AS tableId");
      if (before.recordset[0].db.toUpperCase() !== database || !before.recordset[0].tableId) {
        throw new Error('Database tidak sesuai atau tabel dbo.MstUserFavorit tidak ditemukan.');
      }
      await pool.request().batch(migration);
      const result = await pool.request().query(`
        SELECT c.name, t.name AS type, c.max_length, c.is_nullable
        FROM sys.columns c JOIN sys.types t ON c.user_type_id = t.user_type_id
        WHERE c.object_id = OBJECT_ID('dbo.MstUserFavorit') AND c.name = 'Komentar';
      `);
      const column = result.recordset[0];
      if (!column || column.type !== 'nvarchar' || column.max_length !== 1000 || !column.is_nullable) {
        throw new Error('Kolom Komentar tidak sesuai NVARCHAR(500) NULL.');
      }
      await pool.request().query('SELECT TOP (0) Tipe, Kode, Urutan, Komentar FROM dbo.MstUserFavorit');
      console.log(`${database}: Komentar NVARCHAR(500) NULL terverifikasi; query favorit berhasil.`);
    } finally {
      await pool.close();
    }
  }
}
run().catch(error => {
  console.error(`Migrasi gagal: ${error.message}`);
  process.exitCode = 1;
});
