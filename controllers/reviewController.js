const pool = require('../config/database');

const reviewController = {
  // Create review (Teacher)
  async create(req, res) {
    try {
      const userId = req.user.userId;
      const {
        student_id,
        review_month,
        review_year,
        technique_rating,
        rhythm_rating,
        creativity_rating,
        discipline_rating,
        review_text
      } = req.body;

      // Get teacher_id
      const teacherQuery = 'SELECT teacher_id FROM teachers WHERE user_id = $1';
      const teacherResult = await pool.query(teacherQuery, [userId]);
      const teacherId = teacherResult.rows[0]?.teacher_id;

      if (!teacherId) {
        return res.status(404).json({ error: 'Teacher not found' });
      }

      // Calculate overall rating
      const overall_rating = (
        technique_rating + rhythm_rating + creativity_rating + discipline_rating
      ) / 4;

      const query = `
        INSERT INTO teacher_reviews (
          teacher_id, student_id, review_month, review_year,
          technique_rating, rhythm_rating, creativity_rating, discipline_rating,
          overall_rating, review_text
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *
      `;

      const result = await pool.query(query, [
        teacherId,
        student_id,
        review_month,
        review_year,
        technique_rating,
        rhythm_rating,
        creativity_rating,
        discipline_rating,
        overall_rating,
        review_text
      ]);

      res.status(201).json(result.rows[0]);
    } catch (error) {
      console.error('Error creating review:', error);
      res.status(500).json({ error: 'Server error' });
    }
  },

  // Get reviews for student
  async getStudentReviews(req, res) {
    try {
      const userId = req.user.userId;
      const { month } = req.query;

      let query = `
        SELECT 
          tr.*,
          t.full_name as teacher_name
        FROM teacher_reviews tr
        INNER JOIN students s ON tr.student_id = s.student_id
        INNER JOIN teachers t ON tr.teacher_id = t.teacher_id
        WHERE s.user_id = $1
      `;

      const values = [userId];

      if (month && month !== 'all') {
        query += ' AND tr.review_month = $2';
        values.push(month);
      }

      query += ' ORDER BY tr.review_year DESC, tr.review_month DESC';

      const result = await pool.query(query, values);
      res.json(result.rows);
    } catch (error) {
      console.error('Error fetching reviews:', error);
      res.status(500).json({ error: 'Server error' });
    }
  },

  // Get reviews submitted by teacher
  async getTeacherReviews(req, res) {
    try {
      const userId = req.user.userId;

      const query = `
        SELECT 
          tr.*,
          s.full_name as student_name,
          s.roll_number
        FROM teacher_reviews tr
        INNER JOIN teachers t ON tr.teacher_id = t.teacher_id
        INNER JOIN students s ON tr.student_id = s.student_id
        WHERE t.user_id = $1
        ORDER BY tr.created_at DESC
      `;

      const result = await pool.query(query, [userId]);
      res.json(result.rows);
    } catch (error) {
      console.error('Error fetching teacher reviews:', error);
      res.status(500).json({ error: 'Server error' });
    }
  },

  // Mark review as viewed
  async markViewed(req, res) {
    try {
      const { review_id } = req.params;
      const userId = req.user.userId;

      const query = `
        UPDATE teacher_reviews tr
        SET is_viewed_by_student = true
        FROM students s
        WHERE tr.student_id = s.student_id
        AND s.user_id = $1
        AND tr.review_id = $2
        RETURNING tr.*
      `;

      const result = await pool.query(query, [userId, review_id]);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Review not found' });
      }

      res.json(result.rows[0]);
    } catch (error) {
      console.error('Error marking review as viewed:', error);
      res.status(500).json({ error: 'Server error' });
    }
  }
};

module.exports = reviewController;
