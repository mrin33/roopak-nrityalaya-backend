const pool = require('../config/database');
const { withTransaction } = require('../config/database');
const AppError = require('../utils/AppError');
const { wrapController } = require('../utils/asyncHandler');
const { unusablePasswordHash, generateOneTimeToken } = require('../utils/security');
const { frontendUrl, inviteTokenTtlHours } = require('../config/env');

// ───────────────────────────── helpers ─────────────────────────────

// Create a one-time password-setup link for a user. Previous unused links
// for that user are invalidated. Returns the plaintext link ONCE.
const createPasswordSetupLink = async (client, userId, purpose, createdBy) => {
  await client.query(
    'UPDATE password_setup_tokens SET used_at = now() WHERE user_id = $1 AND used_at IS NULL',
    [userId]
  );
  const { token, tokenHash } = generateOneTimeToken();
  const { rows } = await client.query(
    `INSERT INTO password_setup_tokens (user_id, token_hash, purpose, expires_at, created_by)
     VALUES ($1, $2, $3, now() + make_interval(hours => $4), $5)
     RETURNING expires_at`,
    [userId, tokenHash, purpose, inviteTokenTtlHours, createdBy]
  );
  return {
    url: `${frontendUrl}/set-password?token=${encodeURIComponent(token)}`,
    expires_at: rows[0].expires_at,
    purpose,
  };
};

const studentStatusLabel = (row) => (row.is_active ? 'active' : 'inactive');

const adminController = {
  // ============================ DASHBOARD ============================
  async getDashboard(req, res) {
    const { rows } = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM students WHERE is_active = true)::int AS total_students,
        (SELECT COUNT(*) FROM teachers WHERE is_active = true)::int AS total_teachers,
        (SELECT COUNT(*) FROM batches)::int AS total_batches,
        (SELECT COALESCE(SUM(total_amount), 0) FROM fee_payments
          WHERE status = 'completed'
            AND date_trunc('month', payment_date) = date_trunc('month', CURRENT_DATE))::float AS monthly_revenue,
        (SELECT COUNT(*) FROM gallery_requests WHERE status = 'pending')::int AS pending_gallery_requests,
        (SELECT COUNT(*) FROM fee_payments
          WHERE status = 'pending' AND due_date < CURRENT_DATE)::int AS overdue_payments
    `);
    res.json(rows[0]);
  },

  // ======================== STUDENT MANAGEMENT =======================
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
            await client.query(
              `INSERT INTO student_status_changes
                 (student_id, status_from, status_to, change_type, reason, changed_by)
               VALUES ($1, $2, $3, 'batch_switch', 'Batch changed by administrator', $4)`,
              [studentId, String(currentBatchId), String(b.batch_id), req.user.userId]
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
  },

  // ======================== TEACHER MANAGEMENT =======================
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
  },

  // ========================= BATCH MANAGEMENT ========================
  async getAllBatches(req, res) {
    const { rows } = await pool.query(`
      SELECT b.*, l.level_name, t.full_name AS teacher_name,
             COUNT(sb.student_id)::int AS active_students
        FROM batches b
        LEFT JOIN levels l ON b.level_id = l.level_id
        LEFT JOIN teachers t ON b.teacher_id = t.teacher_id
        LEFT JOIN student_batches sb ON sb.batch_id = b.batch_id AND sb.is_active = true
       GROUP BY b.batch_id, l.level_name, t.full_name
       ORDER BY b.batch_name
    `);
    res.json(rows);
  },

  async createBatch(req, res) {
    const b = req.body;
    const { rows: dup } = await pool.query('SELECT 1 FROM batches WHERE lower(batch_name) = lower($1)', [
      b.batch_name,
    ]);
    if (dup.length) throw AppError.conflict('Batch name already exists');

    const { rows: teacher } = await pool.query('SELECT is_active FROM teachers WHERE teacher_id = $1', [
      b.teacher_id,
    ]);
    if (!teacher.length) throw AppError.badRequest('Teacher not found');
    if (!teacher[0].is_active) throw AppError.badRequest('Cannot assign an inactive teacher');

    const { rows: level } = await pool.query('SELECT 1 FROM levels WHERE level_id = $1', [b.level_id]);
    if (!level.length) throw AppError.badRequest('Level not found');

    const { rows } = await pool.query(
      `INSERT INTO batches
         (batch_name, level_id, teacher_id, schedule, "time", room, max_students, start_date, end_date, current_enrolled)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 0)
       RETURNING *`,
      [
        b.batch_name, b.level_id, b.teacher_id, b.schedule, b.time, b.room || null,
        b.max_students || 15, b.start_date || null, b.end_date || null,
      ]
    );
    res.status(201).json({ message: 'Batch created successfully', batch: rows[0] });
  },

  async updateBatch(req, res) {
    const b = req.body;
    const batchId = req.params.batch_id;

    const { rows: existing } = await pool.query('SELECT batch_id FROM batches WHERE batch_id = $1', [batchId]);
    if (!existing.length) throw AppError.notFound('Batch not found');

    if (b.batch_name) {
      const { rows: dup } = await pool.query(
        'SELECT 1 FROM batches WHERE lower(batch_name) = lower($1) AND batch_id <> $2',
        [b.batch_name, batchId]
      );
      if (dup.length) throw AppError.conflict('Batch name already exists');
    }
    if (b.teacher_id) {
      const { rows: teacher } = await pool.query('SELECT is_active FROM teachers WHERE teacher_id = $1', [
        b.teacher_id,
      ]);
      if (!teacher.length) throw AppError.badRequest('Teacher not found');
      if (!teacher[0].is_active) throw AppError.badRequest('Cannot assign an inactive teacher');
    }
    if (b.max_students) {
      const { rows: count } = await pool.query(
        'SELECT COUNT(*)::int AS n FROM student_batches WHERE batch_id = $1 AND is_active = true',
        [batchId]
      );
      if (b.max_students < count[0].n) {
        throw AppError.badRequest(`Capacity cannot be lower than the ${count[0].n} students currently enrolled.`);
      }
    }

    const { rows } = await pool.query(
      `UPDATE batches SET
         batch_name = COALESCE($1, batch_name),
         level_id = COALESCE($2, level_id),
         teacher_id = COALESCE($3, teacher_id),
         schedule = COALESCE($4, schedule),
         "time" = COALESCE($5, "time"),
         room = COALESCE($6, room),
         max_students = COALESCE($7, max_students),
         is_active = COALESCE($8, is_active),
         start_date = CASE WHEN $9::boolean THEN $10::date ELSE start_date END,
         end_date = CASE WHEN $11::boolean THEN $12::date ELSE end_date END,
         updated_at = CURRENT_TIMESTAMP
       WHERE batch_id = $13
       RETURNING *`,
      [
        b.batch_name, b.level_id, b.teacher_id, b.schedule, b.time, b.room, b.max_students, b.is_active,
        b.start_date !== undefined, b.start_date ?? null, b.end_date !== undefined, b.end_date ?? null, batchId,
      ]
    );
    res.json({ message: 'Batch updated successfully', batch: rows[0] });
  },

  async deleteBatch(req, res) {
    const batchId = req.params.batch_id;
    const { rows } = await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM batches WHERE batch_id = $1)::int AS exists,
         (SELECT COUNT(*) FROM student_batches WHERE batch_id = $1 AND is_active = true)::int AS students,
         (SELECT COUNT(*) FROM attendance WHERE batch_id = $1)::int AS attendance`,
      [batchId]
    );
    const info = rows[0];
    if (!info.exists) throw AppError.notFound('Batch not found');
    if (info.students > 0) {
      throw AppError.badRequest('Cannot delete batch with active students. Transfer or remove students first.');
    }
    if (info.attendance > 0) {
      throw AppError.conflict(
        'This batch has attendance history, which would be lost. Mark the batch inactive instead.'
      );
    }
    await pool.query('DELETE FROM batches WHERE batch_id = $1', [batchId]);
    res.json({ message: 'Batch deleted successfully' });
  },

  // ========================== FEE MANAGEMENT =========================
  async getAllFees(req, res) {
    const { status, month, year, student_id } = req.validatedQuery || {};
    const values = [];
    const where = [];

    if (status === 'paid' || status === 'completed') where.push("fp.status = 'completed'");
    else if (status === 'overdue') where.push("fp.status = 'pending' AND fp.due_date < CURRENT_DATE");
    else if (status && status !== 'all') {
      values.push(status);
      where.push(`fp.status = $${values.length}`);
    }
    if (month && year) {
      values.push(month, year);
      where.push(
        `EXTRACT(MONTH FROM fp.due_date) = $${values.length - 1} AND EXTRACT(YEAR FROM fp.due_date) = $${values.length}`
      );
    }
    if (student_id) {
      values.push(student_id);
      where.push(`fp.student_id = $${values.length}`);
    }

    const { rows } = await pool.query(
      `SELECT fp.*,
              CASE
                WHEN fp.status = 'completed' THEN 'paid'
                WHEN fp.status = 'pending' AND fp.due_date < CURRENT_DATE THEN 'overdue'
                ELSE fp.status
              END AS payment_status,
              s.roll_number, s.full_name AS student_name, s.payment_window
         FROM fee_payments fp
         JOIN students s ON fp.student_id = s.student_id
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY fp.due_date DESC, fp.payment_id DESC`,
      values
    );
    res.json(rows);
  },

  async recordFeePayment(req, res) {
    const b = req.body;
    const { rows: studentRows } = await pool.query(
      `SELECT s.student_id, s.current_level_id, s.payment_window, fs.fee_structure_id
         FROM students s
         LEFT JOIN fee_structure fs
                ON fs.level_id = s.current_level_id AND fs.payment_window = s.payment_window AND fs.is_active
        WHERE s.student_id = $1`,
      [b.student_id]
    );
    if (!studentRows.length) throw AppError.badRequest('Student not found');
    const student = studentRows[0];

    const today = new Date().toISOString().slice(0, 10);
    const paymentDate = b.payment_date || today;
    const [year, month] = b.month
      ? b.month.split('-').map(Number)
      : [Number(paymentDate.slice(0, 4)), Number(paymentDate.slice(5, 7))];
    const dueDate = b.due_date || paymentDate;
    const lateFee = b.late_fee || 0;
    const daysLate = Math.max(0, Math.round((Date.parse(paymentDate) - Date.parse(dueDate)) / 86400000));
    const status = b.status || 'completed';

    const { rows } = await pool.query(
      `INSERT INTO fee_payments
         (student_id, fee_structure_id, payment_month, payment_year, amount_paid, late_fee_applied,
          total_amount, payment_date, due_date, is_late, days_late, payment_method, transaction_id, status, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       RETURNING *`,
      [
        student.student_id, student.fee_structure_id || null, month, year, b.amount_paid, lateFee,
        Number(b.amount_paid) + Number(lateFee), paymentDate, dueDate, daysLate > 0, daysLate,
        b.payment_method || null, b.transaction_id || null, status, b.notes || null,
      ]
    );
    res.status(201).json({ message: 'Fee payment recorded successfully', payment: rows[0] });
  },

  // ============================ ANALYTICS ============================
  async getBestTeachers(req, res) {
    const { rows } = await pool.query(`
      SELECT t.teacher_id, t.full_name AS name, t.experience_years,
             COALESCE(r.avg_rating, 0)::float AS avg_rating,
             COALESCE(r.review_count, 0)::int AS total_reviews,
             COUNT(DISTINCT s.student_id)::int AS total_students
        FROM teachers t
        LEFT JOIN (
          SELECT teacher_id, AVG(overall_rating) AS avg_rating, COUNT(*) AS review_count
            FROM teacher_reviews GROUP BY teacher_id
        ) r ON r.teacher_id = t.teacher_id
        LEFT JOIN batches b ON b.teacher_id = t.teacher_id
        LEFT JOIN student_batches sb ON sb.batch_id = b.batch_id AND sb.is_active = true
        LEFT JOIN students s ON s.student_id = sb.student_id AND s.is_active = true
       WHERE t.is_active = true
       GROUP BY t.teacher_id, r.avg_rating, r.review_count
       ORDER BY avg_rating DESC, total_students DESC
       LIMIT 3
    `);
    res.json(rows);
  },

  async getBestStudents(req, res) {
    const { rows } = await pool.query(`
      SELECT s.student_id, s.roll_number, s.full_name AS name,
             COALESCE(s.total_practice_hours, 0)::float AS practice_hours,
             COALESCE(s.total_performances, 0)::int AS total_performances,
             COALESCE(a.attendance, 0)::float AS attendance,
             COALESCE(r.performance_score, 0)::float AS performance_score
        FROM students s
        LEFT JOIN (
          SELECT student_id,
                 ROUND(COUNT(*) FILTER (WHERE status = 'present') * 100.0 / NULLIF(COUNT(*), 0), 1) AS attendance
            FROM attendance
           WHERE attendance_date >= CURRENT_DATE - INTERVAL '90 days'
           GROUP BY student_id
        ) a ON a.student_id = s.student_id
        LEFT JOIN (
          SELECT student_id, ROUND(AVG(overall_rating) * 20, 1) AS performance_score
            FROM teacher_reviews GROUP BY student_id
        ) r ON r.student_id = s.student_id
       WHERE s.is_active = true
       ORDER BY performance_score DESC, attendance DESC
       LIMIT 10
    `);
    res.json(rows);
  },

  async getEnrollmentTrends(req, res) {
    const { rows } = await pool.query(`
      SELECT TO_CHAR(m.month, 'Mon YYYY') AS month, COUNT(s.student_id)::int AS enrolled
        FROM generate_series(
               date_trunc('month', CURRENT_DATE) - INTERVAL '5 months',
               date_trunc('month', CURRENT_DATE), INTERVAL '1 month') AS m(month)
        LEFT JOIN students s ON date_trunc('month', s.enrollment_date) = m.month
       GROUP BY m.month
       ORDER BY m.month
    `);
    res.json(rows);
  },

  async getDiscontinuationReasons(req, res) {
    const { rows } = await pool.query(`
      SELECT reason, COUNT(*)::int AS count
        FROM student_status_changes
       WHERE change_type = 'discontinuation'
       GROUP BY reason
       ORDER BY count DESC
    `);
    res.json(rows);
  },

  // ========================== STATUS CHANGES =========================
  async getStatusChanges(req, res) {
    const { change_type } = req.validatedQuery || {};
    const values = [];
    let filter = '';
    if (change_type && change_type !== 'all') {
      values.push(change_type);
      filter = 'WHERE sc.change_type = $1';
    }
    const { rows } = await pool.query(
      `SELECT sc.*,
              sc.status_from AS old_status, sc.status_to AS new_status, sc.created_at AS changed_at,
              s.full_name AS student_name, s.roll_number, u.email AS changed_by_email
         FROM student_status_changes sc
         JOIN students s ON sc.student_id = s.student_id
         LEFT JOIN users u ON u.user_id = sc.changed_by
        ${filter}
        ORDER BY sc.created_at DESC`,
      values
    );
    res.json(rows);
  },
};

module.exports = wrapController(adminController);
module.exports.createPasswordSetupLink = createPasswordSetupLink;
