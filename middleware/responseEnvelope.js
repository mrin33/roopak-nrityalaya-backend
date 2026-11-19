/**
 * Gives every successful JSON response from the API one consistent shape:
 *
 *   { success: true, message?: string, data: <payload> }
 *
 * Errors already use { success: false, message, errors? } (see errorHandler).
 * Controllers may return either a bare payload (array/object) or an object
 * with a `message` plus named fields; the latter becomes
 * { message, data: { ...fields } }. Bodies that already carry a boolean
 * `success` are passed through untouched.
 */
const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

const toEnvelope = (body) => {
  if (isPlainObject(body) && typeof body.success === 'boolean') return body;
  if (isPlainObject(body) && typeof body.message === 'string') {
    const { message, ...rest } = body;
    const keys = Object.keys(rest);
    return { success: true, message, data: keys.length ? rest : null };
  }
  return { success: true, data: body === undefined ? null : body };
};

const responseEnvelope = (req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = (body) => originalJson(res.statusCode >= 400 ? body : toEnvelope(body));
  next();
};

module.exports = responseEnvelope;
module.exports.toEnvelope = toEnvelope;
