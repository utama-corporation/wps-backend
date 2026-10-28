const service = require("./label-list-service");

const fail = (res, err, label) => {
  console.error(`Error label-list ${label}:`, err);
  res.status(500).json({ success: false, message: "Terjadi kesalahan di server" });
};

exports.list = async (req, res) => {
  try {
    const data = await service.list(req.query);
    res.json({ success: true, data });
  } catch (err) {
    fail(res, err, "list");
  }
};

exports.options = async (_req, res) => {
  try {
    const data = await service.options();
    res.json({ success: true, data });
  } catch (err) {
    fail(res, err, "options");
  }
};

exports.listTemplates = async (req, res) => {
  try {
    const data = await service.listTemplates(req.idUsername);
    res.json({ success: true, data });
  } catch (err) {
    fail(res, err, "templates");
  }
};

// Validasi body template: nama wajib (maks 100), filters objek, columns array string.
const parseTemplateBody = (body) => {
  const { nama, filters, columns } = body || {};
  if (typeof nama !== "string" || !nama.trim() || nama.trim().length > 100) return null;
  if (!filters || typeof filters !== "object" || Array.isArray(filters)) return null;
  if (!Array.isArray(columns) || !columns.every((c) => typeof c === "string")) return null;
  return { nama: nama.trim(), filters, columns };
};

// Nama template unik per user (UQ_MstUserLabelListTemplate_User_Nama).
const isDuplicate = (err) => err && (err.number === 2627 || err.number === 2601);

exports.createTemplate = async (req, res) => {
  const body = parseTemplateBody(req.body);
  if (!body) return res.status(400).json({ success: false, message: "Data template tidak valid." });
  try {
    await service.createTemplate(req.idUsername, body);
    res.status(201).json({ success: true, message: "Template disimpan." });
  } catch (err) {
    if (isDuplicate(err)) {
      return res.status(409).json({ success: false, message: "Nama template sudah dipakai." });
    }
    fail(res, err, "createTemplate");
  }
};

exports.updateTemplate = async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const body = parseTemplateBody(req.body);
  if (!Number.isInteger(id) || !body) {
    return res.status(400).json({ success: false, message: "Data template tidak valid." });
  }
  try {
    const n = await service.updateTemplate(req.idUsername, id, body);
    if (!n) return res.status(404).json({ success: false, message: "Template tidak ditemukan." });
    res.json({ success: true, message: "Template diperbarui." });
  } catch (err) {
    if (isDuplicate(err)) {
      return res.status(409).json({ success: false, message: "Nama template sudah dipakai." });
    }
    fail(res, err, "updateTemplate");
  }
};

exports.removeTemplate = async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ success: false, message: "ID template tidak valid." });
  }
  try {
    const n = await service.removeTemplate(req.idUsername, id);
    if (!n) return res.status(404).json({ success: false, message: "Template tidak ditemukan." });
    res.json({ success: true, message: "Template dihapus." });
  } catch (err) {
    fail(res, err, "removeTemplate");
  }
};
