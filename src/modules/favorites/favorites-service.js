const { sql, poolPromise } = require('../../core/config/db');

const ensureTable = async (pool) => {
  await pool.request().query(`
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name = 'UserFavorites' AND xtype = 'U')
    CREATE TABLE UserFavorites (
      Username NVARCHAR(100) NOT NULL,
      MenuId INT NOT NULL,
      Note NVARCHAR(500) NULL,
      SortOrder INT NOT NULL CONSTRAINT DF_UserFavorites_SortOrder DEFAULT 0,
      CONSTRAINT PK_UserFavorites PRIMARY KEY (Username, MenuId)
    );
  `);
  await pool.request().query(`
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('UserFavorites') AND name = 'SortOrder')
    ALTER TABLE UserFavorites ADD SortOrder INT NOT NULL CONSTRAINT DF_UserFavorites_SortOrder2 DEFAULT 0;
  `);
};

const getFavoritesService = async (username) => {
  const pool = await poolPromise;
  await ensureTable(pool);

  const result = await pool.request()
    .input('username', sql.VarChar, username)
    .query(`
      SELECT MenuId, Note, SortOrder
      FROM UserFavorites
      WHERE Username = @username
      ORDER BY SortOrder, MenuId
    `);

  return result.recordset;
};

const saveFavoriteService = async (username, menuId, note, sortOrder) => {
  const pool = await poolPromise;
  await ensureTable(pool);

  const existing = await pool.request()
    .input('username', sql.VarChar, username)
    .input('menuId', sql.Int, menuId)
    .query(`SELECT SortOrder FROM UserFavorites WHERE Username = @username AND MenuId = @menuId`);

  const currentSort = existing.recordset.length
    ? existing.recordset[0].SortOrder
    : (sortOrder != null ? sortOrder : 0);

  await pool.request()
    .input('username', sql.VarChar, username)
    .input('menuId', sql.Int, menuId)
    .query(`DELETE FROM UserFavorites WHERE Username = @username AND MenuId = @menuId`);

  await pool.request()
    .input('username', sql.VarChar, username)
    .input('menuId', sql.Int, menuId)
    .input('note', sql.NVarChar, note || '')
    .input('sortOrder', sql.Int, sortOrder != null ? sortOrder : currentSort)
    .query(`
      INSERT INTO UserFavorites (Username, MenuId, Note, SortOrder)
      VALUES (@username, @menuId, @note, @sortOrder);
    `);
};

const deleteFavoriteService = async (username, menuId) => {
  const pool = await poolPromise;
  await ensureTable(pool);

  await pool.request()
    .input('username', sql.VarChar, username)
    .input('menuId', sql.Int, menuId)
    .query(`DELETE FROM UserFavorites WHERE Username = @username AND MenuId = @menuId`);
};

const updateFavoriteOrderService = async (username, items) => {
  const pool = await poolPromise;
  await ensureTable(pool);
  for (const item of items) {
    await pool.request()
      .input('username', sql.VarChar, username)
      .input('menuId', sql.Int, item.menuId)
      .input('sortOrder', sql.Int, item.sortOrder)
      .query(`UPDATE UserFavorites SET SortOrder = @sortOrder WHERE Username = @username AND MenuId = @menuId`);
  }
};

module.exports = { getFavoritesService, saveFavoriteService, deleteFavoriteService, updateFavoriteOrderService };
