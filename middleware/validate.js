const AppError = require('../utils/AppError');

/**
 * Validate and sanitise request parts with zod schemas.
 * Unknown keys are stripped, so handlers only ever see allowlisted fields.
 *   router.post('/x', validate({ body: schema, params: schema, query: schema }), handler)
 */
const validate = (schemas) => (req, res, next) => {
  const errors = [];
  for (const part of ['params', 'query', 'body']) {
    if (!schemas[part]) continue;
    const result = schemas[part].safeParse(req[part] ?? {});
    if (!result.success) {
      for (const issue of result.error.issues) {
        errors.push({ field: issue.path.join('.') || part, message: issue.message });
      }
    } else if (part === 'query') {
      // req.query is a getter in Express 5-style setups; store separately.
      req.validatedQuery = result.data;
    } else {
      req[part] = result.data;
    }
  }
  if (errors.length) {
    return next(AppError.badRequest(errors[0].message, errors));
  }
  next();
};

module.exports = validate;
