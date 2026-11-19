const pool = require('../../config/database');
const AppError = require('../../utils/AppError');

// Admin batches handlers; aggregated by controllers/adminController.js.
module.exports = {
  async getAllBatches(req, res) {
    const { rows } = await pool.query(`
      SELECT b.*, l.level_name, t.full_name AS teacher_name,
             COUNT(sb.student_id)::int AS active_students
        FROM batches b
        LEFT JOIN levels l ON b.level_id = l.level_id
        LEFT JOIN teachers t ON b.teacher_id = t.teacher_id
        LEFT JOIN student_batches sb ON sb.batch_id = b.batch_id AND sb.is_active = true
       GROUP BY b.batch_id, l.level_name, t.full_name
       ORDER BY b.batch_name
    `);
    res.json(rows);
  },

  async createBatch(req, res) {
    const b = req.body;
    const { rows: dup } = await pool.query('SELECT 1 FROM batches WHERE lower(batch_name) = lower($1)', [
      b.batch_name,
    ]);
    if (dup.length) throw AppError.conflict('Batch name already exists');

    const { rows: teacher } = await pool.query('SELECT is_active FROM teachers WHERE teacher_id = $1', [
      b.teacher_id,
    ]);
    if (!teacher.length) throw AppError.badRequest('Teacher not found');
    if (!teacher[0].is_active) throw AppError.badRequest('Cannot assign an inactive teacher');

    const { rows: level } = await pool.query('SELECT 1 FROM levels WHERE level_id = $1', [b.level_id]);
    if (!level.length) throw AppError.badRequest('Level not found');

    const { rows } = await pool.query(
      `INSERT INTO batches
         (batch_name, level_id, teacher_id, schedule, "time", room, max_students, start_date, end_date, current_enrolled)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 0)
       RETURNING *`,
      [
        b.batch_name, b.level_id, b.teacher_id, b.schedule, b.time, b.room || null,
        b.max_students || 15, b.start_date || null, b.end_date || null,
      ]
    );
    res.status(201).json({ message: 'Batch created successfully', batch: rows[0] });
  },

  async updateBatch(req, res) {
    const b = req.body;
    const batchId = req.params.batch_id;

    const { rows: existing } = await pool.query('SELECT batch_id FROM batches WHERE batch_id = $1', [batchId]);
    if (!existing.length) throw AppError.notFound('Batch not found');

    if (b.batch_name) {
      const { rows: dup } = await pool.query(
        'SELECT 1 FROM batches WHERE lower(batch_name) = lower($1) AND batch_id <> $2',
        [b.batch_name, batchId]
      );
      if (dup.length) throw AppError.conflict('Batch name already exists');
    }
    if (b.teacher_id) {
      const { rows: teacher } = await pool.query('SELECT is_active FROM teachers WHERE teacher_id = $1', [
        b.teacher_id,
      ]);
      if (!teacher.length) throw AppError.badRequest('Teacher not found');
      if (!teacher[0].is_active) throw AppError.badRequest('Cannot assign an inactive teacher');
    }
    if (b.max_students) {
      const { rows: count } = await pool.query(
        'SELECT COUNT(*)::int AS n FROM student_batches WHERE batch_id = $1 AND is_active = true',
        [batchId]
      );
      if (b.max_students < count[0].n) {
        throw AppError.badRequest(`Capacity cannot be lower than the ${count[0].n} students currently enrolled.`);
      }
    }

    const { rows } = await pool.query(
      `UPDATE batches SET
         batch_name = COALESCE($1, batch_name),
         level_id = COALESCE($2, level_id),
         teacher_id = COALESCE($3, teacher_id),
         schedule = COALESCE($4, schedule),
         "time" = COALESCE($5, "time"),
         room = COALESCE($6, room),
         max_students = COALESCE($7, max_students),
         is_active = COALESCE($8, is_active),
         start_date = CASE WHEN $9::boolean THEN $10::date ELSE start_date END,
         end_date = CASE WHEN $11::boolean THEN $12::date ELSE end_date END,
         updated_at = CURRENT_TIMESTAMP
       WHERE batch_id = $13
       RETURNING *`,
      [
        b.batch_name, b.level_id, b.teacher_id, b.schedule, b.time, b.room, b.max_students, b.is_active,
        b.start_date !== undefined, b.start_date ?? null, b.end_date !== undefined, b.end_date ?? null, batchId,
      ]
    );
    res.json({ message: 'Batch updated successfully', batch: rows[0] });
  },

  async deleteBatch(req, res) {
    const batchId = req.params.batch_id;
    const { rows } = await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM batches WHERE batch_id = $1)::int AS exists,
         (SELECT COUNT(*) FROM student_batches WHERE batch_id = $1 AND is_active = true)::int AS students,
         (SELECT COUNT(*) FROM attendance WHERE batch_id = $1)::int AS attendance`,
      [batchId]
    );
    const info = rows[0];
    if (!info.exists) throw AppError.notFound('Batch not found');
    if (info.students > 0) {
      throw AppError.badRequest('Cannot delete batch with active students. Transfer or remove students first.');
    }
    if (info.attendance > 0) {
      throw AppError.conflict(
        'This batch has attendance history, which would be lost. Mark the batch inactive instead.'
      );
    }
    await pool.query('DELETE FROM batches WHERE batch_id = $1', [batchId]);
    res.json({ message: 'Batch deleted successfully' });
  }
};
