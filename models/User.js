const pool = require('../config/database');

// `db` may be the pool or a transaction client from withTransaction().
class User {
  static async findByEmail(email, db = pool) {
    const { rows } = await db.query('SELECT * FROM users WHERE lower(email) = lower($1)', [email]);
    return rows[0];
  }

  static async findById(userId, db = pool) {
    const { rows } = await db.query(
      'SELECT user_id, email, role, is_active, last_login, created_at FROM users WHERE user_id = $1',
      [userId]
    );
    return rows[0];
  }

  static async create(email, passwordHash, role = 'student', db = pool) {
    const { rows } = await db.query(
      `INSERT INTO users (email, password_hash, role, is_active, password_changed_at)
       VALUES (lower($1), $2, $3, true, now())
       RETURNING user_id, email, role, created_at`,
      [email, passwordHash, role]
    );
    return rows[0];
  }

  // User with their role-specific profile (never includes password_hash).
  static async getUserWithProfile(userId, db = pool) {
    const { rows } = await db.query(
      `SELECT
         u.user_id, u.email, u.role, u.is_active,
         CASE
           WHEN u.role = 'student' THEN (SELECT row_to_json(s.*) FROM students s WHERE s.user_id = u.user_id LIMIT 1)
           WHEN u.role = 'teacher' THEN (SELECT row_to_json(t.*) FROM teachers t WHERE t.user_id = u.user_id LIMIT 1)
           ELSE NULL
         END AS profile
       FROM users u
       WHERE u.user_id = $1`,
      [userId]
    );
    return rows[0];
  }

  static async updateLastLogin(userId, db = pool) {
    await db.query('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE user_id = $1', [userId]);
  }

  static async setPassword(userId, passwordHash, db = pool) {
    await db.query(
      `UPDATE users
          SET password_hash = $1, password_changed_at = now(), updated_at = CURRENT_TIMESTAMP
        WHERE user_id = $2`,
      [passwordHash, userId]
    );
  }

  static async emailExists(email, db = pool) {
    const { rows } = await db.query('SELECT 1 FROM users WHERE lower(email) = lower($1)', [email]);
    return rows.length > 0;
  }
}

module.exports = User;
