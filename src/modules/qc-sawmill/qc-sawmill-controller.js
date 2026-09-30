const qcSawmillService = require('./qc-sawmill-service');

// GET /qc-sawmill/masters
exports.getMasters = async (req, res) => {
  try {
    const masters = await qcSawmillService.getMasters();
    return res.status(200).json({
      success: true,
      message: 'Master data QC Sawmill',
      data: masters,
    });
  } catch (err) {
    console.error('Error fetching QC Sawmill masters:', err);
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan di server' });
  }
};

// GET /qc-sawmill (tetap sama)
exports.getHeader = async (req, res) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const rawSize = parseInt(req.query.pageSize, 10) || 20;
  const pageSize = Math.min(Math.max(rawSize, 1), 200);

  const q = (req.query.q || '').trim();
  const dateFrom = (req.query.dateFrom || '').trim();
  const dateTo   = (req.query.dateTo || '').trim();
  const idJenisKayu = req.query.idJenisKayu ? parseInt(req.query.idJenisKayu, 10) : null;

  try {
    const { rows, total } = await qcSawmillService.getHeaderQcSawmill({
      page, pageSize, q, dateFrom, dateTo, idJenisKayu
    });

    const totalPages = Math.max(Math.ceil(total / pageSize), 1);

    return res.status(200).json({
      success: true,
      message: 'Data QC Sawmill',
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
    console.error('Error fetching paged QC Sawmill:', err);
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan di server' });
  }
};


// POST /qc-sawmill
exports.createHeader = async (req, res) => {
    const { username } = req.user || {};
    const { tgl, idJenisKayu, meja } = req.body || {};
  
    if (!tgl || !String(tgl).trim()) {
      return res.status(400).json({ success: false, message: 'tgl (YYYY-MM-DD) wajib diisi.' });
    }
    const idJenisKayuNum = Number(idJenisKayu);
    if (!Number.isInteger(idJenisKayuNum)) {
      return res.status(400).json({ success: false, message: 'idJenisKayu harus integer.' });
    }
  
    try {
      const created = await qcSawmillService.createHeaderAutoNo({
        tgl: String(tgl).trim(),
        idJenisKayu: idJenisKayuNum,
        meja: (meja ?? '').trim(),
        createdBy: username || null,
      });
  
      return res.status(201).json({
        success: true,
        message: 'Header QC Sawmill berhasil dibuat.',
        data: created,
      });
    } catch (err) {
      if (err?.code === 'DUPLICATE_NOQC') {
        return res.status(409).json({ success: false, message: err.message });
      }
      console.error('Error creating QC Sawmill header (auto):', err);
      return res.status(500).json({ success: false, message: 'Terjadi kesalahan di server' });
    }
  };



  // PUT /qc-sawmill/:noqc
exports.updateHeaderByNoQc = async (req, res) => {
    const { noqc } = req.params;
    if (!noqc || !noqc.trim()) {
      return res.status(400).json({ success: false, message: 'Parameter noqc wajib diisi.' });
    }
  
    // kolom opsional — kirim salah satu
    let { tgl, idJenisKayu, meja } = req.body || {};
    const updates = {};
  
    if (tgl != null && String(tgl).trim()) {
      updates.tgl = String(tgl).trim(); // YYYY-MM-DD
    }
    if (idJenisKayu != null) {
      const n = Number(idJenisKayu);
      if (!Number.isInteger(n)) {
        return res.status(400).json({ success: false, message: 'idJenisKayu harus integer.' });
      }
      updates.idJenisKayu = n;
    }
    if (meja != null) {
      meja = String(meja);
      if (meja.length > 50) {
        return res.status(400).json({ success: false, message: 'meja terlalu panjang (maks 50 karakter).' });
      }
      updates.meja = meja.trim();
    }
  
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, message: 'Tidak ada field yang dikirim untuk diupdate.' });
    }
  
    try {
      const updated = await qcSawmillService.updateHeaderByNoQc(noqc, updates);
      if (!updated) {
        return res.status(404).json({ success: false, message: 'Header tidak ditemukan.' });
      }
  
      return res.status(200).json({
        success: true,
        message: 'Header QC Sawmill berhasil diupdate.',
        data: updated,
      });
    } catch (err) {
      console.error('Error updating QC Sawmill header:', err);
      return res.status(500).json({ success: false, message: 'Terjadi kesalahan di server' });
    }
  };


// GET /qc-sawmill/:noqc/details — TANPA header
exports.getDetailsByNoQc = async (req, res) => {
  const { noqc } = req.params;

  if (!noqc || !noqc.trim()) {
    return res.status(400).json({ success: false, message: 'Parameter noqc wajib diisi.' });
  }

  try {
    const details = await qcSawmillService.getDetailsByNoQc(noqc);

    if (!details.length) {
      return res.status(404).json({ success: false, message: 'Detail tidak ditemukan untuk NoQc tersebut.' });
    }

    return res.status(200).json({
      success: true,
      message: 'Detail QC Sawmill',
      total: details.length,
      data: details,
    });
  } catch (err) {
    console.error('Error fetching QC Sawmill detail:', err);
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan di server' });
  }
};


// POST /qc-sawmill/:noqc/details — create detail rows (tanpa header)
exports.createDetailsByNoQc = async (req, res) => {
  const { noqc } = req.params;
  const { overwrite = false, items } = req.body || {};

  if (!noqc || !noqc.trim()) {
    return res.status(400).json({ success: false, message: 'Parameter noqc wajib diisi.' });
  }

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Body harus berisi array "items" minimal 1 baris.',
    });
  }

  // quick shape check per item
  const invalid = items.find((it) =>
    it == null ||
    typeof it.noUrut !== 'number' ||
    (it.noST != null && typeof it.noST !== 'string') ||
    [ 'cuttingTebal','cuttingLebar','actualTebal','actualLebar','susutTebal','susutLebar' ]
      .some(k => it[k] != null && typeof it[k] !== 'number')
  );
  if (invalid) {
    return res.status(400).json({
      success: false,
      message: 'Struktur item tidak valid. Pastikan tipe data sesuai.',
    });
  }

  try {
    const result = await qcSawmillService.createDetailsByNoQc(noqc.trim(), items, { overwrite });

    return res.status(201).json({
      success: true,
      message: `Berhasil menyimpan detail QC Sawmill untuk NoQc ${noqc}.`,
      totalInserted: result.totalInserted,
    });
  } catch (err) {
    console.error('Error creating QC Sawmill details:', err);
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan di server' });
  }
};



exports.deleteDetailsByNoQc = async (req, res) => {
  const { noqc } = req.params;
  if (!noqc?.trim()) return res.status(400).json({ success:false, message:'noqc wajib' });
  try {
    const { deleted } = await qcSawmillService.deleteDetailsByNoQc(noqc.trim());
    return res.status(200).json({ success:true, deleted });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ success:false, message:'Terjadi kesalahan di server' });
  }
};



// DELETE /qc-sawmill/:noqc
exports.deleteByNoQc = async (req, res) => {
    const { noqc } = req.params;
    if (!noqc || !noqc.trim()) {
      return res.status(400).json({ success: false, message: 'Parameter noqc wajib diisi.' });
    }
  
    try {
      const { deletedDetails, deletedHeader } = await qcSawmillService.deleteByNoQc(noqc);
  
      if ((deletedDetails ?? 0) === 0 && (deletedHeader ?? 0) === 0) {
        return res.status(404).json({ success: false, message: 'Data dengan NoQc tersebut tidak ditemukan.' });
      }
  
      return res.status(200).json({
        success: true,
        message: 'Data QC Sawmill berhasil dihapus.',
        meta: { deletedDetails, deletedHeader }
      });
    } catch (err) {
      console.error('Error deleting QC Sawmill:', err);
      return res.status(500).json({ success: false, message: 'Terjadi kesalahan di server' });
    }
  };