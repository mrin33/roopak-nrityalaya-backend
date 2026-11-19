// Wraps an async route handler so rejected promises reach the error handler.
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Wraps every function property of a controller object.
const wrapController = (controller) =>
  Object.fromEntries(
    Object.entries(controller).map(([name, value]) => [
      name,
      typeof value === 'function' ? asyncHandler(value) : value,
    ])
  );

module.exports = asyncHandler;
module.exports.asyncHandler = asyncHandler;
module.exports.wrapController = wrapController;
