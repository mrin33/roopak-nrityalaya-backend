const pool = require('../config/database');
const AppError = require('../utils/AppError');
const Student = require('../models/Student');
const { wrapController } = require('../utils/asyncHandler');
const { teacherIdForUser } = require('./attendanceController');

const requireStudent = async (userId) => {
  const { rows } = await pool.query(
    'SELECT student_id, current_level_id FROM students WHERE user_id = $1',
    [userId]
  );
  if (!rows.length) throw AppError.notFound('Student not found');
  return rows[0];
};

const makeupClassController = {
  // GET /api/students/missed-classes — absences, flagged if already booked
  async getMissedClasses(req, res) {
    const { rows } = await pool.query(
      `SELECT a.attendance_id, a.attendance_date AS class_date, a.batch_id,
              b.batch_name, b."time", t.full_name AS teacher_name,
              NOT EXISTS (
                SELECT 1 FROM makeup_class_bookings m
                 WHERE m.student_id = a.student_id
                   AND m.original_batch_id = a.batch_id
                   AND m.original_class_date = a.attendance_date
                   AND m.status <> 'rejected'
              ) AS can_request_makeup
         FROM attendance a
         JOIN students s ON a.student_id = s.student_id
         JOIN batches b ON a.batch_id = b.batch_id
         LEFT JOIN teachers t ON b.teacher_id = t.teacher_id
        WHERE s.user_id = $1 AND a.status = 'absent'
        ORDER BY a.attendance_date DESC`,
      [req.user.userId]
    );
    res.json(rows);
  },

  // GET /api/students/makeup-batches — same-level batches with free seats
  async getAvailableBatches(req, res) {
    const student = await requireStudent(req.user.userId);
    const { rows } = await pool.query(
      `SELECT b.batch_id, b.batch_name, b.schedule, b."time", b.room, t.full_name AS teacher_name,
              (b.max_students - b.current_enrolled) AS available_slots
         FROM batches b
         LEFT JOIN teachers t ON b.teacher_id = t.teacher_id
        WHERE b.is_active = true AND b.level_id = $1
        ORDER BY b.batch_name`,
      [student.current_level_id]
    );
    res.json(rows);
  },

  // POST /api/students/makeup-requests
  async create(req, res) {
    const student = await requireStudent(req.user.userId);
    const { attendance_id, makeup_batch_id, makeup_class_date, notes } = req.body;

    // The absence must belong to this student (prevents IDOR).
    const { rows: absence } = await pool.query(
      `SELECT attendance_id, batch_id, attendance_date FROM attendance
        WHERE attendance_id = $1 AND student_id = $2 AND status = 'absent'`,
      [attendance_id, student.student_id]
    );
    if (!absence.length) throw AppError.badRequest('That class is not one of your absences.');

    const { rows: batch } = await pool.query(
      'SELECT level_id FROM batches WHERE batch_id = $1 AND is_active = true',
      [makeup_batch_id]
    );
    if (!batch.length) throw AppError.badRequest('Selected batch does not exist.');
    if (batch[0].level_id !== student.current_level_id) {
      throw AppError.badRequest('Makeup batch must be of the same level.');
    }

    const { rows: dup } = await pool.query(
      `SELECT 1 FROM makeup_class_bookings
        WHERE student_id = $1 AND original_batch_id = $2 AND original_class_date = $3 AND status <> 'rejected'`,
      [student.student_id, absence[0].batch_id, absence[0].attendance_date]
    );
    if (dup.length) throw AppError.conflict('A makeup class has already been requested for this absence.');

    const { rows } = await pool.query(
      `INSERT INTO makeup_class_bookings
         (student_id, original_batch_id, original_class_date, makeup_batch_id, makeup_class_date, status, notes)
       VALUES ($1, $2, $3, $4, $5, 'pending', $6)
       RETURNING *`,
      [student.student_id, absence[0].batch_id, absence[0].attendance_date, makeup_batch_id, makeup_class_date, notes || null]
    );
    res.status(201).json(rows[0]);
  },

  // GET /api/students/makeup-requests
  async getMyRequests(req, res) {
    const studentId = await Student.idForUser(req.user.userId);
    if (!studentId) throw AppError.notFound('Student not found');
    const { rows } = await pool.query(
      `SELECT m.*, ob.batch_name AS original_batch_name, mb.batch_name AS makeup_batch_name,
              mb."time" AS makeup_time, t.full_name AS approved_by_name
         FROM makeup_class_bookings m
         LEFT JOIN batches ob ON m.original_batch_id = ob.batch_id
         LEFT JOIN batches mb ON m.makeup_batch_id = mb.batch_id
         LEFT JOIN teachers t ON m.approved_by = t.teacher_id
        WHERE m.student_id = $1
        ORDER BY m.created_at DESC`,
      [studentId]
    );
    res.json(rows);
  },

  // GET /api/teachers/makeup-requests — requests to join this teacher's batches
  async getTeacherRequests(req, res) {
    const teacherId = await teacherIdForUser(req.user.userId);
    const { rows } = await pool.query(
      `SELECT m.*, s.full_name AS student_name, s.roll_number,
              ob.batch_name AS original_batch_name, mb.batch_name AS makeup_batch_name
         FROM makeup_class_bookings m
         JOIN students s ON s.student_id = m.student_id
         JOIN batches mb ON m.makeup_batch_id = mb.batch_id
         LEFT JOIN batches ob ON m.original_batch_id = ob.batch_id
        WHERE mb.teacher_id = $1
        ORDER BY (m.status = 'pending') DESC, m.makeup_class_date`,
      [teacherId]
    );
    res.json(rows);
  },

  // PUT /api/teachers/makeup-requests/:booking_id
  async updateStatus(req, res) {
    const teacherId = await teacherIdForUser(req.user.userId);
    const { status, notes } = req.body;
    const { rows } = await pool.query(
      `UPDATE makeup_class_bookings m
          SET status = $1, approved_by = $2,
              notes = CASE WHEN $3::text IS NULL THEN m.notes
                           ELSE concat_ws(E'\\n', m.notes, 'Teacher: ' || $3::text) END
         FROM batches b
        WHERE m.booking_id = $4 AND b.batch_id = m.makeup_batch_id AND b.teacher_id = $2
        RETURNING m.*`,
      [status, teacherId, notes || null, req.params.booking_id]
    );
    if (!rows.length) throw AppError.notFound('Makeup request not found');
    res.json(rows[0]);
  },
};

module.exports = wrapController(makeupClassController);
