const pool = require('../../config/database');
const { withTransaction } = require('../../config/database');
const AppError = require('../../utils/AppError');
const { createPasswordSetupLink } = require('./shared');
const { unusablePasswordHash } = require('../../utils/security');

// Admin teachers handlers; aggregated by controllers/adminController.js.
module.exports = {
  async getAllTeachers(req, res) {
    const { rows } = await pool.query(`
      SELECT
        t.*, u.email, u.last_login,
        COUNT(DISTINCT b.batch_id)::int AS total_batches,
        COUNT(DISTINCT s.student_id)::int AS total_students,
        COALESCE(t.average_rating, 0)::float AS avg_rating,
        EXISTS (
          SELECT 1 FROM password_setup_tokens pst
           WHERE pst.user_id = t.user_id AND pst.purpose = 'invite'
             AND pst.used_at IS NULL AND pst.expires_at > now()
        ) AS invite_pending
      FROM teachers t
      LEFT JOIN users u ON t.user_id = u.user_id
      LEFT JOIN batches b ON t.teacher_id = b.teacher_id
      LEFT JOIN student_batches sb ON b.batch_id = sb.batch_id AND sb.is_active = true
      LEFT JOIN students s ON sb.student_id = s.student_id AND s.is_active = true
      GROUP BY t.teacher_id, u.email, u.last_login
      ORDER BY t.full_name
    `);
    res.json(rows);
  },

  // Teachers are created WITHOUT a password. The admin receives a one-time
  // link (valid for INVITE_TOKEN_TTL_HOURS) to share with the teacher, who
  // chooses their own password. No shared default password exists.
  async createTeacher(req, res) {
    const b = req.body;
    const result = await withTransaction(async (client) => {
      const { rows: dup } = await client.query('SELECT 1 FROM users WHERE lower(email) = lower($1)', [b.email]);
      if (dup.length) throw AppError.conflict('A user with this email already exists.');

      const { rows: userRows } = await client.query(
        `INSERT INTO users (email, password_hash, role, is_active, password_changed_at)
         VALUES (lower($1), $2, 'teacher', true, now())
         RETURNING user_id`,
        [b.email, await unusablePasswordHash()]
      );
      const userId = userRows[0].user_id;

      const { rows: teacherRows } = await client.query(
        `INSERT INTO teachers
           (user_id, full_name, phone, specialization, experience_years, qualifications, bio, is_senior, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)
         RETURNING *`,
        [
          userId, b.full_name, b.phone || null, b.specialization || null, b.experience_years ?? 0,
          b.qualifications || null, b.bio || null, b.is_senior ?? false,
        ]
      );
      const invite = await createPasswordSetupLink(client, userId, 'invite', req.user.userId);
      return { teacher: { ...teacherRows[0], email: b.email }, invite };
    });

    res.status(201).json({
      message: 'Teacher created. Share the invitation link so they can set their password.',
      teacher: result.teacher,
      invite: result.invite,
    });
  },

  // POST /api/admin/teachers/:teacher_id/invite — new invitation / reset link
  async regenerateTeacherInvite(req, res) {
    const invite = await withTransaction(async (client) => {
      const { rows } = await client.query(
        `SELECT t.user_id, u.last_login, u.is_active
           FROM teachers t JOIN users u ON u.user_id = t.user_id
          WHERE t.teacher_id = $1`,
        [req.params.teacher_id]
      );
      if (!rows.length) throw AppError.notFound('Teacher not found');
      if (!rows[0].is_active) throw AppError.badRequest('Activate the teacher before sending a link.');
      const purpose = rows[0].last_login ? 'reset' : 'invite';
      return createPasswordSetupLink(client, rows[0].user_id, purpose, req.user.userId);
    });
    res.json({ message: 'New password setup link created.', invite });
  },

  async updateTeacher(req, res) {
    const b = req.body;
    const teacher = await withTransaction(async (client) => {
      const { rows: existing } = await client.query(
        'SELECT teacher_id, user_id FROM teachers WHERE teacher_id = $1 FOR UPDATE',
        [req.params.teacher_id]
      );
      if (!existing.length) throw AppError.notFound('Teacher not found');
      const { user_id: userId } = existing[0];

      if (userId && (b.email || b.is_active !== undefined)) {
        await client.query(
          `UPDATE users SET
             email = COALESCE(lower($1), email),
             is_active = COALESCE($2, is_active),
             updated_at = CURRENT_TIMESTAMP
           WHERE user_id = $3`,
          [b.email || null, b.is_active ?? null, userId]
        );
      }

      const { rows } = await client.query(
        `UPDATE teachers SET
           full_name = COALESCE($1, full_name),
           phone = COALESCE($2, phone),
           specialization = COALESCE($3, specialization),
           experience_years = COALESCE($4, experience_years),
           qualifications = COALESCE($5, qualifications),
           bio = COALESCE($6, bio),
           is_senior = COALESCE($7, is_senior),
           is_active = COALESCE($8, is_active),
           updated_at = CURRENT_TIMESTAMP
         WHERE teacher_id = $9
         RETURNING *`,
        [
          b.full_name, b.phone, b.specialization, b.experience_years, b.qualifications, b.bio,
          b.is_senior, b.is_active, req.params.teacher_id,
        ]
      );
      return rows[0];
    });
    res.json({ message: 'Teacher updated successfully', teacher });
  },

  async deleteTeacher(req, res) {
    const { rows } = await pool.query('SELECT teacher_id, user_id FROM teachers WHERE teacher_id = $1', [
      req.params.teacher_id,
    ]);
    if (!rows.length) throw AppError.notFound('Teacher not found');

    const { rows: batches } = await pool.query('SELECT COUNT(*)::int AS count FROM batches WHERE teacher_id = $1', [
      req.params.teacher_id,
    ]);
    if (batches[0].count > 0) {
      throw AppError.badRequest('Cannot delete teacher with assigned batches. Reassign the batches first.');
    }

    await withTransaction(async (client) => {
      if (rows[0].user_id) {
        await client.query('DELETE FROM users WHERE user_id = $1', [rows[0].user_id]);
      } else {
        await client.query('DELETE FROM teachers WHERE teacher_id = $1', [rows[0].teacher_id]);
      }
    });
    res.json({ message: 'Teacher deleted successfully' });
  }
};
