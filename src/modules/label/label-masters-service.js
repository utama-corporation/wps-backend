const { poolPromise } = require("../../core/config/db");

/**
 * Data combo untuk dialog Ubah label produk (S4S / FJ / Moulding).
 * Grade difilter per jenis kayu lewat MstGrade_d dengan Category sesuai modul
 * (paritas MasterApi.getGradeList tablet).
 */
async function getMasters(gradeCategory) {
  const pool = await poolPromise;
  const [jenisKayu, grade, orgTelly, spk, lokasi] = await Promise.all([
    pool.request().query(`
      SELECT IdJenisKayu, Jenis
      FROM MstJenisKayu
      WHERE [Enable] = 1 AND IsInternal = 1 AND IsNonST = 1
      ORDER BY Jenis
    `),
    pool.request().input("category", gradeCategory).query(`
      SELECT DISTINCT b.IdJenisKayu, c.IdGrade, c.NamaGrade
      FROM MstGrade_d b
      INNER JOIN MstGrade c ON c.IdGrade = b.IdGrade
      WHERE c.[Enable] = 1 AND b.Category = @category
      ORDER BY b.IdJenisKayu, c.NamaGrade
    `),
    pool.request().query(`
      SELECT IdOrgTelly, NamaOrgTelly FROM MstOrgTelly ORDER BY NamaOrgTelly
    `),
    pool.request().query(`
      SELECT NoSPK FROM MstSPK_h WHERE [Enable] = 1 ORDER BY NoSPK
    `),
    pool.request().query(`
      SELECT CAST(IdLokasi AS VARCHAR(50)) AS IdLokasi
      FROM MstLokasi
      WHERE [Enable] = 1
      ORDER BY IdLokasi
    `),
  ]);

  return {
    jenisKayu: jenisKayu.recordset,
    grade: grade.recordset,
    orgTelly: orgTelly.recordset,
    spk: spk.recordset,
    lokasi: lokasi.recordset,
  };
}

/** Handler Express: GET /label/<modul>/masters. */
function mastersHandler(gradeCategory, logTag) {
  return async (req, res) => {
    try {
      const data = await getMasters(gradeCategory);
      return res.status(200).json({
        success: true,
        message: "Data master label berhasil diambil",
        data,
      });
    } catch (err) {
      console.error(`${logTag} Masters Error:`, err);
      return res.status(500).json({
        success: false,
        message: err.message || "Terjadi kesalahan server",
      });
    }
  };
}

module.exports = { getMasters, mastersHandler };
