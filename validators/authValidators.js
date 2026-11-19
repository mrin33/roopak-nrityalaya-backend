const {
  z,
  requiredText,
  optionalText,
  email,
  password,
  phone,
  optionalDate,
  paymentWindow,
} = require('./common');

const register = z.object({
  email,
  password,
  fullName: requiredText('Full name', 255),
  phone: z.preprocess((v) => v, phone.refine((v) => !!v, 'Phone number is required')),
  dateOfBirth: optionalDate,
  gender: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.enum(['male', 'female', 'other', 'prefer_not_to_say']).optional()
  ),
  address: optionalText(1000),
  emergencyContactName: optionalText(255),
  emergencyContact: phone,
  currentLevelId: z.preprocess(
    (v) => (v === '' || v === null || Number.isNaN(v) ? undefined : v),
    z.coerce.number().int().min(1).max(8).optional()
  ),
  paymentWindow: z.preprocess((v) => (v === '' ? undefined : v), paymentWindow.optional()),
  enrollmentReason: optionalText(2000),
});

const login = z.object({
  email,
  // Do not apply the password policy at login: legacy passwords must still work.
  password: z.string({ required_error: 'Password is required' }).min(1, 'Password is required').max(200),
});

const setPassword = z.object({
  token: z.string({ required_error: 'Token is required' }).min(20).max(200),
  password,
});

const changePassword = z.object({
  currentPassword: z.string().min(1, 'Current password is required').max(200),
  newPassword: password,
});

module.exports = { register, login, setPassword, changePassword };
