const pool = require('../../config/database');
const AppError = require('../../utils/AppError');

// Admin gallery handlers; aggregated by controllers/adminController.js.
module.exports = {
  // GET /api/admin/gallery — every gallery item, visible or hidden
  async getGallery(req, res) {
    const { rows } = await pool.query(
      `SELECT g.gallery_id AS id, g.*, u.email AS uploaded_by_email,
              COALESCE(s.full_name, t.full_name) AS uploaded_by_name
         FROM gallery g
         LEFT JOIN users u ON u.user_id = g.uploaded_by
         LEFT JOIN students s ON s.user_id = g.uploaded_by
         LEFT JOIN teachers t ON t.user_id = g.uploaded_by
        ORDER BY g.created_at DESC`
    );
    res.json(rows);
  },

  // POST /api/admin/gallery — admin uploads directly (multipart "file")
  async createGalleryItem(req, res) {
    const { removeUploadedFile } = require('../../middleware/uploadMiddleware');
    if (!req.file) throw AppError.badRequest('No file uploaded');
    try {
      const { title, description, category, is_visible } = req.body;
      const { rows } = await pool.query(
        `INSERT INTO gallery (title, description, media_type, media_url, category, uploaded_by, uploader_role, is_visible)
         VALUES ($1, $2, $3, $4, $5, $6, 'admin', $7)
         RETURNING gallery_id AS id, *`,
        [title, description || null, req.file.kind, req.file.storedUrl, category || null, req.user.userId, is_visible ?? true]
      );
      res.status(201).json({ message: 'Media uploaded to the gallery', item: rows[0] });
    } catch (err) {
      await removeUploadedFile(req.file);
      throw err;
    }
  },

  // PUT /api/admin/gallery/:gallery_id
  async updateGalleryItem(req, res) {
    const b = req.body;
    const { rows } = await pool.query(
      `UPDATE gallery SET
         title = COALESCE($1, title),
         description = COALESCE($2, description),
         category = COALESCE($3, category),
         is_visible = COALESCE($4, is_visible)
       WHERE gallery_id = $5
       RETURNING gallery_id AS id, *`,
      [b.title, b.description, b.category, b.is_visible, req.params.gallery_id]
    );
    if (!rows.length) throw AppError.notFound('Gallery item not found');
    res.json({ message: 'Gallery item updated', item: rows[0] });
  },

  // GET /api/admin/gallery/:gallery_id/file — preview, including hidden items
  async getGalleryFile(req, res) {
    const { resolveStoredFile } = require('../../middleware/uploadMiddleware');
    const { sendMediaFile } = require('../galleryController');
    const { rows } = await pool.query('SELECT media_url FROM gallery WHERE gallery_id = $1', [req.params.gallery_id]);
    const file = rows.length ? resolveStoredFile(rows[0].media_url) : null;
    if (!file) throw AppError.notFound('File not found');
    await sendMediaFile(res, file, { cache: 'private, no-store' });
  },

  // DELETE /api/admin/gallery/:gallery_id — the file is removed only when no
  // student request still references it.
  async deleteGalleryItem(req, res) {
    const { deleteStoredFile } = require('../../middleware/uploadMiddleware');
    const { rows } = await pool.query('DELETE FROM gallery WHERE gallery_id = $1 RETURNING media_url', [
      req.params.gallery_id,
    ]);
    if (!rows.length) throw AppError.notFound('Gallery item not found');
    const { rows: refs } = await pool.query('SELECT 1 FROM gallery_requests WHERE media_url = $1 LIMIT 1', [
      rows[0].media_url,
    ]);
    if (!refs.length) await deleteStoredFile(rows[0].media_url);
    res.json({ message: 'Gallery item deleted' });
  }
};
