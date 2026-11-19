const pool = require('../config/database');

// `db` may be the pool or a transaction client from withTransaction().
class Student {
  static async create(userId, data, db = pool) {
    const { rows } = await db.query(
      `INSERT INTO students
         (user_id, full_name, phone, date_of_birth, gender, address,
          emergency_contact_name, emergency_contact, current_level_id,
          payment_window, enrollment_reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        userId,
        data.fullName,
        data.phone,
        data.dateOfBirth || null,
        data.gender || null,
        data.address || null,
        data.emergencyContactName || null,
        data.emergencyContact || null,
        data.currentLevelId,
        data.paymentWindow || 'monthly',
        data.enrollmentReason || null,
      ]
    );
    return rows[0];
  }

  static async findByUserId(userId, db = pool) {
    const { rows } = await db.query(
      `SELECT s.*, l.level_name, l.level_number, l.level_code
         FROM students s
         LEFT JOIN levels l ON s.current_level_id = l.level_id
        WHERE s.user_id = $1`,
      [userId]
    );
    return rows[0];
  }

  // student_id for the logged-in user, or undefined.
  static async idForUser(userId, db = pool) {
    const { rows } = await db.query('SELECT student_id FROM students WHERE user_id = $1', [userId]);
    return rows[0]?.student_id;
  }

  static async findById(studentId, db = pool) {
    const { rows } = await db.query(
      `SELECT s.*, l.level_name, l.level_number, u.email
         FROM students s
         LEFT JOIN levels l ON s.current_level_id = l.level_id
         LEFT JOIN users u ON s.user_id = u.user_id
        WHERE s.student_id = $1`,
      [studentId]
    );
    return rows[0];
  }
}

module.exports = Student;
