const pool = require('../config/database');

// @desc    Get all batches
// @route   GET /api/batches
// @access  Private (Admin, Teacher)
const getAllBatches = async (req, res) => {
  try {
    const { level_id, teacher_id } = req.query;

    let query = `
      SELECT 
        b.batch_id,
        b.batch_name,
        l.level_name,
        t.full_name as teacher_name,
        b.schedule,
        b.time,
        b.room,
        b.current_enrolled,
        b.max_students,
        b.created_at
      FROM batches b
      INNER JOIN levels l ON b.level_id = l.level_id
      INNER JOIN teachers t ON b.teacher_id = t.teacher_id
      WHERE 1=1
    `;

    const queryParams = [];
    let paramCount = 1;

    if (level_id) {
      query += ` AND b.level_id = $${paramCount}`;
      queryParams.push(level_id);
      paramCount++;
    }

    if (teacher_id) {
      query += ` AND b.teacher_id = $${paramCount}`;
      queryParams.push(teacher_id);
      paramCount++;
    }

    query += ' ORDER BY b.batch_name';

    const result = await pool.query(query, queryParams);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching batches:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Get batch by ID
// @route   GET /api/batches/:id
// @access  Private (Admin, Teacher)
const getBatchById = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(`
      SELECT 
        b.batch_id,
        b.batch_name,
        b.level_id,
        l.level_name,
        b.teacher_id,
        t.full_name as teacher_name,
        b.schedule,
        b.time,
        b.room,
        b.current_enrolled,
        b.max_students,
        b.created_at,
        COUNT(s.student_id) as active_students
      FROM batches b
      INNER JOIN levels l ON b.level_id = l.level_id
      INNER JOIN teachers t ON b.teacher_id = t.teacher_id
      LEFT JOIN students s ON b.batch_id = s.batch_id AND s.status = 'active'
      WHERE b.batch_id = $1
      GROUP BY b.batch_id, b.batch_name, b.level_id, l.level_name, 
               b.teacher_id, t.full_name, b.schedule, b.time, b.room, 
               b.current_enrolled, b.max_students, b.created_at
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Batch not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching batch:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Create new batch
// @route   POST /api/batches
// @access  Private (Admin)
const createBatch = async (req, res) => {
  try {
    const { 
      batch_name, 
      level_id, 
      teacher_id, 
      schedule, 
      time, 
      room, 
      max_students = 15 
    } = req.body;

    // Validate required fields
    if (!batch_name || !level_id || !teacher_id || !schedule || !time) {
      return res.status(400).json({ 
        message: 'batch_name, level_id, teacher_id, schedule, and time are required' 
      });
    }

    // Check if batch name already exists
    const existingBatch = await pool.query(
      'SELECT batch_id FROM batches WHERE batch_name = $1',
      [batch_name]
    );

    if (existingBatch.rows.length > 0) {
      return res.status(400).json({ message: 'Batch name already exists' });
    }

    // Verify teacher exists
    const teacherExists = await pool.query(
      'SELECT teacher_id FROM teachers WHERE teacher_id = $1',
      [teacher_id]
    );

    if (teacherExists.rows.length === 0) {
      return res.status(404).json({ message: 'Teacher not found' });
    }

    // Verify level exists
    const levelExists = await pool.query(
      'SELECT level_id FROM levels WHERE level_id = $1',
      [level_id]
    );

    if (levelExists.rows.length === 0) {
      return res.status(404).json({ message: 'Level not found' });
    }

    // Create batch
    const result = await pool.query(`
      INSERT INTO batches (
        batch_name, 
        level_id, 
        teacher_id, 
        schedule, 
        time, 
        room, 
        current_enrolled, 
        max_students
      )
      VALUES ($1, $2, $3, $4, $5, $6, 0, $7)
      RETURNING *
    `, [batch_name, level_id, teacher_id, schedule, time, room, max_students]);

    res.status(201).json({
      message: 'Batch created successfully',
      batch: result.rows[0]
    });
  } catch (error) {
    console.error('Error creating batch:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Update batch
// @route   PUT /api/batches/:id
// @access  Private (Admin)
const updateBatch = async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      batch_name, 
      level_id, 
      teacher_id, 
      schedule, 
      time, 
      room, 
      max_students 
    } = req.body;

    // Check if batch exists
    const batchExists = await pool.query(
      'SELECT batch_id FROM batches WHERE batch_id = $1',
      [id]
    );

    if (batchExists.rows.length === 0) {
      return res.status(404).json({ message: 'Batch not found' });
    }

    // If batch_name is being changed, check for duplicates
    if (batch_name) {
      const duplicateName = await pool.query(
        'SELECT batch_id FROM batches WHERE batch_name = $1 AND batch_id != $2',
        [batch_name, id]
      );

      if (duplicateName.rows.length > 0) {
        return res.status(400).json({ message: 'Batch name already exists' });
      }
    }

    // If teacher is being changed, verify they exist
    if (teacher_id) {
      const teacherExists = await pool.query(
        'SELECT teacher_id FROM teachers WHERE teacher_id = $1',
        [teacher_id]
      );

      if (teacherExists.rows.length === 0) {
        return res.status(404).json({ message: 'Teacher not found' });
      }
    }

    // If level is being changed, verify it exists
    if (level_id) {
      const levelExists = await pool.query(
        'SELECT level_id FROM levels WHERE level_id = $1',
        [level_id]
      );

      if (levelExists.rows.length === 0) {
        return res.status(404).json({ message: 'Level not found' });
      }
    }

    // Update batch
    const result = await pool.query(`
      UPDATE batches 
      SET 
        batch_name = COALESCE($1, batch_name),
        level_id = COALESCE($2, level_id),
        teacher_id = COALESCE($3, teacher_id),
        schedule = COALESCE($4, schedule),
        time = COALESCE($5, time),
        room = COALESCE($6, room),
        max_students = COALESCE($7, max_students),
        updated_at = NOW()
      WHERE batch_id = $8
      RETURNING *
    `, [batch_name, level_id, teacher_id, schedule, time, room, max_students, id]);

    res.json({
      message: 'Batch updated successfully',
      batch: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating batch:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Delete batch
// @route   DELETE /api/batches/:id
// @access  Private (Admin)
const deleteBatch = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if batch exists
    const batchExists = await pool.query(
      'SELECT batch_id FROM batches WHERE batch_id = $1',
      [id]
    );

    if (batchExists.rows.length === 0) {
      return res.status(404).json({ message: 'Batch not found' });
    }

    // Check if batch has students
    const hasStudents = await pool.query(
      'SELECT COUNT(*) as count FROM students WHERE batch_id = $1 AND status = $2',
      [id, 'active']
    );

    if (parseInt(hasStudents.rows[0].count) > 0) {
      return res.status(400).json({ 
        message: 'Cannot delete batch with active students. Please transfer or remove students first.' 
      });
    }

    // Delete batch
    await pool.query('DELETE FROM batches WHERE batch_id = $1', [id]);

    res.json({ message: 'Batch deleted successfully' });
  } catch (error) {
    console.error('Error deleting batch:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Get batch students
// @route   GET /api/batches/:id/students
// @access  Private (Admin, Teacher)
const getBatchStudents = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(`
      SELECT 
        s.student_id,
        s.roll_number,
        s.full_name,
        s.email,
        s.phone,
        l.level_name,
        s.payment_window,
        s.discount,
        s.status,
        s.enrollment_date
      FROM students s
      INNER JOIN levels l ON s.level_id = l.level_id
      WHERE s.batch_id = $1
      ORDER BY s.roll_number
    `, [id]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching batch students:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Get available batches (with capacity)
// @route   GET /api/batches/available
// @access  Private (Admin)
const getAvailableBatches = async (req, res) => {
  try {
    const { level_id } = req.query;

    let query = `
      SELECT 
        b.batch_id,
        b.batch_name,
        l.level_name,
        t.full_name as teacher_name,
        b.schedule,
        b.time,
        b.room,
        b.current_enrolled,
        b.max_students,
        (b.max_students - b.current_enrolled) as available_slots
      FROM batches b
      INNER JOIN levels l ON b.level_id = l.level_id
      INNER JOIN teachers t ON b.teacher_id = t.teacher_id
      WHERE b.current_enrolled < b.max_students
    `;

    const queryParams = [];

    if (level_id) {
      query += ' AND b.level_id = $1';
      queryParams.push(level_id);
    }

    query += ' ORDER BY b.batch_name';

    const result = await pool.query(query, queryParams);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching available batches:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

module.exports = {
  getAllBatches,
  getBatchById,
  createBatch,
  updateBatch,
  deleteBatch,
  getBatchStudents,
  getAvailableBatches
};
