const pool = require('../config/database');
const { withTransaction } = require('../config/database');
const AppError = require('../utils/AppError');
const Student = require('../models/Student');
const { wrapController } = require('../utils/asyncHandler');
const { teacherIdForUser } = require('./attendanceController');

const reviewController = {
  // POST /api/teachers/reviews
  async create(req, res) {
    const b = req.body;
    const teacherId = await teacherIdForUser(req.user.userId);

    // A teacher may only review students enrolled in one of their batches.
    const { rows: link } = await pool.query(
      `SELECT 1 FROM student_batches sb JOIN batches bt ON bt.batch_id = sb.batch_id
        WHERE sb.student_id = $1 AND sb.is_active = true AND bt.teacher_id = $2`,
      [b.student_id, teacherId]
    );
    if (!link.length) throw AppError.forbidden('You can only review students in your batches.');

    const overall =
      Math.round(((b.technique_rating + b.rhythm_rating + b.creativity_rating + b.discipline_rating) / 4) * 100) / 100;

    const review = await withTransaction(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO teacher_reviews
           (teacher_id, student_id, review_month, review_year, technique_rating, rhythm_rating,
            creativity_rating, discipline_rating, overall_rating, review_text)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [
          teacherId, b.student_id, b.review_month, b.review_year, b.technique_rating, b.rhythm_rating,
          b.creativity_rating, b.discipline_rating, overall, b.review_text || null,
        ]
      );
      await client.query(
        `UPDATE teachers t SET
           average_rating = sub.avg, total_reviews = sub.cnt, updated_at = CURRENT_TIMESTAMP
           FROM (SELECT ROUND(AVG(overall_rating), 2) AS avg, COUNT(*) AS cnt
                   FROM teacher_reviews WHERE teacher_id = $1) sub
          WHERE t.teacher_id = $1`,
        [teacherId]
      );
      return rows[0];
    }).catch((err) => {
      if (err.code === '23505') {
        throw AppError.conflict('You have already reviewed this student for that month.');
      }
      throw err;
    });

    res.status(201).json(review);
  },

  // GET /api/students/reviews
  async getStudentReviews(req, res) {
    const studentId = await Student.idForUser(req.user.userId);
    if (!studentId) throw AppError.notFound('Student not found');
    const { month } = req.validatedQuery || {};
    const values = [studentId];
    let filter = '';
    if (month) {
      values.push(month);
      filter = 'AND tr.review_month = $2';
    }
    const { rows } = await pool.query(
      `SELECT tr.*, t.full_name AS teacher_name
         FROM teacher_reviews tr
         JOIN teachers t ON tr.teacher_id = t.teacher_id
        WHERE tr.student_id = $1 ${filter}
        ORDER BY tr.review_year DESC, tr.review_month DESC`,
      values
    );
    res.json(rows);
  },

  // GET /api/teachers/reviews
  async getTeacherReviews(req, res) {
    const { rows } = await pool.query(
      `SELECT tr.*, s.full_name AS student_name, s.roll_number
         FROM teacher_reviews tr
         JOIN teachers t ON tr.teacher_id = t.teacher_id
         JOIN students s ON tr.student_id = s.student_id
        WHERE t.user_id = $1
        ORDER BY tr.created_at DESC`,
      [req.user.userId]
    );
    res.json(rows);
  },

  // PUT /api/students/reviews/:review_id/viewed — ownership enforced in SQL
  async markViewed(req, res) {
    const { rows } = await pool.query(
      `UPDATE teacher_reviews tr
          SET is_viewed_by_student = true, viewed_at = COALESCE(tr.viewed_at, CURRENT_TIMESTAMP)
         FROM students s
        WHERE tr.student_id = s.student_id AND s.user_id = $1 AND tr.review_id = $2
        RETURNING tr.*`,
      [req.user.userId, req.params.review_id]
    );
    if (!rows.length) throw AppError.notFound('Review not found');
    res.json(rows[0]);
  },
};

module.exports = wrapController(reviewController);
