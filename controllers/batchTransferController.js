const pool = require('../config/database');
const { withTransaction } = require('../config/database');
const AppError = require('../utils/AppError');
const { wrapController } = require('../utils/asyncHandler');
const { teacherIdForUser } = require('./attendanceController');

const batchTransferController = {
  // GET /api/teachers/batch-transfers — transfers made by or to this teacher
  async getMyTransfers(req, res) {
    const teacherId = await teacherIdForUser(req.user.userId);
    const { rows } = await pool.query(
      `SELECT bt.*, b.batch_name,
              ft.full_name AS from_teacher_name,
              tt.full_name AS to_teacher_name,
              tt.full_name AS substitute_teacher_name,
              CASE WHEN bt.from_teacher_id = $1 THEN 'outgoing' ELSE 'incoming' END AS direction,
              CASE WHEN bt.is_permanent OR bt.transfer_date >= CURRENT_DATE THEN 'active' ELSE 'completed' END AS status
         FROM batch_transfers bt
         JOIN batches b ON bt.batch_id = b.batch_id
         LEFT JOIN teachers ft ON bt.from_teacher_id = ft.teacher_id
         LEFT JOIN teachers tt ON bt.to_teacher_id = tt.teacher_id
        WHERE bt.from_teacher_id = $1 OR bt.to_teacher_id = $1
        ORDER BY bt.transfer_date DESC, bt.transfer_id DESC`,
      [teacherId]
    );
    res.json(rows);
  },

  // POST /api/teachers/batch-transfers
  async create(req, res) {
    const { batch_id, to_teacher_id, transfer_date, reason, is_permanent } = req.body;
    const teacherId = await teacherIdForUser(req.user.userId);

    if (to_teacher_id === teacherId) throw AppError.badRequest('You cannot transfer a batch to yourself.');
    if (!is_permanent && transfer_date < new Date().toISOString().slice(0, 10)) {
      throw AppError.badRequest('Transfer date cannot be in the past.');
    }

    const transfer = await withTransaction(async (client) => {
      const { rows: batch } = await client.query(
        'SELECT batch_id FROM batches WHERE batch_id = $1 AND teacher_id = $2 FOR UPDATE',
        [batch_id, teacherId]
      );
      if (!batch.length) throw AppError.forbidden('You can only transfer your own batches.');

      const { rows: target } = await client.query(
        'SELECT 1 FROM teachers WHERE teacher_id = $1 AND is_active = true',
        [to_teacher_id]
      );
      if (!target.length) throw AppError.badRequest('Selected teacher is not available.');

      const { rows } = await client.query(
        `INSERT INTO batch_transfers
           (batch_id, from_teacher_id, to_teacher_id, transfer_date, reason, is_permanent, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [batch_id, teacherId, to_teacher_id, transfer_date, reason || null, !!is_permanent, req.user.userId]
      );

      // A permanent transfer reassigns the batch.
      if (is_permanent) {
        await client.query(
          'UPDATE batches SET teacher_id = $1, updated_at = CURRENT_TIMESTAMP WHERE batch_id = $2',
          [to_teacher_id, batch_id]
        );
      }
      return rows[0];
    });

    res.status(201).json(transfer);
  },

  // GET /api/teachers/batch-transfers/available-teachers
  async getAvailableTeachers(req, res) {
    const { rows } = await pool.query(
      `SELECT teacher_id, full_name, specialization
         FROM teachers
        WHERE user_id <> $1 AND is_active = true
        ORDER BY full_name`,
      [req.user.userId]
    );
    res.json(rows);
  },
};

module.exports = wrapController(batchTransferController);
