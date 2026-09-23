const service = require('./qc-spk-barang-jadi-service');

// GET /api/qc-spk-bj  — daftar SPK (paginasi + search)
exports.getSpkHeaders = async (req, res) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const rawSize = parseInt(req.query.pageSize, 10) || 20;
  const pageSize = Math.min(Math.max(rawSize, 1), 200);
  const q = (req.query.q || '').trim();

  try {
    const { rows, total } = await service.getSpkHeaders({ page, pageSize, q });
    const totalPages = Math.max(Math.ceil(total / pageSize), 1);

    return res.status(200).json({
      success: true,
      message: 'Data SPK Barang Jadi',
      meta: {
        page,
        pageSize,
        total,
        totalPages,
        hasPrev: page > 1,
        hasNext: page < totalPages,
      },
      data: rows,
    });
  } catch (err) {
    console.error('Error fetching SPK headers:', err);
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan di server' });
  }
};

// GET /api/qc-spk-bj/:noSPK/lines — baris detail SPK + progress QC
exports.getSpkLines = async (req, res) => {
  const noSPK = (req.params.noSPK || '').trim();
  if (!noSPK) {
    return res.status(400).json({ success: false, message: 'Parameter noSPK wajib diisi.' });
  }

  try {
    const rows = await service.getSpkLines(noSPK);
    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'Baris SPK tidak ditemukan.' });
    }
    return res.status(200).json({
      success: true,
      message: 'Detail baris SPK',
      total: rows.length,
      data: rows,
    });
  } catch (err) {
    console.error('Error fetching SPK lines:', err);
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan di server' });
  }
};

function parseParams(req) {
  const noSPK = (req.params.noSPK || '').trim();
  const lineNo = parseInt(req.params.lineNo, 10);
  const ok = !!noSPK && Number.isInteger(lineNo) && lineNo >= 1;
  return { noSPK, lineNo, ok };
}

// GET /api/qc-spk-bj/:noSPK/lines/:lineNo/bundles
exports.getBundles = async (req, res) => {
  const { noSPK, lineNo, ok } = parseParams(req);
  if (!ok) {
    return res.status(400).json({ success: false, message: 'Parameter tidak valid.' });
  }

  try {
    const { line, items } = await service.getBundles(noSPK, lineNo);
    return res.status(200).json({
      success: true,
      message: 'Data QC bundle',
      line,
      total: items.length,
      data: items,
    });
  } catch (err) {
    if (err?.code === 'LINE_NOT_FOUND') {
      return res.status(404).json({ success: false, message: err.message });
    }
    console.error('Error fetching QC bundles:', err);
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan di server' });
  }
};

// POST /api/qc-spk-bj/:noSPK/lines/:lineNo/bundles
// body: { overwrite?: boolean (default true), items: [{ noBundle, tebal, lebar, panjang, jumlahPcs }] }
exports.saveBundles = async (req, res) => {
  const { noSPK, lineNo, ok } = parseParams(req);
  if (!ok) {
    return res.status(400).json({ success: false, message: 'Parameter tidak valid.' });
  }

  const { overwrite = true, items } = req.body || {};
  if (!Array.isArray(items)) {
    return res.status(400).json({ success: false, message: 'Body harus berisi array "items".' });
  }

  const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));

  const norm = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i] || {};
    const noBundle = Number(it.noBundle);
    if (!Number.isInteger(noBundle) || noBundle < 1) {
      return res.status(400).json({
        success: false,
        message: `items[${i}].noBundle harus integer >= 1.`,
      });
    }

    const tebal = num(it.tebal);
    const lebar = num(it.lebar);
    const panjang = num(it.panjang);
    const jumlahPcs =
      it.jumlahPcs === null || it.jumlahPcs === undefined || it.jumlahPcs === ''
        ? null
        : parseInt(it.jumlahPcs, 10);

    const badNumber =
      [tebal, lebar, panjang].some((v) => v !== null && Number.isNaN(v)) ||
      (jumlahPcs !== null && Number.isNaN(jumlahPcs));
    if (badNumber) {
      return res.status(400).json({
        success: false,
        message: `items[${i}] berisi angka tidak valid.`,
      });
    }

    norm.push({ noBundle, tebal, lebar, panjang, jumlahPcs });
  }

  const seen = new Set();
  for (const it of norm) {
    if (seen.has(it.noBundle)) {
      return res.status(400).json({
        success: false,
        message: `noBundle ${it.noBundle} duplikat.`,
      });
    }
    seen.add(it.noBundle);
  }

  try {
    const result = await service.saveBundles(noSPK, lineNo, norm, {
      overwrite: overwrite !== false,
      createdBy: req.username || null,
    });
    return res.status(200).json({
      success: true,
      message: `Berhasil menyimpan ${result.totalInserted} bundle QC untuk SPK ${noSPK} baris ${lineNo}.`,
      totalInserted: result.totalInserted,
    });
  } catch (err) {
    if (err?.code === 'LINE_NOT_FOUND') {
      return res.status(404).json({ success: false, message: err.message });
    }
    console.error('Error saving QC bundles:', err);
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan di server' });
  }
};

// PUT /api/qc-spk-bj/:noSPK/lines/:lineNo/bundles/:noBundle  — simpan 1 bundle (upsert)
// JSON body { tebal, lebar, panjang, jumlahPcs }
// atau multipart/form-data: field angka yang sama + file fotoTebal/fotoLebar/fotoPanjang/fotoBundle
exports.saveOneBundle = async (req, res) => {
  const { noSPK, lineNo, ok } = parseParams(req);
  const noBundle = parseInt(req.params.noBundle, 10);
  if (!ok || !Number.isInteger(noBundle) || noBundle < 1) {
    return res.status(400).json({ success: false, message: 'Parameter tidak valid.' });
  }

  const b = req.body || {};
  const tebal = Number(b.tebal);
  const lebar = Number(b.lebar);
  const panjang = Number(b.panjang);
  const jumlahPcs = parseInt(b.jumlahPcs, 10);

  if ([tebal, lebar, panjang].some((v) => !Number.isFinite(v) || v <= 0)) {
    return res
      .status(400)
      .json({ success: false, message: 'Tebal, Lebar, Panjang wajib angka > 0.' });
  }
  if (!Number.isInteger(jumlahPcs) || jumlahPcs <= 0) {
    return res
      .status(400)
      .json({ success: false, message: 'Jumlah Pcs wajib integer > 0.' });
  }

  // foto (opsional) — object key MinIO dari processBundlePhotos
  const f = req.files || {};
  const photos = {
    fotoTebal: f.fotoTebal?.[0]?.objectKey,
    fotoLebar: f.fotoLebar?.[0]?.objectKey,
    fotoPanjang: f.fotoPanjang?.[0]?.objectKey,
    fotoBundle: f.fotoBundle?.[0]?.objectKey,
  };

  try {
    const data = await service.saveOneBundle(
      noSPK,
      lineNo,
      noBundle,
      { tebal, lebar, panjang, jumlahPcs },
      photos,
      req.username || null
    );
    return res.status(200).json({
      success: true,
      message: `Bundle #${noBundle} SPK ${noSPK} baris ${lineNo} tersimpan.`,
      data,
    });
  } catch (err) {
    if (err?.code === 'LINE_NOT_FOUND') {
      return res.status(404).json({ success: false, message: err.message });
    }
    if (err?.code === 'BUNDLE_LIMIT') {
      return res.status(400).json({ success: false, message: err.message });
    }
    console.error('Error saving one QC bundle:', err);
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan di server' });
  }
};

// DELETE /api/qc-spk-bj/:noSPK/lines/:lineNo/bundles/:noBundle/photos/:field
exports.deleteOnePhoto = async (req, res) => {
  const { noSPK, lineNo, ok } = parseParams(req);
  const noBundle = parseInt(req.params.noBundle, 10);
  const field = String(req.params.field || '');
  const allowed = ['fotoTebal', 'fotoLebar', 'fotoPanjang', 'fotoBundle'];

  if (!ok || !Number.isInteger(noBundle) || noBundle < 1 || !allowed.includes(field)) {
    return res.status(400).json({ success: false, message: 'Parameter tidak valid.' });
  }

  try {
    const data = await service.deleteOnePhoto(noSPK, lineNo, noBundle, field);
    return res.status(200).json({
      success: true,
      message: `Foto ${field} bundle #${noBundle} dihapus.`,
      data,
    });
  } catch (err) {
    if (err?.code === 'LINE_NOT_FOUND') {
      return res.status(404).json({ success: false, message: err.message });
    }
    console.error('Error deleting QC bundle photo:', err);
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan di server' });
  }
};

// DELETE /api/qc-spk-bj/:noSPK/lines/:lineNo/bundles
exports.deleteBundles = async (req, res) => {
  const { noSPK, lineNo, ok } = parseParams(req);
  if (!ok) {
    return res.status(400).json({ success: false, message: 'Parameter tidak valid.' });
  }

  try {
    const { deleted } = await service.deleteBundles(noSPK, lineNo);
    return res.status(200).json({ success: true, deleted });
  } catch (err) {
    if (err?.code === 'LINE_NOT_FOUND') {
      return res.status(404).json({ success: false, message: err.message });
    }
    console.error('Error deleting QC bundles:', err);
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan di server' });
  }
};

// DELETE /api/qc-spk-bj/:noSPK/lines/:lineNo/bundles/:noBundle
exports.deleteOneBundle = async (req, res) => {
  const { noSPK, lineNo, ok } = parseParams(req);
  const noBundle = parseInt(req.params.noBundle, 10);
  if (!ok || !Number.isInteger(noBundle) || noBundle < 1) {
    return res.status(400).json({ success: false, message: 'Parameter tidak valid.' });
  }

  try {
    const { deleted } = await service.deleteOneBundle(noSPK, lineNo, noBundle);
    return res.status(200).json({
      success: true,
      message: `Bundle #${noBundle} SPK ${noSPK} baris ${lineNo} dihapus.`,
      deleted,
    });
  } catch (err) {
    if (err?.code === 'LINE_NOT_FOUND') {
      return res.status(404).json({ success: false, message: err.message });
    }
    console.error('Error deleting one QC bundle:', err);
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan di server' });
  }
};
