const pool = require('../config/database');
const AppError = require('../utils/AppError');
const { wrapController } = require('../utils/asyncHandler');
const { teacherIdForUser } = require('./attendanceController');
const { removeUploadedFile, resolveStoredFile, deleteStoredFile } = require('../middleware/uploadMiddleware');
const { sendMediaFile } = require('./galleryController');

const formatSize = (bytes) => {
  if (!bytes) return null;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
};

// file_url is either an uploaded file (served via /api/resources/:id/file)
// or an external https link.
const RESOURCE_COLUMNS = `
  r.resource_id, r.resource_id AS id, r.title, r.description, r.resource_type, r.file_size,
  r.level_id, l.level_name, r.uploaded_by, t.full_name AS uploaded_by_name, r.is_active, r.created_at,
  (r.file_url LIKE 'http%') AS is_external,
  CASE WHEN r.file_url LIKE 'http%' THEN r.file_url END AS external_url`;

const resourceController = {
  // GET /api/teachers/resources — resources uploaded by this teacher
  async getTeacherResources(req, res) {
    const teacherId = await teacherIdForUser(req.user.userId);
    const { rows } = await pool.query(
      `SELECT ${RESOURCE_COLUMNS}
         FROM learning_resources r
         LEFT JOIN levels l ON l.level_id = r.level_id
         LEFT JOIN teachers t ON t.teacher_id = r.uploaded_by
        WHERE r.uploaded_by = $1 AND r.is_active = true
        ORDER BY r.created_at DESC`,
      [teacherId]
    );
    res.json(rows);
  },

  // POST /api/teachers/resources — multipart "file" OR body.external_url
  async createResource(req, res) {
    try {
      const teacherId = await teacherIdForUser(req.user.userId);
      const { title, description, level_id, external_url, resource_type } = req.body;

      if (!req.file && !external_url) throw AppError.badRequest('Upload a file or provide a link.');
      if (req.file && external_url) throw AppError.badRequest('Provide either a file or a link, not both.');

      if (level_id) {
        const { rows } = await pool.query('SELECT 1 FROM levels WHERE level_id = $1', [level_id]);
        if (!rows.length) throw AppError.badRequest('Selected level does not exist.');
      }

      // For uploads the type comes from the verified file; links need it supplied.
      const type = req.file ? req.file.kind : resource_type || 'video';
      const { rows } = await pool.query(
        `INSERT INTO learning_resources
           (title, description, resource_type, file_url, file_size, level_id, uploaded_by, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, true)
         RETURNING resource_id`,
        [
          title, description || null, type,
          req.file ? req.file.storedUrl : external_url,
          req.file ? formatSize(req.file.size) : null,
          level_id || null, teacherId,
        ]
      );
      const { rows: created } = await pool.query(
        `SELECT ${RESOURCE_COLUMNS} FROM learning_resources r
           LEFT JOIN levels l ON l.level_id = r.level_id
           LEFT JOIN teachers t ON t.teacher_id = r.uploaded_by
          WHERE r.resource_id = $1`,
        [rows[0].resource_id]
      );
      res.status(201).json({ message: 'Resource uploaded successfully', resource: created[0] });
    } catch (err) {
      await removeUploadedFile(req.file);
      throw err;
    }
  },

  // DELETE /api/teachers/resources/:resource_id — own resources only
  async deleteResource(req, res) {
    const teacherId = await teacherIdForUser(req.user.userId);
    const { rows } = await pool.query(
      'DELETE FROM learning_resources WHERE resource_id = $1 AND uploaded_by = $2 RETURNING file_url',
      [req.params.resource_id, teacherId]
    );
    if (!rows.length) throw AppError.notFound('Resource not found');
    await deleteStoredFile(rows[0].file_url);
    res.json({ message: 'Resource deleted successfully' });
  },

  // GET /api/students/resources — resources for the student's level (or all levels)
  async getStudentResources(req, res) {
    const { rows } = await pool.query(
      `SELECT ${RESOURCE_COLUMNS}
         FROM learning_resources r
         JOIN students s ON s.user_id = $1
         LEFT JOIN levels l ON l.level_id = r.level_id
         LEFT JOIN teachers t ON t.teacher_id = r.uploaded_by
        WHERE r.is_active = true AND (r.level_id IS NULL OR r.level_id = s.current_level_id)
        ORDER BY r.created_at DESC`,
      [req.user.userId]
    );
    res.json(rows);
  },

  // GET /api/resources/:resource_id/file — authorised download of an uploaded resource
  async getResourceFile(req, res) {
    const { rows } = await pool.query(
      'SELECT file_url, level_id, is_active FROM learning_resources WHERE resource_id = $1',
      [req.params.resource_id]
    );
    const r = rows[0];
    if (!r || !r.is_active) throw AppError.notFound('Resource not found');

    if (req.user.role === 'student') {
      const { rows: s } = await pool.query('SELECT current_level_id FROM students WHERE user_id = $1', [
        req.user.userId,
      ]);
      if (!s.length || (r.level_id !== null && r.level_id !== s[0].current_level_id)) {
        throw AppError.notFound('Resource not found');
      }
    }
    const file = resolveStoredFile(r.file_url);
    if (!file) throw AppError.notFound('This resource is an external link.');
    await sendMediaFile(res, file, { cache: 'private, max-age=3600' });
  },
};

module.exports = wrapController(resourceController);
