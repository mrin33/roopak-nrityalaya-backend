// An error whose message is safe to show to API clients.
class AppError extends Error {
  constructor(statusCode, message, details) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.details = details;
  }

  static badRequest(message = 'Invalid request', details) {
    return new AppError(400, message, details);
  }

  static unauthorized(message = 'Authentication required.') {
    return new AppError(401, message);
  }

  static forbidden(message = 'Access denied. Insufficient permissions.') {
    return new AppError(403, message);
  }

  static notFound(message = 'Resource not found') {
    return new AppError(404, message);
  }

  static conflict(message) {
    return new AppError(409, message);
  }
}

module.exports = AppError;
