const svc = require('./stock-opname-web-service');
const create = require('./stock-opname-web-create-service');

function fail(res, error, ctx) {
  const statusCode = error.statusCode || 500;
  console.error(`Error ${ctx} StockOpname:`, error);
  return res.status(statusCode).json({
    success: false,
    message: statusCode === 500 ? 'Internal Server Error' : error.message,
    ...(statusCode === 500 ? { error: error.message } : {}),
  });
}

const handle = (ctx, fn) => async (req, res) => {
  try {
    const out = await fn(req);
    return res.status(200).json({ success: true, ...out });
  } catch (error) {
    return fail(res, error, ctx);
  }
};

exports.headers = handle('listing headers', async (req) => ({
  data: await svc.listHeaders(req.query.ascend === '1' || req.query.ascend === 'true'),
}));
exports.lokasi = handle('listing lokasi', async () => ({ data: await svc.getLokasi() }));
exports.summary = handle('summary', async (req) => ({ data: await svc.summary(req.params.noso) }));
exports.users = handle('listing users', async (req) => ({ data: await svc.listUsers(req.params.noso) }));
exports.stok = handle('listing stok', (req) => svc.listStok(req.params.noso, req.query));
exports.hasil = handle('listing hasil', (req) => svc.listHasil(req.params.noso, req.query));
exports.removeHasil = handle('deleting hasil', async (req) => ({
  message: 'Hasil scan berhasil dihapus',
  data: await svc.removeHasil(req.params.noso, req.query.label),
}));

exports.ascendFamilies = handle('ascend families', async (req) => ({
  data: await svc.ascendFamilies(req.params.noso),
}));
exports.ascendItems = handle('ascend items', async (req) => ({
  data: await svc.ascendItems(req.params.noso, req.query),
}));
exports.ascendUsage = handle('ascend usage', async (req) => ({
  data: await svc.ascendUsage(req.params.noso, req.query.itemId),
}));
exports.ascendSave = handle('ascend save', async (req) => ({
  message: 'Hasil opname berhasil disimpan',
  data: await svc.ascendSave(req.params.noso, req.body?.items),
}));
exports.ascendRemove = handle('ascend delete', async (req) => ({
  message: 'Hasil opname item berhasil dihapus',
  data: await svc.ascendRemove(req.params.noso, req.query.itemId),
}));

exports.ascendMeta = handle('ascend meta', async () => ({ data: await create.ascendMeta() }));
exports.ascendFamilyByCategory = handle('ascend family', async (req) => ({
  data: await create.ascendFamilyByCategory(req.query.categoryId),
}));
exports.create = async (req, res) => {
  try {
    const data = await create.create(req.body, req.username);
    return res.status(201).json({ success: true, message: 'Data Stock Opname berhasil disimpan', data });
  } catch (error) {
    return fail(res, error, 'creating');
  }
};
exports.laporanKayu = handle('laporan kayu', async (req) => {
  const header = await svc.getHeader(req.params.noso);
  const raw = String(req.query.jenis || '').trim();
  const list = !raw || raw.toLowerCase() === 'all' ? [] : raw.split(',').map((x) => x.trim().toUpperCase());
  return { data: await create.laporanKayu(String(header.NoSO).trim(), list) };
});
exports.laporanAscend = handle('laporan ascend', async (req) => {
  const header = await svc.getHeader(req.params.noso);
  return { data: await create.laporanAscend(String(header.NoSO).trim()) };
});

// Laporan Crystal Report (service .NET: E:/JOB/API/wps-crystal). Baru kategori yang sudah diuji.
const CRYSTAL_URL = (process.env.CRYSTAL_SO_URL || "http://127.0.0.1:5199").replace(/\/+$/, "");
const CRYSTAL_KEYS = ["s4s"];

exports.crystalPdf = async (req, res) => {
  try {
    const key = String(req.params.key || "").toLowerCase();
    if (!CRYSTAL_KEYS.includes(key)) {
      return res.status(404).json({ success: false, message: "Laporan Crystal untuk kategori ini belum tersedia" });
    }
    const header = await svc.getHeader(req.params.noso);
    const noso = String(header.NoSO).trim();
    const url = `${CRYSTAL_URL}/pdf/${key}?noso=${encodeURIComponent(noso)}&user=${encodeURIComponent(req.username || "")}`;

    let upstream;
    try {
      upstream = await fetch(url, {
        headers: { "X-Api-Key": process.env.CRYSTAL_SO_KEY || "" },
        signal: AbortSignal.timeout(120000),
      });
    } catch (e) {
      console.error("Crystal service tidak terjangkau:", e.message, "->", CRYSTAL_URL, e.cause?.code || e.cause?.message || "");
      return res.status(502).json({ success: false, message: "Service Crystal Report tidak aktif / tidak terjangkau" });
    }
    if (!upstream.ok) {
      const message = (await upstream.text().catch(() => "")).slice(0, 300) || `Gagal membuat laporan (${upstream.status})`;
      return res.status(upstream.status === 404 ? 404 : 502).json({ success: false, message });
    }
    const pdf = Buffer.from(await upstream.arrayBuffer());
    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="StockOpname_${key}_${noso}.pdf"`,
      "Content-Length": pdf.length,
    });
    return res.end(pdf);
  } catch (error) {
    return fail(res, error, "crystal pdf");
  }
};
