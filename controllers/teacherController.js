const pool = require('../config/database');
const AppError = require('../utils/AppError');
const { wrapController } = require('../utils/asyncHandler');
const { teacherIdForUser } = require('./attendanceController');

const teacherController = {
  // GET /api/teachers/profile
  async getProfile(req, res) {
    const { rows } = await pool.query(
      `SELECT t.teacher_id, t.user_id, t.full_name, u.email, t.phone, t.specialization,
              t.experience_years, t.qualifications, t.bio, t.is_senior,
              t.profile_photo_url AS photo_url, t.is_active,
              COALESCE(t.average_rating, 0)::float AS avg_rating, t.total_reviews,
              COUNT(DISTINCT s.student_id)::int AS total_students
         FROM teachers t
         LEFT JOIN users u ON t.user_id = u.user_id
         LEFT JOIN batches b ON t.teacher_id = b.teacher_id
         LEFT JOIN student_batches sb ON b.batch_id = sb.batch_id AND sb.is_active = true
         LEFT JOIN students s ON sb.student_id = s.student_id AND s.is_active = true
        WHERE t.user_id = $1
        GROUP BY t.teacher_id, u.email`,
      [req.user.userId]
    );
    if (!rows.length) throw AppError.notFound('Teacher profile not found');
    res.json(rows[0]);
  },

  // GET /api/teachers/dashboard
  async getDashboard(req, res) {
    const teacherId = await teacherIdForUser(req.user.userId);
    const { rows } = await pool.query(
      `SELECT
         (SELECT COUNT(DISTINCT s.student_id) FROM students s
            JOIN student_batches sb ON s.student_id = sb.student_id AND sb.is_active = true
            JOIN batches b ON sb.batch_id = b.batch_id
           WHERE b.teacher_id = $1 AND s.is_active = true)::int AS total_students,
         (SELECT COUNT(*) FROM batches WHERE teacher_id = $1)::int AS total_batches,
         (SELECT COALESCE(average_rating, 0) FROM teachers WHERE teacher_id = $1)::float AS avg_rating`,
      [teacherId]
    );
    const { rows: recent } = await pool.query(
      `SELECT tr.review_id, tr.overall_rating, tr.review_month, tr.review_year, tr.created_at,
              s.full_name AS student_name, s.roll_number
         FROM teacher_reviews tr JOIN students s ON s.student_id = tr.student_id
        WHERE tr.teacher_id = $1
        ORDER BY tr.created_at DESC LIMIT 5`,
      [teacherId]
    );
    // Batch schedules are free text such as "Mon, Wed, Fri" or "Monday/Thursday";
    // a batch meets today when its schedule mentions today's weekday.
    const { rows: today } = await pool.query(
      `SELECT b.batch_id, b.batch_name, b.schedule, b."time", b.room,
              COUNT(DISTINCT sb.student_id)::int AS students,
              EXISTS (SELECT 1 FROM attendance a
                       WHERE a.batch_id = b.batch_id AND a.attendance_date = CURRENT_DATE) AS attendance_marked
         FROM batches b
         LEFT JOIN student_batches sb ON sb.batch_id = b.batch_id AND sb.is_active = true
        WHERE b.teacher_id = $1 AND b.is_active = true
          AND b.schedule ~* ('(^|[^a-z])(' || trim(to_char(CURRENT_DATE, 'Dy')) || '|daily|everyday)')
        GROUP BY b.batch_id
        ORDER BY b."time"`,
      [teacherId]
    );
    res.json({
      ...rows[0],
      recent_reviews: recent,
      today_batches: today,
      classes_today: today.length,
      pending_attendance: today.filter((b) => !b.attendance_marked).length,
    });
  },

  // PUT /api/teachers/profile — allowlisted self-service fields only
  async updateProfile(req, res) {
    const b = req.body;
    const { rows } = await pool.query(
      `UPDATE teachers SET
         phone = COALESCE($1, phone),
         bio = COALESCE($2, bio),
         profile_photo_url = CASE WHEN $3::boolean THEN $4 ELSE profile_photo_url END,
         specialization = COALESCE($5, specialization),
         qualifications = COALESCE($6, qualifications),
         experience_years = COALESCE($7, experience_years),
         updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $8
       RETURNING teacher_id, full_name, phone, bio, specialization, qualifications,
                 experience_years, profile_photo_url AS photo_url`,
      [
        b.phone, b.bio, b.photo_url !== undefined, b.photo_url ?? null,
        b.specialization, b.qualifications, b.experience_years, req.user.userId,
      ]
    );
    if (!rows.length) throw AppError.notFound('Teacher not found');
    res.json({ message: 'Profile updated successfully', teacher: rows[0] });
  },

  // GET /api/teachers/students
  async getStudents(req, res) {
    const teacherId = await teacherIdForUser(req.user.userId);
    const { rows } = await pool.query(
      `SELECT s.student_id, s.roll_number, s.full_name, u.email, s.phone,
              l.level_name, b.batch_id, b.batch_name,
              CASE WHEN s.is_active THEN 'active' ELSE 'inactive' END AS status,
              COALESCE(s.attendance_percentage, 0)::float AS attendance_percentage
         FROM students s
         LEFT JOIN users u ON s.user_id = u.user_id
         JOIN student_batches sb ON s.student_id = sb.student_id AND sb.is_active = true
         JOIN batches b ON sb.batch_id = b.batch_id
         LEFT JOIN levels l ON s.current_level_id = l.level_id
        WHERE b.teacher_id = $1 AND s.is_active = true
        ORDER BY s.roll_number NULLS LAST, s.full_name`,
      [teacherId]
    );
    res.json(rows);
  },

  // GET /api/teachers/batches
  async getBatches(req, res) {
    const teacherId = await teacherIdForUser(req.user.userId);
    const { rows } = await pool.query(
      `SELECT b.batch_id, b.batch_name, b.level_id, l.level_name, b.schedule, b."time", b.room,
              b.current_enrolled, b.max_students, b.is_active,
              COUNT(s.student_id)::int AS active_students
         FROM batches b
         LEFT JOIN levels l ON b.level_id = l.level_id
         LEFT JOIN student_batches sb ON b.batch_id = sb.batch_id AND sb.is_active = true
         LEFT JOIN students s ON sb.student_id = s.student_id AND s.is_active = true
        WHERE b.teacher_id = $1
        GROUP BY b.batch_id, l.level_name
        ORDER BY b.batch_name`,
      [teacherId]
    );
    res.json(rows);
  },
};

module.exports = wrapController(teacherController);
