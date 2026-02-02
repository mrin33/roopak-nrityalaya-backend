const bcrypt = require('bcryptjs');
const pool = require('../config/database');

// @desc    Create test accounts (Teacher & Admin)
// @route   POST /api/seed/test-accounts
// @access  Public (should be protected in production!)
exports.createTestAccounts = async (req, res) => {
  try {
    // Hash password for test accounts
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash('password123', salt);

    // Check if accounts already exist
    const teacherExists = await pool.query('SELECT * FROM users WHERE email = $1', ['teacher@test.com']);
    const adminExists = await pool.query('SELECT * FROM users WHERE email = $1', ['admin@test.com']);

    const results = {
      teacher: null,
      admin: null,
      message: ''
    };

    // Create Teacher Account
    if (teacherExists.rows.length > 0) {
      results.teacher = { status: 'already_exists', email: 'teacher@test.com' };
    } else {
      // Create teacher user
      const teacherUser = await pool.query(
        `INSERT INTO users (email, password_hash, role, is_active) 
         VALUES ($1, $2, 'teacher', true) 
         RETURNING user_id, email, role`,
        ['teacher@test.com', passwordHash]
      );

      // Create teacher profile
      const teacherProfile = await pool.query(
        `INSERT INTO teachers (user_id, full_name, phone, specialization, experience_years, is_senior, bio)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [
          teacherUser.rows[0].user_id,
          'Priya Sharma',
          '9876543210',
          'Lucknow Gharana',
          15,
          true,
          'Expert Kathak teacher with 15 years of experience in Lucknow Gharana style.'
        ]
      );

      results.teacher = {
        status: 'created',
        email: 'teacher@test.com',
        password: 'password123',
        userId: teacherUser.rows[0].user_id,
        profile: teacherProfile.rows[0]
      };
    }

    // Create Admin Account
    if (adminExists.rows.length > 0) {
      results.admin = { status: 'already_exists', email: 'admin@test.com' };
    } else {
      const adminUser = await pool.query(
        `INSERT INTO users (email, password_hash, role, is_active) 
         VALUES ($1, $2, 'admin', true) 
         RETURNING user_id, email, role`,
        ['admin@test.com', passwordHash]
      );

      results.admin = {
        status: 'created',
        email: 'admin@test.com',
        password: 'password123',
        userId: adminUser.rows[0].user_id
      };
    }

    // Summary message
    const created = [];
    const existing = [];
    
    if (results.teacher.status === 'created') created.push('Teacher');
    else existing.push('Teacher');
    
    if (results.admin.status === 'created') created.push('Admin');
    else existing.push('Admin');

    results.message = `
      ${created.length > 0 ? `✓ Created: ${created.join(', ')}` : ''}
      ${existing.length > 0 ? `Already existed: ${existing.join(', ')}` : ''}
    `.trim();

    res.status(201).json({
      success: true,
      message: 'Test accounts processed successfully',
      data: results,
      credentials: {
        teacher: { email: 'teacher@test.com', password: 'password123' },
        admin: { email: 'admin@test.com', password: 'password123' }
      }
    });

  } catch (error) {
    console.error('Seed error:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating test accounts',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// @desc    Delete test accounts
// @route   DELETE /api/seed/test-accounts
// @access  Public (should be protected in production!)
exports.deleteTestAccounts = async (req, res) => {
  try {
    // Delete teacher account
    await pool.query('DELETE FROM users WHERE email = $1', ['teacher@test.com']);
    
    // Delete admin account
    await pool.query('DELETE FROM users WHERE email = $1', ['admin@test.com']);

    res.json({
      success: true,
      message: 'Test accounts deleted successfully'
    });

  } catch (error) {
    console.error('Delete seed error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting test accounts',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};
