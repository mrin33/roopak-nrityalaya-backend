const pool = require('../../config/database');
const { pageClause, sendPage } = require('../../utils/pagination');

// Admin analytics handlers; aggregated by controllers/adminController.js.
module.exports = {
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
          WHERE status = 'pending' AND due_date < CURRENT_DATE)::int AS overdue_payments,
        (SELECT COUNT(*) FROM contact_messages WHERE is_read = false)::int AS unread_messages
    `);
    res.json(rows[0]);
  },

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

  async getStatusChanges(req, res) {
    const { change_type, limit, offset } = req.validatedQuery || {};
    const values = [];
    let filter = '';
    if (change_type && change_type !== 'all') {
      values.push(change_type);
      filter = 'WHERE sc.change_type = $1';
    }
    const { rows } = await pool.query(
      `SELECT sc.*, COUNT(*) OVER() AS total_count,
              sc.status_from AS old_status, sc.status_to AS new_status, sc.created_at AS changed_at,
              s.full_name AS student_name, s.roll_number, u.email AS changed_by_email
         FROM student_status_changes sc
         JOIN students s ON sc.student_id = s.student_id
         LEFT JOIN users u ON u.user_id = sc.changed_by
        ${filter}
        ORDER BY sc.created_at DESC
        ${pageClause(values, { limit, offset })}`,
      values
    );
    sendPage(res, rows);
  }
};
