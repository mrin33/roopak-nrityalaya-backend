const pool = require('../config/database');

const activityLogController = {
  // Create activity log
  async create(req, res) {
    try {
      const userId = req.user.userId;
      const { log_date, activities_done, performances, practice_hours, notes, mood } = req.body;

      // Get student_id
      const studentQuery = 'SELECT student_id FROM students WHERE user_id = $1';
      const studentResult = await pool.query(studentQuery, [userId]);
      const studentId = studentResult.rows[0]?.student_id;

      if (!studentId) {
        return res.status(404).json({ error: 'Student not found' });
      }

      const query = `
        INSERT INTO student_activity_logs (
          student_id, log_date, activities_done, performances, 
          practice_hours, notes, mood
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `;

      const result = await pool.query(query, [
        studentId,
        log_date,
        activities_done,
        performances || 'None',
        practice_hours,
        notes,
        mood
      ]);

      // Update student's total practice hours
      await pool.query(
        'UPDATE students SET total_practice_hours = total_practice_hours + $1 WHERE student_id = $2',
        [practice_hours, studentId]
      );

      res.status(201).json(result.rows[0]);
    } catch (error) {
      console.error('Error creating activity log:', error);
      res.status(500).json({ error: 'Server error' });
    }
  },

  // Get all logs for student
  async getAll(req, res) {
    try {
      const userId = req.user.userId;

      const query = `
        SELECT al.*
        FROM student_activity_logs al
        INNER JOIN students s ON al.student_id = s.student_id
        WHERE s.user_id = $1
        ORDER BY al.log_date DESC
      `;

      const result = await pool.query(query, [userId]);
      res.json(result.rows);
    } catch (error) {
      console.error('Error fetching activity logs:', error);
      res.status(500).json({ error: 'Server error' });
    }
  },

  // Get statistics
  async getStats(req, res) {
    try {
      const userId = req.user.userId;

      const query = `
        SELECT 
          SUM(practice_hours) as total_practice_hours,
          AVG(practice_hours) as avg_practice_hours,
          COUNT(*) FILTER (WHERE performances != 'None') as total_performances,
          COUNT(*) as total_logs,
          COUNT(*) FILTER (WHERE log_date >= CURRENT_DATE - INTERVAL '7 days') as this_week_logs
        FROM student_activity_logs al
        INNER JOIN students s ON al.student_id = s.student_id
        WHERE s.user_id = $1
      `;

      const result = await pool.query(query, [userId]);
      res.json(result.rows[0]);
    } catch (error) {
      console.error('Error fetching stats:', error);
      res.status(500).json({ error: 'Server error' });
    }
  },

  // Update log
  async update(req, res) {
    try {
      const { log_id } = req.params;
      const userId = req.user.userId;
      const updates = req.body;

      // Verify ownership
      const checkQuery = `
        SELECT al.* FROM student_activity_logs al
        INNER JOIN students s ON al.student_id = s.student_id
        WHERE al.log_id = $1 AND s.user_id = $2
      `;
      const checkResult = await pool.query(checkQuery, [log_id, userId]);

      if (checkResult.rows.length === 0) {
        return res.status(404).json({ error: 'Log not found' });
      }

      const fields = [];
      const values = [];
      let paramCount = 1;

      Object.keys(updates).forEach(key => {
        fields.push(`${key} = $${paramCount}`);
        values.push(updates[key]);
        paramCount++;
      });

      values.push(log_id);

      const query = `
        UPDATE student_activity_logs 
        SET ${fields.join(', ')}
        WHERE log_id = $${paramCount}
        RETURNING *
      `;

      const result = await pool.query(query, values);
      res.json(result.rows[0]);
    } catch (error) {
      console.error('Error updating log:', error);
      res.status(500).json({ error: 'Server error' });
    }
  },

  // Delete log
  async delete(req, res) {
    try {
      const { log_id } = req.params;
      const userId = req.user.userId;

      // Verify ownership and get practice hours
      const checkQuery = `
        SELECT al.practice_hours, s.student_id 
        FROM student_activity_logs al
        INNER JOIN students s ON al.student_id = s.student_id
        WHERE al.log_id = $1 AND s.user_id = $2
      `;
      const checkResult = await pool.query(checkQuery, [log_id, userId]);

      if (checkResult.rows.length === 0) {
        return res.status(404).json({ error: 'Log not found' });
      }

      const { practice_hours, student_id } = checkResult.rows[0];

      // Delete log
      await pool.query('DELETE FROM student_activity_logs WHERE log_id = $1', [log_id]);

      // Update total practice hours
      await pool.query(
        'UPDATE students SET total_practice_hours = total_practice_hours - $1 WHERE student_id = $2',
        [practice_hours, student_id]
      );

      res.json({ message: 'Log deleted successfully' });
    } catch (error) {
      console.error('Error deleting log:', error);
      res.status(500).json({ error: 'Server error' });
    }
  }
};

module.exports = activityLogController;
