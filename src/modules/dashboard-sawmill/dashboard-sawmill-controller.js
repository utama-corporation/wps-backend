const service = require("./dashboard-sawmill-service");

const TGL_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAKS_HARI_RENDEMEN = 366;

const tglValid = (s) => {
  if (typeof s !== "string" || !TGL_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};

const bad = (res, message) => res.status(400).json({ success: false, message });

const fail = (res, err, label) => {
  console.error(`Error dashboard sawmill ${label}:`, err);
  res.status(500).json({ success: false, message: "Terjadi kesalahan di server" });
};

const perTanggal = (label, fn) => async (req, res) => {
  const { tgl } = req.query;
  if (!tglValid(tgl)) return bad(res, "Parameter tgl harus berformat YYYY-MM-DD.");
  try {
    res.json({ success: true, data: await fn(tgl) });
  } catch (err) {
    fail(res, err, label);
  }
};

exports.vacuum = perTanggal("vacuum", service.vacuum);
exports.produktivitasSlp = perTanggal("produktivitas-slp", service.produktivitasSlp);
exports.produktivitasBansaw = perTanggal("produktivitas-bansaw", service.produktivitasBansaw);

exports.kd = perTanggal("kd", service.kd);
exports.saldoKb = perTanggal("saldo-kb", service.saldoKb);

const kelompokDari = (req) => {
  const k = String(req.query.kelompok || "").toUpperCase();
  return k === "SLP" || k === "BANSAW" ? k : null;
};

exports.rendemenDaftar = async (req, res) => {
  const kelompok = kelompokDari(req);
  if (!kelompok) return bad(res, "Parameter kelompok harus SLP atau BANSAW.");
  const { to } = req.query;
  if (!tglValid(to)) return bad(res, "Parameter to harus berformat YYYY-MM-DD.");
  try {
    res.json({ success: true, data: await service.rendemenDaftar(kelompok, to) });
  } catch (err) {
    fail(res, err, "rendemen-daftar");
  }
};

exports.bahanBaku = async (req, res) => {
  const { awal, akhir } = req.query;
  if (!tglValid(awal) || !tglValid(akhir)) {
    return bad(res, "Parameter awal/akhir harus berformat YYYY-MM-DD.");
  }
  if (awal > akhir) return bad(res, "Tanggal awal tidak boleh melebihi tanggal akhir.");
  try {
    res.json({ success: true, data: await service.bahanBaku(awal, akhir) });
  } catch (err) {
    fail(res, err, "bahan-baku");
  }
};

exports.rendemen = async (req, res) => {
  const { from, to } = req.query;
  const kelompok = String(req.query.kelompok || "").toUpperCase();
  if (kelompok !== "SLP" && kelompok !== "BANSAW") {
    return bad(res, "Parameter kelompok harus SLP atau BANSAW.");
  }
  if (!tglValid(from) || !tglValid(to)) {
    return bad(res, "Parameter from/to harus berformat YYYY-MM-DD.");
  }
  if (from > to) return bad(res, "Tanggal awal tidak boleh melebihi tanggal akhir.");
  const hari = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000;
  if (hari > MAKS_HARI_RENDEMEN) return bad(res, `Rentang maksimal ${MAKS_HARI_RENDEMEN} hari.`);
  try {
    res.json({ success: true, data: await service.rendemen(kelompok, from, to) });
  } catch (err) {
    fail(res, err, "rendemen");
  }
};
