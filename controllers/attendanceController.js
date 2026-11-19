const pool = require('../config/database');
const { withTransaction } = require('../config/database');
const AppError = require('../utils/AppError');
const Student = require('../models/Student');
const { wrapController } = require('../utils/asyncHandler');

const teacherIdForUser = async (userId, db = pool) => {
  const { rows } = await db.query('SELECT teacher_id FROM teachers WHERE user_id = $1', [userId]);
  if (!rows.length) throw AppError.notFound('Teacher profile not found');
  return rows[0].teacher_id;
};

// A teacher may act on a batch they own or have been assigned via an
// active batch transfer for that date.
const assertTeacherCanManageBatch = async (teacherId, batchId, date, db = pool) => {
  const { rows } = await db.query(
    `SELECT 1 FROM batches b
      WHERE b.batch_id = $1
        AND (b.teacher_id = $2
             OR EXISTS (SELECT 1 FROM batch_transfers bt
                         WHERE bt.batch_id = b.batch_id AND bt.to_teacher_id = $2
                           AND (bt.is_permanent OR bt.transfer_date = $3::date)))`,
    [batchId, teacherId, date || new Date().toISOString().slice(0, 10)]
  );
  if (!rows.length) throw AppError.forbidden('You do not teach this batch.');
};

const attendanceController = {
  // POST /api/teachers/attendance
  async markAttendance(req, res) {
    const { batch_id, attendance_date, records } = req.body;
    const teacherId = await teacherIdForUser(req.user.userId);
    await assertTeacherCanManageBatch(teacherId, batch_id, attendance_date);

    const saved = await withTransaction(async (client) => {
      // Only students actively enrolled in this batch may be marked.
      const { rows: enrolled } = await client.query(
        'SELECT student_id FROM student_batches WHERE batch_id = $1 AND is_active = true',
        [batch_id]
      );
      const allowed = new Set(enrolled.map((r) => r.student_id));
      const invalid = records.filter((r) => !allowed.has(r.student_id)).map((r) => r.student_id);
      if (invalid.length) {
        throw AppError.badRequest(`Students not enrolled in this batch: ${invalid.join(', ')}`);
      }

      const results = [];
      for (const r of records) {
        const { rows } = await client.query(
          `INSERT INTO attendance (student_id, batch_id, attendance_date, status, marked_by, notes)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (student_id, batch_id, attendance_date)
           DO UPDATE SET status = EXCLUDED.status, notes = EXCLUDED.notes, marked_by = EXCLUDED.marked_by
           RETURNING *`,
          [r.student_id, batch_id, attendance_date, r.status, teacherId, r.notes || null]
        );
        results.push(rows[0]);
      }

      // Keep the cached percentage on students in sync.
      await client.query(
        `UPDATE students s SET attendance_percentage = sub.pct
           FROM (SELECT student_id,
                        ROUND(COUNT(*) FILTER (WHERE status = 'present') * 100.0 / NULLIF(COUNT(*), 0), 2) AS pct
                   FROM attendance WHERE student_id = ANY($1::int[]) GROUP BY student_id) sub
          WHERE s.student_id = sub.student_id`,
        [records.map((r) => r.student_id)]
      );
      return results;
    });

    res.status(201).json({ message: 'Attendance marked successfully', attendance: saved });
  },

  // GET /api/teachers/batches/:batch_id/attendance?date=YYYY-MM-DD
  async getBatchAttendance(req, res) {
    const { batch_id } = req.params;
    const { date } = req.validatedQuery;
    if (req.user.role === 'teacher') {
      const teacherId = await teacherIdForUser(req.user.userId);
      await assertTeacherCanManageBatch(teacherId, batch_id, date);
    }
    const { rows } = await pool.query(
      `SELECT s.student_id, s.roll_number, s.full_name,
              COALESCE(a.status, 'unmarked') AS status, a.notes, a.attendance_id
         FROM students s
         JOIN student_batches sb ON s.student_id = sb.student_id AND sb.is_active = true
         LEFT JOIN attendance a
                ON a.student_id = s.student_id AND a.batch_id = sb.batch_id AND a.attendance_date = $1
        WHERE sb.batch_id = $2 AND s.is_active = true
        ORDER BY s.roll_number NULLS LAST, s.full_name`,
      [date, batch_id]
    );
    res.json(rows);
  },

  // GET /api/admin/attendance/summary
  async getAttendanceSummary(req, res) {
    const { start_date, end_date } = req.validatedQuery || {};
    const values = [];
    let dateFilter = '';
    if (start_date && end_date) {
      values.push(start_date, end_date);
      dateFilter = 'AND a.attendance_date BETWEEN $1 AND $2';
    }
    const { rows } = await pool.query(
      `SELECT b.batch_id, b.batch_name,
              COUNT(DISTINCT sb.student_id)::int AS total_students,
              COUNT(a.attendance_id) FILTER (WHERE a.status = 'present')::int AS total_present,
              COUNT(a.attendance_id) FILTER (WHERE a.status = 'absent')::int AS total_absent,
              COUNT(a.attendance_id) FILTER (WHERE a.status = 'late')::int AS total_late,
              ROUND(COUNT(a.attendance_id) FILTER (WHERE a.status = 'present') * 100.0
                    / NULLIF(COUNT(a.attendance_id), 0), 2)::float AS attendance_percentage
         FROM batches b
         LEFT JOIN student_batches sb ON b.batch_id = sb.batch_id AND sb.is_active = true
         LEFT JOIN attendance a ON a.batch_id = b.batch_id AND a.student_id = sb.student_id ${dateFilter}
        GROUP BY b.batch_id, b.batch_name
        ORDER BY b.batch_name`,
      values
    );
    res.json(rows);
  },

  // PUT /api/admin/attendance/:attendance_id
  async updateAttendance(req, res) {
    const { status, notes } = req.body;
    const { rows } = await pool.query(
      `UPDATE attendance SET status = COALESCE($1, status), notes = COALESCE($2, notes)
        WHERE attendance_id = $3 RETURNING *`,
      [status, notes, req.params.attendance_id]
    );
    if (!rows.length) throw AppError.notFound('Attendance record not found');
    res.json({ message: 'Attendance updated successfully', attendance: rows[0] });
  },

  // DELETE /api/admin/attendance/:attendance_id
  async deleteAttendance(req, res) {
    const { rowCount } = await pool.query('DELETE FROM attendance WHERE attendance_id = $1', [
      req.params.attendance_id,
    ]);
    if (!rowCount) throw AppError.notFound('Attendance record not found');
    res.json({ message: 'Attendance record deleted successfully' });
  },

  // GET /api/students/attendance
  async getStudentAttendance(req, res) {
    const studentId = await Student.idForUser(req.user.userId);
    if (!studentId) throw AppError.notFound('Student not found');
    const { month, year } = req.validatedQuery || {};

    const values = [studentId];
    let filter = '';
    if (month && year) {
      values.push(month, year);
      filter = 'AND EXTRACT(MONTH FROM a.attendance_date) = $2 AND EXTRACT(YEAR FROM a.attendance_date) = $3';
    }
    const { rows: records } = await pool.query(
      `SELECT a.attendance_id, a.attendance_date, a.attendance_date AS date, a.status, a.notes, b.batch_name
         FROM attendance a
         LEFT JOIN batches b ON a.batch_id = b.batch_id
        WHERE a.student_id = $1 ${filter}
        ORDER BY a.attendance_date DESC`,
      values
    );
    const { rows: stats } = await pool.query(
      `SELECT COUNT(*)::int AS total_classes,
              COUNT(*) FILTER (WHERE status = 'present')::int AS present,
              COUNT(*) FILTER (WHERE status = 'absent')::int AS absent,
              COUNT(*) FILTER (WHERE status = 'late')::int AS late,
              COALESCE(ROUND(COUNT(*) FILTER (WHERE status = 'present') * 100.0 / NULLIF(COUNT(*), 0), 2), 0)::float AS percentage
         FROM attendance WHERE student_id = $1`,
      [studentId]
    );
    res.json({ records, overall: stats[0] });
  },

  // GET /api/students/attendance/summary
  async getAttendanceSummaryForStudent(req, res) {
    const studentId = await Student.idForUser(req.user.userId);
    if (!studentId) throw AppError.notFound('Student not found');
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS "totalClasses",
              COUNT(*) FILTER (WHERE status = 'present')::int AS "presentCount",
              COALESCE(ROUND(COUNT(*) FILTER (WHERE status = 'present') * 100.0 / NULLIF(COUNT(*), 0), 2), 0)::float AS percentage
         FROM attendance
        WHERE student_id = $1 AND attendance_date >= CURRENT_DATE - INTERVAL '30 days'`,
      [studentId]
    );
    res.json(rows[0]);
  },
};

module.exports = wrapController(attendanceController);
module.exports.teacherIdForUser = teacherIdForUser;
module.exports.assertTeacherCanManageBatch = assertTeacherCanManageBatch;
