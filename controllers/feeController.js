const pool = require('../config/database');
const AppError = require('../utils/AppError');
const Student = require('../models/Student');
const { wrapController } = require('../utils/asyncHandler');

// fee_payments.status is one of pending | completed | failed | refunded.
// The UI vocabulary is "paid" / "pending" / "overdue".
const uiStatus = (status, dueDate) => {
  if (status === 'completed') return 'paid';
  if (status === 'pending' && dueDate && new Date(dueDate) < new Date(new Date().toDateString())) return 'overdue';
  return status;
};

const requireStudentId = async (userId) => {
  const studentId = await Student.idForUser(userId);
  if (!studentId) throw AppError.notFound('Student not found');
  return studentId;
};

const feeController = {
  // GET /api/students/fees/current — latest payment record
  async getCurrentPayment(req, res) {
    const { rows: studentRows } = await pool.query(
      `SELECT s.student_id, s.payment_window, s.roll_number, s.full_name, l.level_name,
              fs.base_amount, fs.discount_percentage, fs.discounted_amount, fs.late_fee_amount, fs.grace_period_days
         FROM students s
         LEFT JOIN levels l ON s.current_level_id = l.level_id
         LEFT JOIN fee_structure fs
                ON fs.level_id = s.current_level_id AND fs.payment_window = s.payment_window AND fs.is_active
        WHERE s.user_id = $1`,
      [req.user.userId]
    );
    if (!studentRows.length) throw AppError.notFound('Student not found');
    const student = studentRows[0];

    const { rows } = await pool.query(
      `SELECT payment_id, due_date, amount_paid, late_fee_applied, total_amount, status,
              payment_date, payment_method, is_late, days_late
         FROM fee_payments
        WHERE student_id = $1
        ORDER BY due_date DESC, payment_id DESC
        LIMIT 1`,
      [student.student_id]
    );

    const studentInfo = {
      roll_number: student.roll_number,
      full_name: student.full_name,
      level_name: student.level_name,
      payment_window: student.payment_window,
      fee_structure: student.base_amount
        ? {
            base_amount: parseFloat(student.base_amount),
            discount_percentage: parseFloat(student.discount_percentage),
            discounted_amount: parseFloat(student.discounted_amount),
            late_fee_amount: parseFloat(student.late_fee_amount),
            grace_period_days: student.grace_period_days,
          }
        : null,
    };

    if (!rows.length) {
      return res.json({ student: studentInfo, currentPayment: null, message: 'No payment records found' });
    }

    const p = rows[0];
    const lateFee = parseFloat(p.late_fee_applied || 0);
    const total = parseFloat(p.total_amount);
    res.json({
      student: studentInfo,
      currentPayment: {
        payment_id: p.payment_id,
        due_date: p.due_date,
        base_amount: total - lateFee,
        late_fee: lateFee,
        final_amount: total,
        status: uiStatus(p.status, p.due_date),
        raw_status: p.status,
        payment_date: p.payment_date,
        payment_method: p.payment_method,
        is_late: p.is_late,
        days_late: p.days_late,
      },
    });
  },

  // GET /api/students/fees/history — completed payments
  async getPaymentHistory(req, res) {
    const studentId = await requireStudentId(req.user.userId);
    const { rows } = await pool.query(
      `SELECT payment_id, payment_date, total_amount AS amount, 'paid' AS status, payment_method,
              late_fee_applied AS late_fee, is_late, due_date, payment_month, payment_year, transaction_id
         FROM fee_payments
        WHERE student_id = $1 AND status = 'completed'
        ORDER BY payment_date DESC, payment_id DESC`,
      [studentId]
    );
    res.json(rows);
  },

  // GET /api/students/fees — every fee record
  async getAllFees(req, res) {
    const studentId = await requireStudentId(req.user.userId);
    const { rows } = await pool.query(
      `SELECT payment_id, payment_month, payment_year, amount_paid, late_fee_applied AS late_fee,
              total_amount, payment_date, due_date, status AS raw_status, payment_method, is_late, days_late
         FROM fee_payments
        WHERE student_id = $1
        ORDER BY payment_year DESC NULLS LAST, payment_month DESC NULLS LAST, due_date DESC`,
      [studentId]
    );
    res.json(rows.map((r) => ({ ...r, status: uiStatus(r.raw_status, r.due_date) })));
  },
};

module.exports = wrapController(feeController);
module.exports.uiStatus = uiStatus;
