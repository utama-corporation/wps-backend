// Upload foto bundle QC SPK Barang Jadi ke MinIO (kompres + watermark via sharp).
const multer = require('multer');
const path = require('path');
const sharp = require('sharp');
const moment = require('moment');
require('moment/locale/id'); // nama hari & bulan Bahasa Indonesia

const { putImage } = require('../../core/utils/minio-client');

const xmlEsc = (s) =>
  String(s || '').replace(
    /[<>&'"]/g,
    (c) =>
      ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c])
  );

// Watermark di POJOK KANAN ATAS: SPK, Bundle, hari & tanggal + jam, dan user pengambil.
function watermarkSvg(w, h, spk, bundle, hari, tanggal, jam, user) {
  const margin = Math.round(w * 0.02);
  const fs = Math.max(14, Math.round(w * 0.026));
  const pad = Math.round(fs * 0.6);
  const lineH = Math.round(fs * 1.4);

  const lines = [
    { t: `SPK ${spk}`, s: fs, bold: true },
    { t: `Bundle #${bundle}`, s: fs, bold: true },
    { t: `${hari}, ${tanggal}`, s: Math.round(fs * 0.85), bold: false },
    { t: jam, s: Math.round(fs * 0.8), bold: false },
    { t: `Diambil oleh: ${user || '-'}`, s: Math.round(fs * 0.8), bold: false },
  ];

  const boxW =
    Math.round(Math.max(...lines.map((l) => l.t.length * l.s * 0.58))) + pad * 2;
  const boxH = lineH * lines.length + pad * 2 - Math.round(fs * 0.3);
  const bx = w - boxW - margin;
  const tx = w - margin - pad;

  let ty = margin + pad + Math.round(fs * 0.9);
  const texts = lines
    .map((l) => {
      const el = `<text x="${tx}" y="${ty}" text-anchor="end" font-family="Arial, Helvetica, sans-serif" font-size="${l.s}" font-weight="${
        l.bold ? 'bold' : 'normal'
      }" fill="#ffffff">${xmlEsc(l.t)}</text>`;
      ty += lineH;
      return el;
    })
    .join('\n  ');

  return Buffer.from(`
<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
  <rect x="${bx}" y="${margin}" width="${boxW}" height="${boxH}" rx="${Math.round(
    fs * 0.4
  )}" fill="black" fill-opacity="0.5"/>
  ${texts}
</svg>`);
}

// Maksimal 3 file untuk bidang dimensi (tebal/lebar/panjang); bundle cukup 1
// foto. Frontend boleh mengirim beberapa file dengan nama field yang sama
// (fotoTebal, fotoTebal, ...) untuk mengisi slot foto berikutnya.
const MAX_PHOTOS = 3;

const FIELDS = [
  { name: 'fotoTebal', maxCount: MAX_PHOTOS },
  { name: 'fotoLebar', maxCount: MAX_PHOTOS },
  { name: 'fotoPanjang', maxCount: MAX_PHOTOS },
  { name: 'fotoBundle', maxCount: 1 },
];

const safe = (s) => String(s || '').replace(/[^A-Za-z0-9._-]+/g, '_');

const fileFilter = (req, file, cb) => {
  const allowed = ['.jpg', '.jpeg', '.png', '.webp'];
  const ext = path.extname(file.originalname || '').toLowerCase();
  if (ext && !allowed.includes(ext)) {
    return cb(new Error('File harus berupa gambar (.jpg, .jpeg, .png, .webp)'));
  }
  cb(null, true);
};

// simpan di memori supaya bisa langsung dikompres & dikirim ke MinIO
const uploadBundlePhotos = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: { fileSize: 15 * 1024 * 1024 },
}).fields(FIELDS);

// kompres tiap file lalu putObject ke MinIO; hasilnya di f.objectKey
const processBundlePhotos = async (req, res, next) => {
  const files = req.files ? Object.values(req.files).flat() : [];
  if (!files.length) return next();

  try {
    const { noSPK, lineNo, noBundle } = req.params;
    const user = req.username || '-'; // di-set oleh verify-token
    const now = moment().locale('id');
    const hari = now.format('dddd'); // mis. "Kamis"
    const tanggal = now.format('DD MMMM YYYY'); // mis. "10 September 2026"
    const jam = now.format('HH:mm:ss');

    for (const f of files) {
      // 1) rotate + resize
      const base = await sharp(f.buffer)
        .rotate()
        .resize({ width: 1280, withoutEnlargement: true })
        .toBuffer();
      const meta = await sharp(base).metadata();
      const w = meta.width || 1280;
      const h = meta.height || 720;

      // 2) watermark pojok kanan atas
      const svg = watermarkSvg(w, h, noSPK, noBundle, hari, tanggal, jam, user);

      const out = await sharp(base)
        .composite([{ input: svg, top: 0, left: 0 }])
        .jpeg({ quality: 70 })
        .toBuffer();

      const suffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
      const name = `${safe(noSPK)}_L${safe(lineNo)}_B${safe(noBundle)}_${f.fieldname}_${suffix}.jpg`;
      f.objectKey = await putImage(name, out, 'image/jpeg');
      console.log(
        `[qc-spk-bj] foto watermarked "${hari}, ${tanggal} ${jam}" oleh ${user} -> ${f.objectKey}`
      );
    }
    next();
  } catch (err) {
    console.error('QC SPK BJ MinIO upload error:', err);
    return res
      .status(500)
      .json({ success: false, message: 'Gagal upload foto bundle ke storage' });
  }
};

module.exports = { uploadBundlePhotos, processBundlePhotos, FIELDS };
