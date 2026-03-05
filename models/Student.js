const pool = require('../config/database');

class Student {
  // Create new student profile
  static async create(userId, studentData) {
    const {
      fullName,
      phone,
      dateOfBirth,
      address,
      guardianName,
      guardianPhone
    } = studentData;

    try {
      const result = await pool.query(
        `INSERT INTO students 
         (user_id, full_name, phone, date_of_birth, address, guardian_name, guardian_phone, current_level_id) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, 1) 
         RETURNING *`,
        [userId, fullName, phone, dateOfBirth, address, guardianName, guardianPhone]
      );
      return result.rows[0];
    } catch (error) {
      throw error;
    }
  }

  // Find student by user_id
  static async findByUserId(userId) {  // FIXED: Changed parameter name to userId
    try {
      const result = await pool.query(
        `SELECT s.*, l.level_name, l.level_number
         FROM students s
         LEFT JOIN levels l ON s.current_level_id = l.level_id
         WHERE s.user_id = $1`,
        [userId]  // FIXED: Now matches parameter name
      );
      return result.rows[0];
    } catch (error) {
      throw error;
    }
  }

  // Find student by student_id
  static async findById(studentId) {
    try {
      const result = await pool.query(
        `SELECT s.*, l.level_name, l.level_number, u.email
         FROM students s
         LEFT JOIN levels l ON s.current_level_id = l.level_id
         LEFT JOIN users u ON s.user_id = u.user_id
         WHERE s.student_id = $1`,
        [studentId]
      );
      return result.rows[0];
    } catch (error) {
      throw error;
    }
  }

  // Get all students
  static async findAll() {
    try {
      const result = await pool.query(
        `SELECT s.*, l.level_name, l.level_number, u.email, u.is_active
         FROM students s
         LEFT JOIN levels l ON s.current_level_id = l.level_id
         LEFT JOIN users u ON s.user_id = u.user_id
         ORDER BY s.created_at DESC`
      );
      return result.rows;
    } catch (error) {
      throw error;
    }
  }

  // Update student profile
  static async update(studentId, studentData) {
    const {
      fullName,
      phone,
      dateOfBirth,
      address,
      guardianName,
      guardianPhone,
      photoUrl
    } = studentData;

    try {
      const result = await pool.query(
        `UPDATE students 
         SET full_name = COALESCE($1, full_name),
             phone = COALESCE($2, phone),
             date_of_birth = COALESCE($3, date_of_birth),
             address = COALESCE($4, address),
             guardian_name = COALESCE($5, guardian_name),
             guardian_phone = COALESCE($6, guardian_phone),
             photo_url = COALESCE($7, photo_url),
             updated_at = CURRENT_TIMESTAMP
         WHERE student_id = $8
         RETURNING *`,
        [fullName, phone, dateOfBirth, address, guardianName, guardianPhone, photoUrl, studentId]
      );
      return result.rows[0];
    } catch (error) {
      throw error;
    }
  }

  // Get student with batch info
  static async getStudentWithBatch(studentId) {
    try {
      const result = await pool.query(
        `SELECT s.*, l.level_name, b.batch_name, b.schedule, t.full_name as teacher_name
         FROM students s
         LEFT JOIN levels l ON s.current_level_id = l.level_id
         LEFT JOIN student_batches sb ON s.student_id = sb.student_id AND sb.is_active = true
         LEFT JOIN batches b ON sb.batch_id = b.batch_id
         LEFT JOIN teachers t ON b.teacher_id = t.teacher_id
         WHERE s.student_id = $1`,
        [studentId]
      );
      return result.rows[0];
    } catch (error) {
      throw error;
    }
  }
}

module.exports = Student;