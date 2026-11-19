const rateLimit = require('express-rate-limit');
const { NODE_ENV } = require('../config/env');

const handler = (req, res, next, options) => {
  res.status(options.statusCode).json({ success: false, message: options.message });
};

const make = (windowMinutes, limit, message, extra = {}) =>
  rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message,
    handler,
    skip: () => NODE_ENV === 'test',
    ...extra,
  });

// Brute-force protection: per IP + submitted email.
const loginLimiter = make(15, 10, 'Too many login attempts. Please try again in 15 minutes.', {
  keyGenerator: (req) =>
    `${rateLimit.ipKeyGenerator ? rateLimit.ipKeyGenerator(req.ip) : req.ip}|${String(
      req.body?.email || ''
    ).toLowerCase()}`,
  skipSuccessfulRequests: true,
});

const registerLimiter = make(60, 10, 'Too many registration attempts. Please try again later.');

const passwordSetupLimiter = make(15, 10, 'Too many attempts. Please try again in 15 minutes.');

const uploadLimiter = make(60, 30, 'Upload limit reached. Please try again later.');

// Generous global ceiling for the whole API.
const apiLimiter = make(15, 600, 'Too many requests. Please slow down.');

module.exports = {
  loginLimiter,
  registerLimiter,
  passwordSetupLimiter,
  uploadLimiter,
  apiLimiter,
};
