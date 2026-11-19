const auditService = require("./audit-service");

exports.getAuditList = async (req, res) => {
  try {
    const result = await auditService.getAuditList({
      page: req.query.page,
      limit: req.query.limit,
      q: req.query.q,
      tableName: req.query.tableName,
      action: req.query.action,
      actor: req.query.actor,
      requestId: req.query.requestId,
      dateFrom: req.query.dateFrom,
      dateTo: req.query.dateTo,
    });

    res.status(200).json({
      success: true,
      message: "Data audit berhasil diambil",
      page: result.page,
      limit: result.limit,
      total: result.total,
      totalPages: result.totalPages,
      data: result.data,
    });
  } catch (error) {
    console.error("Error getAuditList:", error);
    res.status(500).json({
      success: false,
      message: "Terjadi kesalahan di server",
    });
  }
};

exports.getAuditDetail = async (req, res) => {
  try {
    const auditId = Number.parseInt(req.params.auditId, 10);

    if (!Number.isInteger(auditId) || auditId <= 0) {
      return res.status(400).json({
        success: false,
        message: "AuditId tidak valid",
      });
    }

    const audit = await auditService.getAuditDetail(auditId);

    if (!audit) {
      return res.status(404).json({
        success: false,
        message: "Data audit tidak ditemukan",
      });
    }

    res.status(200).json({
      success: true,
      message: "Detail audit berhasil diambil",
      data: audit,
    });
  } catch (error) {
    console.error("Error getAuditDetail:", error);
    res.status(500).json({
      success: false,
      message: "Terjadi kesalahan di server",
    });
  }
};

exports.getAuditByPkValue = async (req, res) => {
  try {
    const pkValue = String(req.params.pkValue || "").trim();

    if (!pkValue) {
      return res.status(400).json({
        success: false,
        message: "PK value tidak valid",
      });
    }

    const result = await auditService.getAuditByPkValue({
      pkValue,
      page: req.query.page,
      limit: req.query.limit,
      tableName: req.query.tableName,
      action: req.query.action,
    });

    res.status(200).json({
      success: true,
      message: "Data audit berdasarkan PK berhasil diambil",
      page: result.page,
      limit: result.limit,
      total: result.total,
      totalPages: result.totalPages,
      data: result.data,
    });
  } catch (error) {
    console.error("Error getAuditByPkValue:", error);
    res.status(500).json({
      success: false,
      message: "Terjadi kesalahan di server",
    });
  }
};

/** Aktivitas terakhir pengguna yang sedang login (actor diambil dari token, bukan query). */
exports.getMyActivity = async (req, res) => {
  try {
    const data = await auditService.getMyActivity({
      idUsername: req.idUsername,
      username: req.username,
      limit: req.query.limit,
    });
    res.status(200).json({ success: true, data });
  } catch (error) {
    console.error("Error getMyActivity:", error);
    res.status(500).json({ success: false, message: "Terjadi kesalahan di server" });
  }
};
