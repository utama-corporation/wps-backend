const jwt = require("jsonwebtoken");
const { sql, poolPromise } = require("../../core/config/db");
const authService = require("./auth-service");
const getUserPermissions = require("../../core/utils/get-user-permissions");

async function login(req, res) {
  const { username, password } = req.body;

  try {
    const user = await authService.verifyUser(username, password);
    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Username atau password salah",
      });
    }

    // dY"1 Ambil permission pakai helper (tanpa duplikasi query)
    const permissions = await getUserPermissions(user.IdUsername);

    // Ambil group/otoritas user
    let groupName = "User";
    try {
      const pool = await poolPromise;
      const groupResult = await pool.request()
        .input("idUsername", sql.Int, user.IdUsername)
        .query(`
          SELECT TOP 1 g.UGroupName
          FROM MstUserGroupMember m
          LEFT JOIN MstUserGroup g ON g.IdUGroup = m.IdUGroup
          WHERE m.IdUsername = @idUsername
        `);
      if (groupResult.recordset.length > 0 && groupResult.recordset[0].UGroupName) {
        groupName = groupResult.recordset[0].UGroupName;
      }
    } catch (e) {
      console.error("Error fetching user group:", e);
    }

    const token = jwt.sign(
      {
        idUsername: user.IdUsername,
        username: user.Username,
      },
      process.env.SECRET_KEY,
      { expiresIn: "12h" },
    );

    res.status(200).json({
      success: true,
      message: "Login berhasil",
      token,
      user: {
        idUsername: user.IdUsername,
        username: user.Username,
        fullName: `${user.FName ?? ""} ${user.LName ?? ""}`.trim(),
        permissions, // �o. ambil dari helper, bukan query ulang
        groupName,
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({
      success: false,
      message: "Terjadi kesalahan di server",
    });
  }
}

module.exports = { login };
