const pool = require('../config/database');
const AppError = require('../utils/AppError');
const { wrapController } = require('../utils/asyncHandler');
const { uiStatus } = require('./feeController');

// Weighted 0–100 score from attendance, practice, performances and exams.
const calculatePerformanceScore = (student, attendancePercentage) => {
  const attendanceScore = attendancePercentage * 0.3;
  const practiceScore = Math.min((Number(student.total_practice_hours || 0) / 100) * 100, 100) * 0.2;
  const performanceScore = Math.min((Number(student.total_performances || 0) / 5) * 100, 100) * 0.2;
  const examScore = Math.min((Number(student.total_exams_attended || 0) / 2) * 100, 100) * 0.2;
  return Math.round(Math.min(attendanceScore + practiceScore + performanceScore + examScore + 10, 100));
};

const studentController = {
  // GET /api/students/profile
  async getProfile(req, res) {
    const { rows } = await pool.query(
      `SELECT s.*, l.level_name, l.level_code, l.level_number, u.email,
              b.batch_name, b.schedule, b."time", t.full_name AS teacher_name
         FROM students s
         LEFT JOIN levels l ON s.current_level_id = l.level_id
         LEFT JOIN users u ON s.user_id = u.user_id
         LEFT JOIN student_batches sb ON s.student_id = sb.student_id AND sb.is_active = true
         LEFT JOIN batches b ON sb.batch_id = b.batch_id
         LEFT JOIN teachers t ON b.teacher_id = t.teacher_id
        WHERE s.user_id = $1`,
      [req.user.userId]
    );
    if (!rows.length) throw AppError.notFound('Student profile not found');
    res.json(rows[0]);
  },

  // GET /api/students/dashboard
  async getDashboard(req, res) {
    const { rows: studentRows } = await pool.query(
      `SELECT s.student_id, s.roll_number, s.full_name, s.payment_window, s.current_level_id,
              s.total_practice_hours, s.total_performances, s.total_exams_attended,
              l.level_name, l.level_number, b.batch_name, b.schedule, b."time", t.full_name AS teacher_name,
              COALESCE(fs.discount_percentage, 0)::float AS discount
         FROM students s
         LEFT JOIN levels l ON s.current_level_id = l.level_id
         LEFT JOIN student_batches sb ON s.student_id = sb.student_id AND sb.is_active = true
         LEFT JOIN batches b ON sb.batch_id = b.batch_id
         LEFT JOIN teachers t ON b.teacher_id = t.teacher_id
         LEFT JOIN fee_structure fs
                ON fs.level_id = s.current_level_id AND fs.payment_window = s.payment_window AND fs.is_active
        WHERE s.user_id = $1`,
      [req.user.userId]
    );
    const student = studentRows[0];
    if (!student) throw AppError.notFound('Student not found');

    const [{ rows: att }, { rows: fee }, { rows: notices }] = await Promise.all([
      pool.query(
        `SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status = 'present')::int AS present
           FROM attendance
          WHERE student_id = $1 AND attendance_date >= CURRENT_DATE - INTERVAL '30 days'`,
        [student.student_id]
      ),
      pool.query(
        `SELECT status, due_date, late_fee_applied, total_amount
           FROM fee_payments WHERE student_id = $1
          ORDER BY due_date DESC, payment_id DESC LIMIT 1`,
        [student.student_id]
      ),
      pool.query(
        `SELECT notice_id AS id, title, created_at AS date, priority
           FROM notices
          WHERE is_active = true AND COALESCE(status, 'published') = 'published'
            AND (expiry_date IS NULL OR expiry_date >= CURRENT_DATE)
            AND target_audience IN ('all', 'students')
          ORDER BY created_at DESC LIMIT 5`
      ),
    ]);

    const attendancePercentage = att[0].total > 0 ? Math.round((att[0].present / att[0].total) * 100) : 0;
    const latestFee = fee[0];
    const lateFee = latestFee ? parseFloat(latestFee.late_fee_applied || 0) : 0;

    res.json({
      full_name: student.full_name,
      attendancePercentage,
      // No payment record yet means nothing is due.
      feeStatus: latestFee ? uiStatus(latestFee.status, latestFee.due_date) : 'paid',
      roll_number: student.roll_number,
      payment_window: student.payment_window,
      discount: student.discount,
      next_due_date: latestFee ? latestFee.due_date : null,
      has_late_fee: lateFee > 0,
      late_fee_amount: lateFee,
      performance_score: calculatePerformanceScore(student, attendancePercentage),
      current_level_id: student.current_level_id || 1,
      level_name: student.level_name,
      batchInfo: student.batch_name
        ? {
            batchName: student.batch_name,
            schedule: student.schedule,
            time: student.time,
            teacherName: student.teacher_name,
          }
        : null,
      recentNotices: notices,
      upcomingClasses: [],
    });
  },

  // PUT /api/students/profile — allowlisted fields only
  async updateProfile(req, res) {
    const { phone, address, emergency_contact_name, emergency_contact } = req.body;
    const { rows } = await pool.query(
      `UPDATE students SET
         phone = COALESCE($1, phone),
         address = COALESCE($2, address),
         emergency_contact_name = COALESCE($3, emergency_contact_name),
         emergency_contact = COALESCE($4, emergency_contact),
         updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $5
       RETURNING *`,
      [phone, address, emergency_contact_name, emergency_contact, req.user.userId]
    );
    if (!rows.length) throw AppError.notFound('Student not found');
    res.json(rows[0]);
  },

  // PUT /api/students/payment-window
  async updatePaymentWindow(req, res) {
    const { rows } = await pool.query(
      `UPDATE students SET payment_window = $1, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = $2 RETURNING *`,
      [req.body.payment_window, req.user.userId]
    );
    if (!rows.length) throw AppError.notFound('Student not found');
    res.json(rows[0]);
  },
};

module.exports = wrapController(studentController);
module.exports.calculatePerformanceScore = calculatePerformanceScore;
