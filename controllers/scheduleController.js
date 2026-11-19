const pool = require('../config/database');

const scheduleController = {
  // Get student schedule
  async getStudentSchedule(req, res) {
    try {
      const userId = req.user.userId;

      // Get student and batch info
      const query = `
        SELECT 
          s.student_id,
          s.roll_number,
          s.full_name,
          l.level_name,
          l.level_number,
          b.batch_name,
          b.schedule,
          b.time,
          b.room,
          t.full_name as teacher_name
        FROM students s
        LEFT JOIN levels l ON s.current_level_id = l.level_id
        LEFT JOIN student_batches sb ON s.student_id = sb.student_id AND sb.is_active = true
        LEFT JOIN batches b ON sb.batch_id = b.batch_id
        LEFT JOIN teachers t ON b.teacher_id = t.teacher_id
        WHERE s.user_id = $1
      `;

      const result = await pool.query(query, [userId]);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Student not found' });
      }

      const student = result.rows[0];

      // Return schedule data
      res.json({
        student: {
          roll_number: student.roll_number,
          full_name: student.full_name,
          level_name: student.level_name
        },
        batchInfo: student.batch_name ? {
          batchName: student.batch_name,
          schedule: student.schedule,
          time: student.time,
          classRoom: student.room,
          teacher: student.teacher_name,
          level: student.level_name
        } : null
      });
    } catch (error) {
      console.error('Error fetching schedule:', error);
      res.status(500).json({ error: 'Server error' });
    }
  }
};

module.exports = scheduleController;
