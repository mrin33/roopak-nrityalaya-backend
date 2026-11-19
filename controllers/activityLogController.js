const pool = require('../config/database');
const { withTransaction } = require('../config/database');
const AppError = require('../utils/AppError');
const Student = require('../models/Student');
const { wrapController } = require('../utils/asyncHandler');

// The ONLY columns a student may write. Column names are never taken from
// user input: the SET clause is built from this constant list and all
// values are passed as bind parameters.
const UPDATABLE_COLUMNS = ['log_date', 'activities_done', 'performances', 'practice_hours', 'notes', 'mood'];

const requireStudentId = async (userId) => {
  const studentId = await Student.idForUser(userId);
  if (!studentId) throw AppError.notFound('Student not found');
  return studentId;
};

const duplicateDate = (err) => {
  if (err.code === '23505') throw AppError.conflict('You already have a log for this date. Edit it instead.');
  throw err;
};

const activityLogController = {
  // POST /api/students/activity-logs
  async create(req, res) {
    const studentId = await requireStudentId(req.user.userId);
    const b = req.body;
    const hours = b.practice_hours ?? 0;

    const log = await withTransaction(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO student_activity_logs
           (student_id, log_date, activities_done, performances, practice_hours, notes, mood)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [studentId, b.log_date, b.activities_done || null, b.performances || 'None', hours, b.notes || null, b.mood || null]
      );
      await client.query(
        `UPDATE students SET total_practice_hours = COALESCE(total_practice_hours, 0) + $1,
                             updated_at = CURRENT_TIMESTAMP
          WHERE student_id = $2`,
        [hours, studentId]
      );
      return rows[0];
    }).catch(duplicateDate);

    res.status(201).json(log);
  },

  // GET /api/students/activity-logs
  async getAll(req, res) {
    const { rows } = await pool.query(
      `SELECT al.* FROM student_activity_logs al
         JOIN students s ON al.student_id = s.student_id
        WHERE s.user_id = $1
        ORDER BY al.log_date DESC`,
      [req.user.userId]
    );
    res.json(rows);
  },

  // GET /api/students/activity-logs/stats
  async getStats(req, res) {
    const { rows } = await pool.query(
      `SELECT COALESCE(SUM(practice_hours), 0)::float AS total_practice_hours,
              COALESCE(ROUND(AVG(practice_hours), 2), 0)::float AS avg_practice_hours,
              COUNT(*) FILTER (WHERE COALESCE(performances, 'None') <> 'None')::int AS total_performances,
              COUNT(*)::int AS total_logs,
              COUNT(*) FILTER (WHERE log_date >= CURRENT_DATE - INTERVAL '7 days')::int AS this_week_logs
         FROM student_activity_logs al
         JOIN students s ON al.student_id = s.student_id
        WHERE s.user_id = $1`,
      [req.user.userId]
    );
    res.json(rows[0]);
  },

  // PUT /api/students/activity-logs/:log_id
  async update(req, res) {
    const studentId = await requireStudentId(req.user.userId);
    const updates = req.body; // already stripped to known keys by the validator

    const sets = [];
    const values = [];
    for (const column of UPDATABLE_COLUMNS) {
      if (updates[column] !== undefined) {
        values.push(updates[column]);
        sets.push(`${column} = $${values.length}`);
      }
    }
    if (!sets.length) throw AppError.badRequest('No valid fields to update');

    const log = await withTransaction(async (client) => {
      // Ownership check and row lock in one statement.
      const { rows: existing } = await client.query(
        'SELECT practice_hours FROM student_activity_logs WHERE log_id = $1 AND student_id = $2 FOR UPDATE',
        [req.params.log_id, studentId]
      );
      if (!existing.length) throw AppError.notFound('Log not found');

      values.push(req.params.log_id, studentId);
      const { rows } = await client.query(
        `UPDATE student_activity_logs SET ${sets.join(', ')}
          WHERE log_id = $${values.length - 1} AND student_id = $${values.length}
          RETURNING *`,
        values
      );

      if (updates.practice_hours !== undefined) {
        const delta = Number(updates.practice_hours) - Number(existing[0].practice_hours || 0);
        await client.query(
          `UPDATE students SET total_practice_hours = GREATEST(COALESCE(total_practice_hours, 0) + $1, 0)
            WHERE student_id = $2`,
          [delta, studentId]
        );
      }
      return rows[0];
    }).catch(duplicateDate);

    res.json(log);
  },

  // DELETE /api/students/activity-logs/:log_id
  async delete(req, res) {
    const studentId = await requireStudentId(req.user.userId);
    await withTransaction(async (client) => {
      const { rows } = await client.query(
        'DELETE FROM student_activity_logs WHERE log_id = $1 AND student_id = $2 RETURNING practice_hours',
        [req.params.log_id, studentId]
      );
      if (!rows.length) throw AppError.notFound('Log not found');
      await client.query(
        `UPDATE students SET total_practice_hours = GREATEST(COALESCE(total_practice_hours, 0) - $1, 0)
          WHERE student_id = $2`,
        [rows[0].practice_hours || 0, studentId]
      );
    });
    res.json({ message: 'Log deleted successfully' });
  },
};

module.exports = wrapController(activityLogController);
module.exports.UPDATABLE_COLUMNS = UPDATABLE_COLUMNS;
