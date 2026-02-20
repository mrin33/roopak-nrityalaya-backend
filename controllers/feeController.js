const pool = require('../config/database');

const feeController = {
  // Get student fees
  async getStudentFees(req, res) {
    try {
      const userId = req.user.user_id;

      // Get student with payment info
      const studentQuery = `
        SELECT s.*, l.monthly_fee
        FROM students s
        LEFT JOIN levels l ON s.level_id = l.level_id
        WHERE s.user_id = $1
      `;
      const studentResult = await pool.query(studentQuery, [userId]);
      const student = studentResult.rows[0];

      if (!student) {
        return res.status(404).json({ error: 'Student not found' });
      }

      // Get current pending payment
      const currentQuery = `
        SELECT * FROM fee_payments
        WHERE student_id = $1 AND status = 'pending'
        ORDER BY due_date ASC
        LIMIT 1
      `;
      const currentResult = await pool.query(currentQuery, [student.student_id]);

      res.json({
        student,
        current_payment: currentResult.rows[0] || null
      });
    } catch (error) {
      console.error('Error fetching fees:', error);
      res.status(500).json({ error: 'Server error' });
    }
  },

  // Get fee history
  async getFeeHistory(req, res) {
    try {
      const userId = req.user.user_id;

      const query = `
        SELECT fp.*
        FROM fee_payments fp
        INNER JOIN students s ON fp.student_id = s.student_id
        WHERE s.user_id = $1
        ORDER BY fp.payment_date DESC, fp.due_date DESC
      `;

      const result = await pool.query(query, [userId]);
      res.json(result.rows);
    } catch (error) {
      console.error('Error fetching fee history:', error);
      res.status(500).json({ error: 'Server error' });
    }
  },

  // Record payment (simulate Razorpay)
  async recordPayment(req, res) {
    try {
      const { payment_id } = req.params;
      const { payment_method, transaction_id } = req.body;

      const query = `
        UPDATE fee_payments 
        SET 
          status = 'paid',
          payment_method = $1,
          transaction_id = $2,
          payment_date = CURRENT_DATE
        WHERE payment_id = $3
        RETURNING *
      `;

      const result = await pool.query(query, [payment_method, transaction_id, payment_id]);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Payment not found' });
      }

      res.json(result.rows[0]);
    } catch (error) {
      console.error('Error recording payment:', error);
      res.status(500).json({ error: 'Server error' });
    }
  }
};

module.exports = feeController;
