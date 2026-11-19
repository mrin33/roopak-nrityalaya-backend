const pool = require('../config/database');
const AppError = require('../utils/AppError');
const { wrapController } = require('../utils/asyncHandler');

// Canonical columns plus the aliases the frontend uses (id, content, is_important).
const NOTICE_COLUMNS = `
  n.notice_id, n.notice_id AS id, n.title, n.description, n.description AS content,
  n.target_audience, n.category, n.priority, (n.priority = 'high') AS is_important,
  n.status, n.is_active, n.expiry_date, n.created_by, n.created_at, n.updated_at`;

const priorityFrom = (body) => body.priority || (body.is_important ? 'high' : 'normal');

const noticeController = {
  // GET /api/notices — published, active, unexpired notices visible to the viewer.
  // Guests see "all" notices; logged-in users also see notices for their role;
  // admins see everything published.
  async getNotices(req, res) {
    const { category, target_audience } = req.validatedQuery || {};
    const values = [];
    const where = [
      "n.status = 'published'",
      'n.is_active = true',
      '(n.expiry_date IS NULL OR n.expiry_date >= CURRENT_DATE)',
    ];

    const role = req.user?.role;
    if (role !== 'admin') {
      const audiences = ['all'];
      if (role === 'student') audiences.push('students');
      if (role === 'teacher') audiences.push('teachers');
      values.push(audiences);
      where.push(`n.target_audience = ANY($${values.length})`);
    }
    if (category) {
      values.push(category);
      where.push(`n.category = $${values.length}`);
    }
    if (target_audience) {
      values.push(target_audience);
      where.push(`n.target_audience IN ('all', $${values.length})`);
    }

    const { rows } = await pool.query(
      `SELECT ${NOTICE_COLUMNS} FROM notices n WHERE ${where.join(' AND ')}
        ORDER BY (n.priority = 'high') DESC, n.created_at DESC`,
      values
    );
    res.json(rows);
  },

  // GET /api/notices/admin — everything, including drafts and inactive
  async getAllAdminNotices(req, res) {
    const { rows } = await pool.query(`SELECT ${NOTICE_COLUMNS} FROM notices n ORDER BY n.created_at DESC`);
    res.json(rows);
  },

  // POST /api/notices
  async createNotice(req, res) {
    const b = req.body;
    const { rows } = await pool.query(
      `INSERT INTO notices
         (title, description, target_audience, category, priority, status, expiry_date, is_active, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, true), $9)
       RETURNING notice_id`,
      [
        b.title, b.content, b.target_audience, b.category, priorityFrom(b), b.status,
        b.expiry_date || null, b.is_active ?? null, req.user.userId,
      ]
    );
    const { rows: created } = await pool.query(`SELECT ${NOTICE_COLUMNS} FROM notices n WHERE n.notice_id = $1`, [
      rows[0].notice_id,
    ]);
    res.status(201).json(created[0]);
  },

  // PUT /api/notices/:id
  async updateNotice(req, res) {
    const b = req.body;
    const { rowCount } = await pool.query(
      `UPDATE notices SET
         title = $1, description = $2, target_audience = $3, category = $4, priority = $5,
         status = $6, expiry_date = $7, is_active = COALESCE($8, is_active), updated_at = CURRENT_TIMESTAMP
       WHERE notice_id = $9`,
      [
        b.title, b.content, b.target_audience, b.category, priorityFrom(b), b.status,
        b.expiry_date || null, b.is_active ?? null, req.params.id,
      ]
    );
    if (!rowCount) throw AppError.notFound('Notice not found');
    const { rows } = await pool.query(`SELECT ${NOTICE_COLUMNS} FROM notices n WHERE n.notice_id = $1`, [
      req.params.id,
    ]);
    res.json(rows[0]);
  },

  // DELETE /api/notices/:id
  async deleteNotice(req, res) {
    const { rows } = await pool.query('DELETE FROM notices WHERE notice_id = $1 RETURNING notice_id', [req.params.id]);
    if (!rows.length) throw AppError.notFound('Notice not found');
    res.json({ message: 'Notice deleted successfully', deleted: { id: rows[0].notice_id } });
  },
};

module.exports = wrapController(noticeController);
