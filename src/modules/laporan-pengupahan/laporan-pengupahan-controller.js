const service = require("./laporan-pengupahan-service");
const report = require("./laporan-pengupahan-report");

const TGL_RE = /^\d{4}-\d{2}-\d{2}$/;
const tglValid = (s) => {
  if (typeof s !== "string" || !TGL_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};

const bad = (res, message) => res.status(400).json({ success: false, message });

function periode(req, res) {
  const awal = req.query?.start_date;
  const akhir = req.query?.end_date;
  if (!tglValid(awal) || !tglValid(akhir)) {
    bad(res, "Parameter start_date dan end_date wajib berformat YYYY-MM-DD.");
    return null;
  }
  if (awal > akhir) {
    bad(res, "Tanggal awal tidak boleh melebihi tanggal akhir.");
    return null;
  }
  return { awal, akhir };
}

exports.index = async (req, res) => {
  const p = periode(req, res);
  if (!p) return;
  try {
    res.json({ success: true, data: await service.getLaporan(p.awal, p.akhir) });
  } catch (err) {
    console.error("Error laporan pengupahan:", err);
    res.status(500).json({ success: false, message: "Terjadi kesalahan di server" });
  }
};

exports.pdf = async (req, res) => {
  const p = periode(req, res);
  if (!p) return;
  try {
    const { groups, grandTotal } = await service.getLaporan(p.awal, p.akhir);
    const pdf = await report.generate({
      awal: p.awal,
      akhir: p.akhir,
      groups,
      grandTotal,
      printedBy: req.username || "-",
    });
    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="RekapPengupahanStick_${p.awal}_${p.akhir}.pdf"`,
      "Content-Length": pdf.length,
    });
    return res.end(pdf);
  } catch (err) {
    console.error("Error laporan pengupahan pdf:", err);
    res.status(500).json({ success: false, message: "Gagal membuat laporan pengupahan" });
  }
};
