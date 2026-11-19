const pool = require('../config/database');
const { withTransaction } = require('../config/database');
const User = require('../models/User');
const Student = require('../models/Student');
const AppError = require('../utils/AppError');
const { wrapController } = require('../utils/asyncHandler');
const {
  hashPassword,
  verifyPassword,
  signToken,
  hashOneTimeToken,
} = require('../utils/security');

const authController = {
  // POST /api/auth/register  (public) — student self-registration
  async register(req, res) {
    const data = req.body; // validated by validators/authValidators.register

    if (await User.emailExists(data.email)) {
      throw AppError.conflict('Email already registered. Please login or use a different email.');
    }

    const passwordHash = await hashPassword(data.password);

    // User and student profile are created atomically: if the profile insert
    // fails, the user row is rolled back and the email stays available.
    const { user, student } = await withTransaction(async (client) => {
      let levelId = data.currentLevelId;
      if (levelId) {
        const { rows } = await client.query('SELECT level_id FROM levels WHERE level_id = $1', [levelId]);
        if (!rows.length) throw AppError.badRequest('Selected level does not exist.');
      } else {
        const { rows } = await client.query('SELECT level_id FROM levels ORDER BY level_number LIMIT 1');
        levelId = rows[0]?.level_id || null;
      }

      const createdUser = await User.create(data.email, passwordHash, 'student', client);
      const createdStudent = await Student.create(
        createdUser.user_id,
        { ...data, currentLevelId: levelId },
        client
      );
      await client.query(
        `INSERT INTO student_status_changes
           (student_id, status_from, status_to, change_type, reason, changed_by)
         VALUES ($1, NULL, 'active', 'enrollment', $2, $3)`,
        [createdStudent.student_id, data.enrollmentReason || 'Online registration', createdUser.user_id]
      );
      return { user: createdUser, student: createdStudent };
    });

    const token = signToken(user);
    res.status(201).json({
      success: true,
      message: 'Registration successful! Welcome to Roopak Nrityalaya.',
      data: {
        token,
        user: {
          userId: user.user_id,
          email: user.email,
          role: user.role,
          profile: {
            ...student,
            studentId: student.student_id,
            fullName: student.full_name,
            currentLevel: student.current_level_id,
          },
        },
      },
    });
  },

  // POST /api/auth/login  (public)
  async login(req, res) {
    const { email, password } = req.body;
    const user = await User.findByEmail(email);

    // Always run bcrypt, even for unknown emails, to avoid timing leaks.
    const valid = await verifyPassword(password, user?.password_hash);
    if (!user || !valid) {
      throw AppError.unauthorized('Invalid email or password');
    }
    // Only reveal the deactivated state after the password was proven.
    if (!user.is_active) {
      throw AppError.forbidden('Your account has been deactivated. Please contact admin.');
    }

    await User.updateLastLogin(user.user_id);
    const withProfile = await User.getUserWithProfile(user.user_id);

    res.json({
      success: true,
      message: 'Login successful!',
      data: {
        token: signToken(user),
        user: {
          userId: user.user_id,
          email: user.email,
          role: user.role,
          profile: withProfile ? withProfile.profile : null,
        },
      },
    });
  },

  // GET /api/auth/me
  async getMe(req, res) {
    const user = await User.getUserWithProfile(req.user.userId);
    if (!user) throw AppError.notFound('User not found');
    res.json({
      success: true,
      data: {
        userId: user.user_id,
        email: user.email,
        role: user.role,
        isActive: user.is_active,
        profile: user.profile,
      },
    });
  },

  // POST /api/auth/logout — JWTs are stateless; the client discards the token.
  async logout(req, res) {
    res.json({ success: true, message: 'Logged out successfully' });
  },

  // GET /api/auth/password-setup/:token  (public) — validate an invite link
  async checkSetupToken(req, res) {
    const { rows } = await pool.query(
      `SELECT u.email, t.purpose
         FROM password_setup_tokens t
         JOIN users u ON u.user_id = t.user_id
        WHERE t.token_hash = $1 AND t.used_at IS NULL AND t.expires_at > now()`,
      [hashOneTimeToken(req.params.token)]
    );
    if (!rows.length) throw AppError.badRequest('This link is invalid or has expired.');
    res.json({ success: true, data: { email: rows[0].email, purpose: rows[0].purpose } });
  },

  // POST /api/auth/set-password  (public) — complete an invite / reset
  async setPassword(req, res) {
    const { token, password } = req.body;
    const passwordHash = await hashPassword(password);

    const user = await withTransaction(async (client) => {
      const { rows } = await client.query(
        `SELECT t.token_id, u.user_id, u.email, u.role, u.is_active
           FROM password_setup_tokens t
           JOIN users u ON u.user_id = t.user_id
          WHERE t.token_hash = $1 AND t.used_at IS NULL AND t.expires_at > now()
          FOR UPDATE OF t`,
        [hashOneTimeToken(token)]
      );
      const row = rows[0];
      if (!row) throw AppError.badRequest('This link is invalid or has expired.');
      if (!row.is_active) throw AppError.forbidden('This account is deactivated. Please contact admin.');

      await User.setPassword(row.user_id, passwordHash, client);
      // Burn this token and any other outstanding tokens for the user.
      await client.query(
        'UPDATE password_setup_tokens SET used_at = now() WHERE user_id = $1 AND used_at IS NULL',
        [row.user_id]
      );
      return row;
    });

    res.json({
      success: true,
      message: 'Your password has been set. You can now log in.',
      data: { email: user.email },
    });
  },

  // PUT /api/auth/change-password  (authenticated)
  async changePassword(req, res) {
    const { currentPassword, newPassword } = req.body;
    const { rows } = await pool.query('SELECT password_hash FROM users WHERE user_id = $1', [req.user.userId]);
    if (!rows.length || !(await verifyPassword(currentPassword, rows[0].password_hash))) {
      throw AppError.badRequest('Current password is incorrect.');
    }
    await User.setPassword(req.user.userId, await hashPassword(newPassword));
    // Issue a fresh token: older tokens are now rejected by the middleware.
    const user = await User.findById(req.user.userId);
    res.json({
      success: true,
      message: 'Password updated successfully.',
      data: { token: signToken(user) },
    });
  },
};

module.exports = wrapController(authController);
