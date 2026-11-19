const { z } = require('zod');

// Trim strings and turn empty strings into undefined (so optional fields
// submitted as "" by HTML forms behave like "not provided").
const emptyToUndefined = (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v);
const trimmed = (v) => (typeof v === 'string' ? v.trim() : v);

const text = (max) => z.preprocess(trimmed, z.string().max(max, `Must be at most ${max} characters`));
const requiredText = (label, max = 255) =>
  z.preprocess(
    trimmed,
    z
      .string({ required_error: `${label} is required`, invalid_type_error: `${label} must be text` })
      .min(1, `${label} is required`)
      .max(max, `${label} must be at most ${max} characters`)
  );
const optionalText = (max) => z.preprocess(emptyToUndefined, text(max).optional());
const nullableText = (max) =>
  z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? null : v), text(max).nullable().optional());

const email = z.preprocess(
  (v) => (typeof v === 'string' ? v.trim().toLowerCase() : v),
  z.string({ required_error: 'Email is required' }).email('Please provide a valid email address').max(255)
);

// bcrypt only uses the first 72 bytes of a password.
const password = z
  .string({ required_error: 'Password is required' })
  .min(8, 'Password must be at least 8 characters long')
  .refine((v) => Buffer.byteLength(v, 'utf8') <= 72, 'Password must be at most 72 bytes long')
  .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), 'Password must contain at least one letter and one number');

const id = z.coerce
  .number({ invalid_type_error: 'Invalid id' })
  .int('Invalid id')
  .positive('Invalid id')
  .max(2147483647, 'Invalid id');
const optionalId = z.preprocess(emptyToUndefined, id.optional());
const nullableId = z.preprocess((v) => (v === '' ? null : v), id.nullable().optional());

const idParam = (name) => z.object({ [name]: id });

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
  .refine((v) => !Number.isNaN(Date.parse(v)), 'Invalid date');
const optionalDate = z.preprocess(emptyToUndefined, isoDate.optional());
const nullableDate = z.preprocess((v) => (v === '' ? null : v), isoDate.nullable().optional());

const phone = z.preprocess(
  emptyToUndefined,
  z
    .string()
    .trim()
    .regex(/^[+\d][\d\s()-]{6,19}$/, 'Please provide a valid phone number')
    .optional()
);

const bool = z.preprocess((v) => {
  if (v === 'true' || v === '1') return true;
  if (v === 'false' || v === '0') return false;
  return v;
}, z.boolean());

const PAYMENT_WINDOWS = ['monthly', 'quarterly', 'half_yearly', 'yearly'];
const paymentWindow = z.enum(PAYMENT_WINDOWS, { errorMap: () => ({ message: 'Invalid payment window' }) });

module.exports = {
  z,
  text,
  requiredText,
  optionalText,
  nullableText,
  email,
  password,
  id,
  optionalId,
  nullableId,
  idParam,
  isoDate,
  optionalDate,
  nullableDate,
  phone,
  bool,
  paymentWindow,
  PAYMENT_WINDOWS,
  emptyToUndefined,
};
