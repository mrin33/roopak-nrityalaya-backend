const pool = require('../config/database');
const { wrapController } = require('../utils/asyncHandler');

// Endpoints for the public website (no authentication).
const publicController = {
  // GET /api/public/teachers — active teachers, public profile fields only
  async getTeachers(req, res) {
    const { rows } = await pool.query(
      `SELECT teacher_id AS id, full_name, specialization, experience_years, qualifications, bio,
              is_senior, profile_photo_url AS photo_url,
              COALESCE(average_rating, 0)::float AS average_rating, total_reviews
         FROM teachers
        WHERE is_active = true
        ORDER BY is_senior DESC, experience_years DESC NULLS LAST, full_name`
    );
    res.json(rows);
  },

  // GET /api/public/levels — the 8 levels with their fee options
  async getLevels(req, res) {
    const { rows } = await pool.query(
      `SELECT l.level_id, l.level_number, l.level_code, l.level_name, l.description,
              COALESCE(
                json_agg(json_build_object(
                  'payment_window', fs.payment_window,
                  'base_amount', fs.base_amount::float,
                  'discount_percentage', fs.discount_percentage::float,
                  'discounted_amount', fs.discounted_amount::float
                ) ORDER BY fs.payment_window) FILTER (WHERE fs.fee_structure_id IS NOT NULL),
                '[]'
              ) AS fees
         FROM levels l
         LEFT JOIN fee_structure fs ON fs.level_id = l.level_id AND fs.is_active
        GROUP BY l.level_id
        ORDER BY l.level_number`
    );
    res.json(rows);
  },

  // POST /api/public/contact — stored for the admin to read
  async submitContact(req, res) {
    const { name, email, phone, subject, message } = req.body;
    await pool.query(
      `INSERT INTO contact_messages (name, email, phone, subject, message) VALUES ($1, $2, $3, $4, $5)`,
      [name, email, phone || null, subject || null, message]
    );
    res.status(201).json({ message: 'Thank you! Your message has been received. We will get back to you soon.' });
  },
};

module.exports = wrapController(publicController);
