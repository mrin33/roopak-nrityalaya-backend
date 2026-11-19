const jwt = require('jsonwebtoken');
const pool = require('../config/database');
const { jwt: jwtConfig } = require('../config/env');
const AppError = require('../utils/AppError');

const extractToken = (req) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  return token || null;
};

// Verify the JWT, then confirm against the database that the account still
// exists, is active and has not changed its password since the token was
// issued. This makes deactivation, deletion and password resets take effect
// immediately instead of when the token expires.
const resolveUser = async (token) => {
  let payload;
  try {
    payload = jwt.verify(token, jwtConfig.secret, {
      algorithms: ['HS256'],
      issuer: jwtConfig.issuer,
    });
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      throw AppError.unauthorized('Your session has expired. Please log in again.');
    }
    throw AppError.unauthorized('Invalid session. Please log in again.');
  }

  const userId = parseInt(payload.sub, 10);
  if (!Number.isInteger(userId)) {
    throw AppError.unauthorized('Invalid session. Please log in again.');
  }

  const { rows } = await pool.query(
    `SELECT user_id, email, role, is_active, password_changed_at
       FROM users WHERE user_id = $1`,
    [userId]
  );
  const user = rows[0];

  if (!user || !user.is_active) {
    throw AppError.unauthorized('Your account is no longer active. Please contact the academy.');
  }

  if (user.password_changed_at) {
    const changedAt = Math.floor(new Date(user.password_changed_at).getTime() / 1000);
    if (payload.iat < changedAt) {
      throw AppError.unauthorized('Your password was changed. Please log in again.');
    }
  }

  // Role always comes from the database, never from the token alone.
  return { userId: user.user_id, email: user.email, role: user.role };
};

const authenticateToken = async (req, res, next) => {
  try {
    const token = extractToken(req);
    if (!token) throw AppError.unauthorized('Authentication required.');
    req.user = await resolveUser(token);
    next();
  } catch (err) {
    next(err);
  }
};

// Attaches req.user when a valid token is present; otherwise continues as a
// guest. Used by public endpoints whose output depends on the viewer.
const optionalAuth = async (req, res, next) => {
  const token = extractToken(req);
  if (!token) return next();
  try {
    req.user = await resolveUser(token);
  } catch (err) {
    req.user = undefined;
  }
  next();
};

const authorizeRole = (...allowedRoles) => (req, res, next) => {
  if (!req.user) return next(AppError.unauthorized());
  if (!allowedRoles.includes(req.user.role)) return next(AppError.forbidden());
  next();
};

module.exports = {
  authenticateToken,
  optionalAuth,
  authorizeRole,
};
