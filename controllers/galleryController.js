const fs = require('fs');
const path = require('path');
const pool = require('../config/database');
const AppError = require('../utils/AppError');
const { wrapController } = require('../utils/asyncHandler');

const MIME_BY_EXT = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
};

// Serve a stored media file with headers that prevent it from ever being
// interpreted as an active document.
const sendMediaFile = async (res, filePath, { cache }) => {
  const type = MIME_BY_EXT[path.extname(filePath).toLowerCase()];
  if (!type) throw AppError.notFound('File not found');
  try {
    await fs.promises.access(filePath, fs.constants.R_OK);
  } catch {
    throw AppError.notFound('File not found');
  }
  res.set({
    'Content-Type': type,
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; sandbox",
    'Content-Disposition': 'inline',
    'Cross-Origin-Resource-Policy': 'cross-origin',
    'Cache-Control': cache,
  });
  await new Promise((resolve, reject) => {
    res.sendFile(filePath, { dotfiles: 'deny' }, (err) => (err ? reject(err) : resolve()));
  });
};

const galleryController = {
  // GET /api/gallery — public, visible items only
  async getPublicGallery(req, res) {
    const { rows } = await pool.query(
      `SELECT g.gallery_id AS id, g.title, g.description, g.media_type, g.media_url, g.category,
              g.uploader_role, g.created_at, EXTRACT(YEAR FROM g.created_at)::int AS year
         FROM gallery g
        WHERE g.is_visible = true
        ORDER BY g.created_at DESC`
    );
    res.json(rows);
  },

  // GET /uploads/:filename and /api/media/:filename — public, but only for
  // media that has been approved and published to the gallery.
  async getPublicMedia(req, res) {
    const { isSafeStoredName, resolveStoredFile } = require('../middleware/uploadMiddleware');
    const { filename } = req.params;
    if (!isSafeStoredName(filename)) throw AppError.notFound('File not found');

    const mediaUrl = `/uploads/${filename}`;
    const { rows } = await pool.query(
      `SELECT 1 FROM gallery WHERE media_url = $1 AND is_visible = true
       UNION ALL
       SELECT 1 FROM gallery_requests WHERE media_url = $1 AND status = 'approved'
       LIMIT 1`,
      [mediaUrl]
    );
    if (!rows.length) throw AppError.notFound('File not found');

    const file = resolveStoredFile(mediaUrl);
    if (!file) throw AppError.notFound('File not found');
    await sendMediaFile(res, file, { cache: 'public, max-age=86400' });
  },
};

module.exports = wrapController(galleryController);
module.exports.sendMediaFile = sendMediaFile;
