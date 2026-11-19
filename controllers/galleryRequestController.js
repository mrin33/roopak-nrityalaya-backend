const pool = require('../config/database');
const { withTransaction } = require('../config/database');
const AppError = require('../utils/AppError');
const Student = require('../models/Student');
const { wrapController } = require('../utils/asyncHandler');
const { removeUploadedFile, resolveStoredFile } = require('../middleware/uploadMiddleware');
const { sendMediaFile } = require('./galleryController');

// Canonical columns plus the aliases the frontend uses (id, file_url).
const REQUEST_COLUMNS = `
  r.request_id, r.request_id AS id, r.student_id, r.title, r.description, r.media_type,
  r.media_url, r.media_url AS file_url, r.category, r.status, r.reviewed_by, r.reviewed_at,
  r.rejection_reason, r.requested_at`;

const galleryRequestController = {
  // POST /api/gallery-requests/student/upload  (multipart, field "file")
  async createRequest(req, res) {
    if (!req.file) throw AppError.badRequest('No file uploaded');
    try {
      const studentId = await Student.idForUser(req.user.userId);
      if (!studentId) throw AppError.notFound('Student not found');

      const { title, description, category } = req.body;
      const { rows } = await pool.query(
        `INSERT INTO gallery_requests (student_id, title, description, media_type, category, status, media_url)
         VALUES ($1, $2, $3, $4, $5, 'pending', $6)
         RETURNING request_id`,
        [
          studentId, title, description || null,
          req.file.kind, // derived from the verified file, not from client input
          category || null, `/uploads/${req.file.filename}`,
        ]
      );
      const { rows: created } = await pool.query(
        `SELECT ${REQUEST_COLUMNS} FROM gallery_requests r WHERE r.request_id = $1`,
        [rows[0].request_id]
      );
      res.status(201).json(created[0]);
    } catch (err) {
      await removeUploadedFile(req.file); // never leave orphaned files behind
      throw err;
    }
  },

  // GET /api/gallery-requests/student
  async getStudentRequests(req, res) {
    const { rows } = await pool.query(
      `SELECT ${REQUEST_COLUMNS}
         FROM gallery_requests r
         JOIN students s ON s.student_id = r.student_id
        WHERE s.user_id = $1
        ORDER BY r.requested_at DESC`,
      [req.user.userId]
    );
    res.json(rows);
  },

  // GET /api/gallery-requests/admin
  async getAllRequests(req, res) {
    const { rows } = await pool.query(
      `SELECT ${REQUEST_COLUMNS}, s.full_name AS student_name, s.roll_number,
              COALESCE(t.full_name, u.email) AS reviewed_by_name
         FROM gallery_requests r
         LEFT JOIN students s ON s.student_id = r.student_id
         LEFT JOIN users u ON u.user_id = r.reviewed_by
         LEFT JOIN teachers t ON t.user_id = r.reviewed_by
        ORDER BY (r.status = 'pending') DESC, r.requested_at DESC`
    );
    res.json(rows);
  },

  // PUT /api/gallery-requests/admin/:id/status
  // Approving publishes the item to the public gallery; rejecting (or
  // re-rejecting an approved item) hides it again.
  async updateRequestStatus(req, res) {
    const { status, rejection_reason } = req.body;
    const request = await withTransaction(async (client) => {
      const { rows } = await client.query(
        `UPDATE gallery_requests
            SET status = $1::varchar,
                rejection_reason = CASE WHEN $1::varchar = 'rejected' THEN $2 ELSE NULL END,
                reviewed_at = CURRENT_TIMESTAMP, reviewed_by = $3
          WHERE request_id = $4
          RETURNING *`,
        [status, rejection_reason || null, req.user.userId, req.params.id]
      );
      if (!rows.length) throw AppError.notFound('Request not found');
      const r = rows[0];

      if (status === 'approved') {
        const { rows: owner } = await client.query('SELECT user_id FROM students WHERE student_id = $1', [
          r.student_id,
        ]);
        await client.query(
          `INSERT INTO gallery
             (title, description, media_type, media_url, category, uploaded_by, uploader_role, is_visible, source_request_id)
           VALUES ($1, $2, $3, $4, $5, $6, 'student', true, $7)
           ON CONFLICT (source_request_id) WHERE source_request_id IS NOT NULL
           DO UPDATE SET is_visible = true, title = EXCLUDED.title, description = EXCLUDED.description`,
          [r.title, r.description, r.media_type, r.media_url, r.category, owner[0]?.user_id || null, r.request_id]
        );
      } else {
        await client.query('UPDATE gallery SET is_visible = false WHERE source_request_id = $1', [r.request_id]);
      }
      return { ...r, id: r.request_id, file_url: r.media_url };
    });

    res.json({ message: 'Status updated successfully', request });
  },

  // GET /api/gallery-requests/:id/file — owner student or admin only, so
  // pending and rejected uploads are never publicly reachable.
  async getRequestFile(req, res) {
    const { rows } = await pool.query(
      `SELECT r.media_url, r.status, s.user_id AS owner_user_id
         FROM gallery_requests r LEFT JOIN students s ON s.student_id = r.student_id
        WHERE r.request_id = $1`,
      [req.params.id]
    );
    const row = rows[0];
    const allowed = row && (req.user.role === 'admin' || row.owner_user_id === req.user.userId);
    if (!allowed) throw AppError.notFound('File not found');
    const file = resolveStoredFile(row.media_url);
    if (!file) throw AppError.notFound('File not found');
    await sendMediaFile(res, file, { cache: 'private, no-store' });
  },
};

module.exports = wrapController(galleryRequestController);
