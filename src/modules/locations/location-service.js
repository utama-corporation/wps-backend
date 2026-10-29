const { sql, poolPromise } = require("../../core/config/db");

exports.getAllLokasi = async () => {
  const pool = await poolPromise; // ← gunakan poolPromise
  const request = pool.request();

  const query = `
    SELECT IdLokasi, Description, Blok, Enable
    FROM MstLokasi 
    WHERE Enable = 1
    ORDER BY Blok ASC, IdLokasi ASC
  `;

  const result = await request.query(query);
  return result.recordset;
};
