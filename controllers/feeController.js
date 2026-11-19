const pool = require('../config/database');

const feeController = {
  // ========== EXISTING METHODS (Keep these) ==========
  
  // Get student fees
  async getStudentFees(req, res) {
    try {
      const userId = req.user.userId;

      // Get student with payment info
      const studentQuery = `
        SELECT s.*, l.level_name
        FROM students s
        LEFT JOIN levels l ON s.current_level_id = l.level_id
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
      const userId = req.user.userId;

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
  },

  // ========== NEW METHODS FOR STUDENT PAGES (Add these) ==========

  // Get current payment due (for StudentFees page)
  async getCurrentPayment(req, res) {
    try {
      const userId = req.user.userId;

      // Get student info
      const studentQuery = `
        SELECT s.student_id, s.payment_window, s.roll_number, s.full_name,
               l.level_name
        FROM students s
        LEFT JOIN levels l ON s.current_level_id = l.level_id
        WHERE s.user_id = $1
      `;
      const studentResult = await pool.query(studentQuery, [userId]);
      
      if (studentResult.rows.length === 0) {
        return res.status(404).json({ error: 'Student not found' });
      }

      const student = studentResult.rows[0];

      // Get current/latest payment
      const paymentQuery = `
        SELECT 
          payment_id,
          due_date,
          amount_paid,
          late_fee_applied as late_fee,
          total_amount as final_amount,
          status as payment_status,
          payment_date,
          payment_method,
          is_late,
          days_late
        FROM fee_payments
        WHERE student_id = $1
        ORDER BY due_date DESC
        LIMIT 1
      `;
      const paymentResult = await pool.query(paymentQuery, [student.student_id]);

      if (paymentResult.rows.length === 0) {
        // No payment records yet
        return res.json({
          student: {
            roll_number: student.roll_number,
            full_name: student.full_name,
            level_name: student.level_name,
            payment_window: student.payment_window
          },
          currentPayment: null,
          message: 'No payment records found'
        });
      }

      const payment = paymentResult.rows[0];

      res.json({
        student: {
          roll_number: student.roll_number,
          full_name: student.full_name,
          level_name: student.level_name,
          payment_window: student.payment_window
        },
        currentPayment: {
          payment_id: payment.payment_id,
          due_date: payment.due_date,
          base_amount: parseFloat(payment.final_amount) - parseFloat(payment.late_fee || 0),
          late_fee: parseFloat(payment.late_fee || 0),
          final_amount: parseFloat(payment.final_amount),
          status: payment.payment_status,
          payment_date: payment.payment_date,
          payment_method: payment.payment_method,
          is_late: payment.is_late,
          days_late: payment.days_late
        }
      });
    } catch (error) {
      console.error('Error fetching current payment:', error);
      res.status(500).json({ error: 'Server error' });
    }
  },

  // Get payment history (for StudentFees page)
  async getPaymentHistory(req, res) {
    try {
      const userId = req.user.userId;

      // Get student_id
      const studentQuery = 'SELECT student_id FROM students WHERE user_id = $1';
      const studentResult = await pool.query(studentQuery, [userId]);
      const studentId = studentResult.rows[0]?.student_id;

      if (!studentId) {
        return res.status(404).json({ error: 'Student not found' });
      }

      const query = `
        SELECT 
          payment_id,
          payment_date,
          total_amount as amount,
          status,
          payment_method,
          late_fee_applied as late_fee,
          is_late,
          due_date
        FROM fee_payments
        WHERE student_id = $1
        AND status = 'paid'
        ORDER BY payment_date DESC
      `;

      const result = await pool.query(query, [studentId]);

      res.json(result.rows);
    } catch (error) {
      console.error('Error fetching payment history:', error);
      res.status(500).json({ error: 'Server error' });
    }
  },

  // Get all fee records (for StudentFees page)
  async getAllFees(req, res) {
    try {
      const userId = req.user.userId;

      // Get student_id
      const studentQuery = 'SELECT student_id FROM students WHERE user_id = $1';
      const studentResult = await pool.query(studentQuery, [userId]);
      const studentId = studentResult.rows[0]?.student_id;

      if (!studentId) {
        return res.status(404).json({ error: 'Student not found' });
      }

      const query = `
        SELECT 
          payment_id,
          payment_month,
          payment_year,
          amount_paid,
          late_fee_applied as late_fee,
          total_amount,
          payment_date,
          due_date,
          status,
          payment_method,
          is_late,
          days_late
        FROM fee_payments
        WHERE student_id = $1
        ORDER BY payment_year DESC, payment_month DESC
      `;

      const result = await pool.query(query, [studentId]);

      res.json(result.rows);
    } catch (error) {
      console.error('Error fetching fees:', error);
      res.status(500).json({ error: 'Server error' });
    }
  }
};

module.exports = feeController;
