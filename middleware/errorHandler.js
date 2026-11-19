const multer = require('multer');
const AppError = require('../utils/AppError');
const { isProduction } = require('../config/env');

// Map PostgreSQL error codes to safe client-facing errors.
// Never forward raw SQL messages, constraint names or query text.
const fromPgError = (err) => {
  switch (err.code) {
    case '23505':
      return new AppError(409, 'A record with these details already exists.');
    case '23001':
    case '23503':
      return new AppError(
        409,
        'This action conflicts with related records (for example payments or batch assignments).'
      );
    case '23502':
      return new AppError(400, 'A required field is missing.');
    case '23514':
      return new AppError(400, 'One or more values are not allowed.');
    case '22P02':
    case '22007':
    case '22008':
    case '22003':
      return new AppError(400, 'One or more values have an invalid format.');
    case 'P0001':
      // Raised by our own triggers, e.g. "Batch is full. Maximum capacity is 15"
      return new AppError(400, err.message);
    default:
      return null;
  }
};

const notFound = (req, res) => {
  res.status(404).json({ success: false, message: 'Endpoint not found' });
};

// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  let appError = null;

  if (err instanceof AppError) {
    appError = err;
  } else if (err instanceof multer.MulterError) {
    appError =
      err.code === 'LIMIT_FILE_SIZE'
        ? new AppError(413, 'File is too large.')
        : new AppError(400, 'Invalid file upload.');
  } else if (err.type === 'entity.parse.failed') {
    appError = new AppError(400, 'Malformed JSON body.');
  } else if (err.type === 'entity.too.large') {
    appError = new AppError(413, 'Request body is too large.');
  } else if (err.code) {
    appError = fromPgError(err);
  }

  if (!appError || appError.statusCode >= 500) {
    console.error(`[${req.method} ${req.originalUrl}]`, err);
  }

  const status = appError ? appError.statusCode : 500;
  const body = {
    success: false,
    message: appError ? appError.message : 'Something went wrong. Please try again later.',
  };
  if (appError && appError.details) body.errors = appError.details;
  if (!appError && !isProduction) body.debug = err.message;

  res.status(status).json(body);
};

module.exports = { notFound, errorHandler };
