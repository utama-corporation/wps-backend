const sql = require('mssql');
const { poolPromise } = require('../../core/config/db');
const { badReq, notFound, conflict } = require('../../core/utils/http-error');
const { hashPassword } = require('../../core/utils/crypto-helper');

const DEFAULT_PAGE = 6;
const DEFAULT_GROUP = 35;
const EMPLOYEE_DBS = { as_gsu: 'AS_GSU', as_ru: 'AS_RU', as_uc_2017: 'AS_UC_2017' };
const clean = (v) => String(v ?? '').trim();
const toInt = (v) => { const n = Number.parseInt(v, 10); return Number.isNaN(n) ? 0 : n; };

async function listUsers() {
  const pool = await poolPromise;
  const result = await pool.request().input('DefaultPage', sql.Int, DEFAULT_PAGE).query(`SELECT IdUsername, Username, FName, LName, Nik, EmployeeID, CompanyID, [Status], IsEnable FROM dbo.MstUsername WHERE DefaultPage = @DefaultPage ORDER BY IdUsername ASC`);
  return (result.recordset || []).map((r) => ({ IdUsername: toInt(r.IdUsername), Username: clean(r.Username), FName: clean(r.FName), LName: clean(r.LName), Nik: clean(r.Nik), EmployeeID: r.EmployeeID == null ? '' : toInt(r.EmployeeID), CompanyID: clean(r.CompanyID), Status: clean(r.Status), IsEnable: r.IsEnable === true || r.IsEnable === 1 }));
}

async function searchEmployees(db, q) {
  const dbName = clean(db).toLowerCase();
  if (!EMPLOYEE_DBS[dbName]) throw badReq('Database karyawan tidak dikenal.');
  const pool = await poolPromise;
  const result = await pool.request().input('kw', sql.VarChar, `%${clean(q)}%`).query(`SELECT EmployeeID, EmployeeCode, FullName FROM [${dbName}].[dbo].[HRM_Employees] WHERE FullName LIKE @kw OR CAST(EmployeeID AS VARCHAR) LIKE @kw OR EmployeeCode LIKE @kw ORDER BY FullName ASC`);
  return (result.recordset || []).map((r) => ({ EmployeeID: toInt(r.EmployeeID), EmployeeCode: clean(r.EmployeeCode), FullName: clean(r.FullName), CompanyID: EMPLOYEE_DBS[dbName] }));
}

function normalize(body) {
  const fName = clean(body?.fName); const lName = clean(body?.lName); const username = clean(body?.username); const password = clean(body?.password); const nik = clean(body?.nik); const employeeId = toInt(body?.employeeId); const companyId = clean(body?.companyId).toUpperCase();
  if (!fName) throw badReq('Silahkan isi Nama Depan.'); if (!username) throw badReq('Silahkan isi Username.'); if (!password) throw badReq('Silahkan isi Password.'); if (!nik) throw badReq('NIK / Employee Code wajib diisi.'); if (!employeeId) throw badReq('Employee ID wajib diisi.'); if (!companyId) throw badReq('Pilih karyawan untuk menentukan perusahaan.');
  if (fName.length > 25 || lName.length > 25 || username.length > 25) throw badReq('Nama dan username maksimal 25 karakter.'); if (nik.length > 10) throw badReq('NIK maksimal 10 karakter.');
  if (!Object.values(EMPLOYEE_DBS).includes(companyId)) throw badReq('Perusahaan karyawan tidak valid.');
  return { fName, lName, username, password, nik, employeeId, companyId };
}

async function create(body) {
  const p = normalize(body); const hashed = hashPassword(p.password); if (!hashed) throw badReq('Gagal meng-hash password.'); const pool = await poolPromise; const tx = new sql.Transaction(pool); await tx.begin();
  try {
    const dup = await tx.request().input('Username', sql.VarChar, p.username).query('SELECT TOP 1 1 FROM dbo.MstUsername WITH (NOLOCK) WHERE Username = @Username');
    if (dup.recordset.length) throw conflict('Username sudah digunakan. Silahkan pilih username lain.');
    const dupNik = await tx.request().input('Nik', sql.VarChar, p.nik).query('SELECT TOP 1 1 FROM dbo.MstUsername WITH (NOLOCK) WHERE Nik = @Nik');
    if (dupNik.recordset.length) throw conflict('NIK / Employee Code ini sudah terdaftar sebagai user.');
    const next = await tx.request().query('SELECT ISNULL(MAX(IdUsername), 0) + 1 AS NextId FROM dbo.MstUsername'); const id = toInt(next.recordset[0]?.NextId) || 1;
    await tx.request().input('IdUsername', sql.Int, id).input('Username', sql.VarChar, p.username).input('FName', sql.VarChar, p.fName).input('LName', sql.VarChar, p.lName).input('Password', sql.VarChar, hashed).input('Nik', sql.VarChar, p.nik).input('EmployeeID', sql.Int, p.employeeId).input('CompanyID', sql.VarChar, p.companyId).query(`INSERT INTO dbo.MstUsername (IdUsername, Username, FName, LName, DefaultPage, [Password], [Status], IsEnable, Nik, EmployeeID, CompanyID) VALUES (@IdUsername, @Username, @FName, @LName, ${DEFAULT_PAGE}, @Password, 'OFFLINE', 1, @Nik, @EmployeeID, @CompanyID)`);
    await tx.request().input('IdUGroup', sql.Int, DEFAULT_GROUP).input('IdUsername', sql.Int, id).query('INSERT INTO dbo.MstUserGroupMember (IdUGroup, IdUsername) VALUES (@IdUGroup, @IdUsername)');
    await tx.commit(); return { IdUsername: id, Username: p.username, FName: p.fName, LName: p.lName, Nik: p.nik, EmployeeID: p.employeeId, CompanyID: p.companyId };
  } catch (e) { try { await tx.rollback(); } catch {} throw e; }
}

async function remove(value) { const id = toInt(value); if (!id) throw notFound('User SO tidak ditemukan.'); const pool = await poolPromise; const tx = new sql.Transaction(pool); await tx.begin(); try { const exists = await tx.request().input('IdUsername', sql.Int, id).input('DefaultPage', sql.Int, DEFAULT_PAGE).query('SELECT TOP 1 1 FROM dbo.MstUsername WHERE IdUsername = @IdUsername AND DefaultPage = @DefaultPage'); if (!exists.recordset.length) throw notFound('User SO tidak ditemukan.'); await tx.request().input('IdUsername', sql.Int, id).query('DELETE FROM dbo.MstUserGroupMember WHERE IdUsername = @IdUsername'); await tx.request().input('IdUsername', sql.Int, id).query('DELETE FROM dbo.MstUsername WHERE IdUsername = @IdUsername AND DefaultPage = 6'); await tx.commit(); } catch (e) { try { await tx.rollback(); } catch {} throw e; } }

async function update(body) {
  const id = toInt(body?.idUsername); const username = clean(body?.username); const fName = clean(body?.fName); const lName = clean(body?.lName); const nik = clean(body?.nik); const employeeId = toInt(body?.employeeId); const companyId = clean(body?.companyId).toUpperCase(); const resetPassword = body?.resetPassword === true;
  if (!id) throw notFound('User SO tidak ditemukan.'); if (!username) throw badReq('Username wajib diisi.'); if (!fName) throw badReq('Silahkan isi Nama Depan.'); if (!nik) throw badReq('NIK / Employee Code wajib diisi.'); if (!employeeId) throw badReq('Employee ID wajib diisi.'); if (!Object.values(EMPLOYEE_DBS).includes(companyId)) throw badReq('Perusahaan karyawan tidak valid.'); if (username.length > 25 || nik.length > 10) throw badReq('Username maksimal 25 karakter dan NIK maksimal 10 karakter.');
  const pool = await poolPromise; const tx = new sql.Transaction(pool); await tx.begin();
  try {
    const exists = await tx.request().input('IdUsername', sql.Int, id).input('DefaultPage', sql.Int, DEFAULT_PAGE).query('SELECT TOP 1 1 FROM dbo.MstUsername WHERE IdUsername = @IdUsername AND DefaultPage = @DefaultPage');
    if (!exists.recordset.length) throw notFound('User SO tidak ditemukan.');
    const dupUsername = await tx.request().input('Username', sql.VarChar, username).input('IdUsername', sql.Int, id).query('SELECT TOP 1 1 FROM dbo.MstUsername WITH (NOLOCK) WHERE Username = @Username AND IdUsername <> @IdUsername');
    if (dupUsername.recordset.length) throw conflict('Username sudah digunakan. Silahkan pilih username lain.');
    const dup = await tx.request().input('Nik', sql.VarChar, nik).input('IdUsername', sql.Int, id).query('SELECT TOP 1 1 FROM dbo.MstUsername WITH (NOLOCK) WHERE Nik = @Nik AND IdUsername <> @IdUsername');
    if (dup.recordset.length) throw conflict('NIK / Employee Code ini sudah terdaftar sebagai user.');
    const request = tx.request().input('Username', sql.VarChar, username).input('FName', sql.VarChar, fName).input('LName', sql.VarChar, lName).input('Nik', sql.VarChar, nik).input('EmployeeID', sql.Int, employeeId).input('CompanyID', sql.VarChar, companyId).input('IdUsername', sql.Int, id);
    let query = 'UPDATE dbo.MstUsername SET Username = @Username, FName = @FName, LName = @LName, Nik = @Nik, EmployeeID = @EmployeeID, CompanyID = @CompanyID';
    if (resetPassword) { const hashed = hashPassword('Utama1234'); if (!hashed) throw badReq('Gagal meng-hash password.'); request.input('Password', sql.VarChar, hashed); query += ', [Password] = @Password'; }
    await request.query(`${query} WHERE IdUsername = @IdUsername AND DefaultPage = ${DEFAULT_PAGE}`); await tx.commit();
    return { IdUsername: id, Username: username, FName: fName, LName: lName, Nik: nik, EmployeeID: employeeId, CompanyID: companyId };
  } catch (e) { try { await tx.rollback(); } catch {} throw e; }
}

module.exports = { listUsers, searchEmployees, create, update, remove };
