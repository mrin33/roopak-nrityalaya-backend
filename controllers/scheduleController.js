const pool = require('../config/database');
const AppError = require('../utils/AppError');
const { wrapController } = require('../utils/asyncHandler');

const scheduleController = {
  // GET /api/students/schedule
  async getStudentSchedule(req, res) {
    const { rows } = await pool.query(
      `SELECT s.student_id, s.roll_number, s.full_name, l.level_name, l.level_number,
              b.batch_name, b.schedule, b."time", b.room, t.full_name AS teacher_name
         FROM students s
         LEFT JOIN levels l ON s.current_level_id = l.level_id
         LEFT JOIN student_batches sb ON s.student_id = sb.student_id AND sb.is_active = true
         LEFT JOIN batches b ON sb.batch_id = b.batch_id
         LEFT JOIN teachers t ON b.teacher_id = t.teacher_id
        WHERE s.user_id = $1`,
      [req.user.userId]
    );
    if (!rows.length) throw AppError.notFound('Student not found');
    const s = rows[0];
    res.json({
      student: { roll_number: s.roll_number, full_name: s.full_name, level_name: s.level_name },
      batchInfo: s.batch_name
        ? {
            batchName: s.batch_name,
            schedule: s.schedule,
            time: s.time,
            classRoom: s.room,
            teacher: s.teacher_name,
            level: s.level_name,
          }
        : null,
    });
  },
};

module.exports = wrapController(scheduleController);
