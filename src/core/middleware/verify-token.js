require("dotenv").config(); // Memuat file .env

const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { auditStore } = require("../utils/audit-context");
const secretKey = process.env.SECRET_KEY;

// Middleware untuk memverifikasi token dan mengekstrak data user
const verifyToken = (req, res, next) => {
  const token = req.header("Authorization")?.replace("Bearer ", "");

  if (!token) {
    return res.status(401).json({ message: "Access Denied, token required." });
  }

  try {
    // 🔹 Verifikasi dan decode token
    const decoded = jwt.verify(token, secretKey);

    // 🔹 Simpan info user ke request (biar bisa dipakai di controller)
    req.username = decoded.username; // misal "admin"
    req.idUsername = decoded.idUsername; // misal 5

    // Context audit untuk seluruh query tulis di request ini (lihat core/config/db.js)
    auditStore.run(
      {
        actorId: decoded.idUsername ?? decoded.username ?? null,
        requestId: crypto.randomUUID(),
      },
      next, // lanjut ke handler berikutnya
    );
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired token." });
  }
};

module.exports = verifyToken;
