const pool = require('../../config/database');
const AppError = require('../../utils/AppError');
const { pageClause, sendPage } = require('../../utils/pagination');

// Admin fees handlers; aggregated by controllers/adminController.js.
module.exports = {
  async getAllFees(req, res) {
    const { status, month, year, student_id, limit, offset } = req.validatedQuery || {};
    const values = [];
    const where = [];

    if (status === 'paid' || status === 'completed') where.push("fp.status = 'completed'");
    else if (status === 'overdue') where.push("fp.status = 'pending' AND fp.due_date < CURRENT_DATE");
    else if (status && status !== 'all') {
      values.push(status);
      where.push(`fp.status = $${values.length}`);
    }
    if (month && year) {
      values.push(month, year);
      where.push(
        `EXTRACT(MONTH FROM fp.due_date) = $${values.length - 1} AND EXTRACT(YEAR FROM fp.due_date) = $${values.length}`
      );
    }
    if (student_id) {
      values.push(student_id);
      where.push(`fp.student_id = $${values.length}`);
    }

    const { rows } = await pool.query(
      `SELECT fp.*, COUNT(*) OVER() AS total_count,
              CASE
                WHEN fp.status = 'completed' THEN 'paid'
                WHEN fp.status = 'pending' AND fp.due_date < CURRENT_DATE THEN 'overdue'
                ELSE fp.status
              END AS payment_status,
              s.roll_number, s.full_name AS student_name, s.payment_window
         FROM fee_payments fp
         JOIN students s ON fp.student_id = s.student_id
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY fp.due_date DESC, fp.payment_id DESC
        ${pageClause(values, { limit, offset })}`,
      values
    );
    sendPage(res, rows);
  },

  async recordFeePayment(req, res) {
    const b = req.body;
    const { rows: studentRows } = await pool.query(
      `SELECT s.student_id, s.current_level_id, s.payment_window, fs.fee_structure_id
         FROM students s
         LEFT JOIN fee_structure fs
                ON fs.level_id = s.current_level_id AND fs.payment_window = s.payment_window AND fs.is_active
        WHERE s.student_id = $1`,
      [b.student_id]
    );
    if (!studentRows.length) throw AppError.badRequest('Student not found');
    const student = studentRows[0];

    const today = new Date().toISOString().slice(0, 10);
    const paymentDate = b.payment_date || today;
    const [year, month] = b.month
      ? b.month.split('-').map(Number)
      : [Number(paymentDate.slice(0, 4)), Number(paymentDate.slice(5, 7))];
    const dueDate = b.due_date || paymentDate;
    const lateFee = b.late_fee || 0;
    const daysLate = Math.max(0, Math.round((Date.parse(paymentDate) - Date.parse(dueDate)) / 86400000));
    const status = b.status || 'completed';

    const { rows } = await pool.query(
      `INSERT INTO fee_payments
         (student_id, fee_structure_id, payment_month, payment_year, amount_paid, late_fee_applied,
          total_amount, payment_date, due_date, is_late, days_late, payment_method, transaction_id, status, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       RETURNING *`,
      [
        student.student_id, student.fee_structure_id || null, month, year, b.amount_paid, lateFee,
        Number(b.amount_paid) + Number(lateFee), paymentDate, dueDate, daysLate > 0, daysLate,
        b.payment_method || null, b.transaction_id || null, status, b.notes || null,
      ]
    );
    res.status(201).json({ message: 'Fee payment recorded successfully', payment: rows[0] });
  }
};
