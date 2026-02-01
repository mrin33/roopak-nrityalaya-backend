const pool = require('../config/database');

class User {
  // Find user by email
  static async findByEmail(email) {
    try {
      const result = await pool.query(
        'SELECT * FROM users WHERE email = $1',
        [email]
      );
      return result.rows[0];
    } catch (error) {
      throw error;
    }
  }

  // Find user by ID
  static async findById(userId) {
    try {
      const result = await pool.query(
        'SELECT user_id, email, role, is_active, created_at FROM users WHERE user_id = $1',
        [userId]
      );
      return result.rows[0];
    } catch (error) {
      throw error;
    }
  }

  // Create new user (for registration)
  static async create(email, passwordHash, role = 'student') {
    try {
      const result = await pool.query(
        `INSERT INTO users (email, password_hash, role, is_active) 
         VALUES ($1, $2, $3, true) 
         RETURNING user_id, email, role, created_at`,
        [email, passwordHash, role]
      );
      return result.rows[0];
    } catch (error) {
      throw error;
    }
  }

  // Get user with full profile (including student/teacher data)
  static async getUserWithProfile(userId) {
    try {
      const result = await pool.query(
        `SELECT 
          u.user_id, u.email, u.role, u.is_active,
          CASE 
            WHEN u.role = 'student' THEN row_to_json(s.*)
            WHEN u.role = 'teacher' THEN row_to_json(t.*)
            ELSE NULL
          END as profile
        FROM users u
        LEFT JOIN students s ON u.user_id = s.user_id
        LEFT JOIN teachers t ON u.user_id = t.user_id
        WHERE u.user_id = $1`,
        [userId]
      );
      return result.rows[0];
    } catch (error) {
      throw error;
    }
  }

  // Update user's last login
  static async updateLastLogin(userId) {
    try {
      await pool.query(
        'UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE user_id = $1',
        [userId]
      );
    } catch (error) {
      throw error;
    }
  }

  // Check if email already exists
  static async emailExists(email) {
    try {
      const result = await pool.query(
        'SELECT COUNT(*) FROM users WHERE email = $1',
        [email]
      );
      return parseInt(result.rows[0].count) > 0;
    } catch (error) {
      throw error;
    }
  }
}

module.exports = User;
