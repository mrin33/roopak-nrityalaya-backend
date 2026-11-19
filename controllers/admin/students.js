const pool = require('../../config/database');
const { withTransaction } = require('../../config/database');
const AppError = require('../../utils/AppError');
const { createPasswordSetupLink, studentStatusLabel } = require('./shared');
const { unusablePasswordHash } = require('../../utils/security');

// Admin students handlers; aggregated by controllers/adminController.js.
module.exports = {
  async getAllStudents(req, res) {
    const { level_id, status, payment_window, search } = req.validatedQuery || {};
    const values = [];
    const where = [];

    if (level_id) {
      values.push(level_id);
      where.push(`s.current_level_id = $${values.length}`);
    }
    if (status === 'active') where.push('s.is_active = true');
    if (status === 'inactive') where.push('s.is_active = false');
    if (payment_window) {
      values.push(payment_window);
      where.push(`s.payment_window = $${values.length}`);
    }
    if (search) {
      values.push(`%${search.replace(/[%_\\]/g, '\\$&')}%`);
      where.push(
        `(s.full_name ILIKE $${values.length} OR u.email ILIKE $${values.length} OR s.roll_number ILIKE $${values.length})`
      );
    }

    const { rows } = await pool.query(
      `SELECT
         s.student_id, s.roll_number, s.full_name, u.email, s.phone,
         CASE WHEN s.is_active THEN 'active' ELSE 'inactive' END AS status,
         s.is_active, s.payment_window,
         COALESCE(fs.discount_percentage, 0)::float AS discount,
         s.current_level_id, l.level_name, b.batch_id, b.batch_name, s.enrollment_date
       FROM students s
       LEFT JOIN users u ON s.user_id = u.user_id
       LEFT JOIN levels l ON s.current_level_id = l.level_id
       LEFT JOIN student_batches sb ON s.student_id = sb.student_id AND sb.is_active = true
       LEFT JOIN batches b ON sb.batch_id = b.batch_id
       LEFT JOIN fee_structure fs
              ON fs.level_id = s.current_level_id AND fs.payment_window = s.payment_window AND fs.is_active
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY s.full_name`,
      values
    );
    res.json(rows);
  },

  async getStudentDetails(req, res) {
    const { rows } = await pool.query(
      `SELECT s.*, u.email, u.last_login,
              CASE WHEN s.is_active THEN 'active' ELSE 'inactive' END AS status,
              l.level_name, l.level_code,
              b.batch_id, b.batch_name, b.schedule, b."time", t.full_name AS teacher_name
         FROM students s
         LEFT JOIN users u ON s.user_id = u.user_id
         LEFT JOIN levels l ON s.current_level_id = l.level_id
         LEFT JOIN student_batches sb ON s.student_id = sb.student_id AND sb.is_active = true
         LEFT JOIN batches b ON sb.batch_id = b.batch_id
         LEFT JOIN teachers t ON b.teacher_id = t.teacher_id
        WHERE s.student_id = $1`,
      [req.params.student_id]
    );
    if (!rows.length) throw AppError.notFound('Student not found');
    res.json(rows[0]);
  },

  // POST /api/admin/students — admin enrols a student. Like teachers, the
  // student receives a one-time link to choose their own password.
  async createStudent(req, res) {
    const b = req.body;
    const result = await withTransaction(async (client) => {
      const { rows: dup } = await client.query('SELECT 1 FROM users WHERE lower(email) = lower($1)', [b.email]);
      if (dup.length) throw AppError.conflict('A user with this email already exists.');

      const { rows: level } = await client.query('SELECT 1 FROM levels WHERE level_id = $1', [b.current_level_id]);
      if (!level.length) throw AppError.badRequest('Selected level does not exist.');

      const { rows: userRows } = await client.query(
        `INSERT INTO users (email, password_hash, role, is_active, password_changed_at)
         VALUES (lower($1), $2, 'student', true, now())
         RETURNING user_id`,
        [b.email, await unusablePasswordHash()]
      );
      const userId = userRows[0].user_id;

      const { rows: studentRows } = await client.query(
        `INSERT INTO students
           (user_id, full_name, phone, date_of_birth, gender, address, emergency_contact_name,
            emergency_contact, current_level_id, payment_window, enrollment_reason)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING *`,
        [
          userId, b.full_name, b.phone || null, b.date_of_birth || null, b.gender || null, b.address || null,
          b.emergency_contact_name || null, b.emergency_contact || null, b.current_level_id,
          b.payment_window || 'monthly', b.enrollment_reason || null,
        ]
      );
      const student = studentRows[0];

      if (b.batch_id) {
        const { rows: batch } = await client.query(
          'SELECT 1 FROM batches WHERE batch_id = $1 AND is_active = true',
          [b.batch_id]
        );
        if (!batch.length) throw AppError.badRequest('Selected batch does not exist or is inactive.');
        await client.query('INSERT INTO student_batches (student_id, batch_id) VALUES ($1, $2)', [
          student.student_id,
          b.batch_id,
        ]);
      }

      await client.query(
        `INSERT INTO student_status_changes (student_id, status_from, status_to, change_type, reason, changed_by)
         VALUES ($1, NULL, 'active', 'enrollment', $2, $3)`,
        [student.student_id, b.enrollment_reason || 'Enrolled by administrator', req.user.userId]
      );
      const invite = await createPasswordSetupLink(client, userId, 'invite', req.user.userId);
      return { student: { ...student, email: b.email }, invite };
    });

    res.status(201).json({
      message: 'Student enrolled. Share the link so they can set their password.',
      student: result.student,
      invite: result.invite,
    });
  },

  // POST /api/admin/students/:student_id/invite — new password setup link
  async regenerateStudentInvite(req, res) {
    const invite = await withTransaction(async (client) => {
      const { rows } = await client.query(
        `SELECT s.user_id, u.last_login, u.is_active
           FROM students s JOIN users u ON u.user_id = s.user_id
          WHERE s.student_id = $1`,
        [req.params.student_id]
      );
      if (!rows.length) throw AppError.notFound('Student not found');
      if (!rows[0].is_active) throw AppError.badRequest('Activate the student before sending a link.');
      return createPasswordSetupLink(client, rows[0].user_id, rows[0].last_login ? 'reset' : 'invite', req.user.userId);
    });
    res.json({ message: 'New password setup link created.', invite });
  },

  async updateStudent(req, res) {
    const studentId = req.params.student_id;
    const b = req.body;

    const student = await withTransaction(async (client) => {
      const { rows: existing } = await client.query(
        'SELECT student_id, user_id FROM students WHERE student_id = $1 FOR UPDATE',
        [studentId]
      );
      if (!existing.length) throw AppError.notFound('Student not found');
      const { user_id: userId } = existing[0];

      if (b.email && userId) {
        await client.query(
          'UPDATE users SET email = $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2',
          [b.email, userId]
        );
      }

      const { rows } = await client.query(
        `UPDATE students SET
           full_name = COALESCE($1, full_name),
           phone = COALESCE($2, phone),
           current_level_id = COALESCE($3, current_level_id),
           payment_window = COALESCE($4, payment_window),
           date_of_birth = COALESCE($5, date_of_birth),
           gender = COALESCE($6, gender),
           address = COALESCE($7, address),
           emergency_contact_name = COALESCE($8, emergency_contact_name),
           emergency_contact = COALESCE($9, emergency_contact),
           updated_at = CURRENT_TIMESTAMP
         WHERE student_id = $10
         RETURNING *`,
        [
          b.full_name, b.phone, b.current_level_id, b.payment_window, b.date_of_birth,
          b.gender, b.address, b.emergency_contact_name, b.emergency_contact, studentId,
        ]
      );

      // Batch assignment lives in student_batches (one active row per student).
      if (b.batch_id !== undefined) {
        const { rows: current } = await client.query(
          'SELECT batch_id FROM student_batches WHERE student_id = $1 AND is_active = true',
          [studentId]
        );
        const currentBatchId = current[0]?.batch_id || null;

        if (currentBatchId !== b.batch_id) {
          if (currentBatchId) {
            await client.query(
              `UPDATE student_batches
                  SET is_active = false, left_date = CURRENT_DATE, switching_reason = 'Changed by administrator'
                WHERE student_id = $1 AND is_active = true`,
              [studentId]
            );
          }
          if (b.batch_id) {
            const { rows: batch } = await client.query(
              'SELECT batch_id FROM batches WHERE batch_id = $1 AND is_active = true',
              [b.batch_id]
            );
            if (!batch.length) throw AppError.badRequest('Selected batch does not exist or is inactive.');
            // Re-activate an earlier membership or create a new one; the
            // enforce_batch_capacity trigger rejects full batches.
            await client.query(
              `INSERT INTO student_batches (student_id, batch_id, joined_date, is_active)
               VALUES ($1, $2, CURRENT_DATE, true)
               ON CONFLICT (student_id, batch_id)
               DO UPDATE SET is_active = true, joined_date = CURRENT_DATE, left_date = NULL`,
              [studentId, b.batch_id]
            );
          }
          if (currentBatchId && b.batch_id) {
            // status_from/status_to hold the batch names (column is varchar(50)).
            await client.query(
              `INSERT INTO student_status_changes
                 (student_id, status_from, status_to, change_type, reason, changed_by)
               SELECT $1, left(f.batch_name, 50), left(t.batch_name, 50), 'batch_switch',
                      'Batch changed by administrator', $4
                 FROM batches f, batches t
                WHERE f.batch_id = $2 AND t.batch_id = $3`,
              [studentId, currentBatchId, b.batch_id, req.user.userId]
            );
          }
        }
      }
      return rows[0];
    });

    res.json({ message: 'Student updated successfully', student });
  },

  async deleteStudent(req, res) {
    const { rows } = await pool.query('SELECT student_id, user_id FROM students WHERE student_id = $1', [
      req.params.student_id,
    ]);
    if (!rows.length) throw AppError.notFound('Student not found');

    try {
      await withTransaction(async (client) => {
        // Deleting the user cascades to the student profile, so no login
        // account is left behind.
        if (rows[0].user_id) {
          await client.query('DELETE FROM users WHERE user_id = $1', [rows[0].user_id]);
        } else {
          await client.query('DELETE FROM students WHERE student_id = $1', [rows[0].student_id]);
        }
      });
    } catch (err) {
      // 23001 = RESTRICT violation, 23503 = generic foreign-key violation
      if (err.code === '23001' || err.code === '23503') {
        throw AppError.conflict(
          'This student has fee payment records and cannot be deleted. Deactivate the student instead.'
        );
      }
      throw err;
    }
    res.json({ message: 'Student deleted successfully' });
  },

  async changeStudentStatus(req, res) {
    const { status, reason, detailed_feedback } = req.body;
    const makeActive = status === 'active';

    const student = await withTransaction(async (client) => {
      const { rows } = await client.query(
        'SELECT student_id, user_id, is_active FROM students WHERE student_id = $1 FOR UPDATE',
        [req.params.student_id]
      );
      if (!rows.length) throw AppError.notFound('Student not found');
      const before = rows[0];

      if (before.is_active === makeActive && status !== 'discontinued') {
        return { ...before, status: studentStatusLabel(before) };
      }

      const { rows: updated } = await client.query(
        `UPDATE students SET
           is_active = $1,
           discontinuation_date = CASE WHEN $1 THEN NULL ELSE CURRENT_DATE END,
           discontinuation_reason = CASE WHEN $1 THEN NULL ELSE $2 END,
           updated_at = CURRENT_TIMESTAMP
         WHERE student_id = $3
         RETURNING *`,
        [makeActive, reason || null, before.student_id]
      );

      // Login access follows the student's status.
      if (before.user_id) {
        await client.query('UPDATE users SET is_active = $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2', [
          makeActive,
          before.user_id,
        ]);
      }

      // A discontinued student frees their seat in the batch.
      if (status === 'discontinued') {
        await client.query(
          `UPDATE student_batches
              SET is_active = false, left_date = CURRENT_DATE, switching_reason = 'Discontinued'
            WHERE student_id = $1 AND is_active = true`,
          [before.student_id]
        );
      }

      await client.query(
        `INSERT INTO student_status_changes
           (student_id, status_from, status_to, change_type, reason, detailed_feedback, changed_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          before.student_id,
          studentStatusLabel(before),
          status,
          makeActive ? 'rejoining' : 'discontinuation',
          reason || (makeActive ? 'Reactivated by administrator' : 'Deactivated by administrator'),
          detailed_feedback || null,
          req.user.userId,
        ]
      );
      return { ...updated[0], status: makeActive ? 'active' : status };
    });

    res.json({ message: 'Student status updated successfully', student });
  }
};
