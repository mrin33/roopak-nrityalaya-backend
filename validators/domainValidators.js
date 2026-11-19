const {
  z,
  requiredText,
  optionalText,
  nullableText,
  email,
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
  emptyToUndefined,
} = require('./common');

// Accept legacy/alternate field names from existing frontend code.
const withAliases = (aliases, schema) =>
  z.preprocess((input) => {
    if (!input || typeof input !== 'object') return input;
    const out = { ...input };
    for (const [canonical, alternates] of Object.entries(aliases)) {
      if (out[canonical] === undefined) {
        const found = alternates.find((a) => out[a] !== undefined);
        if (found) out[canonical] = out[found];
      }
    }
    return out;
  }, schema);

const optionalBool = z.preprocess(emptyToUndefined, bool.optional());
const int = (min, max) => z.coerce.number().int().min(min).max(max);
const optionalInt = (min, max) => z.preprocess(emptyToUndefined, int(min, max).optional());
const notInFuture = (label) => (v) => !v || new Date(v) <= new Date(Date.now() + 24 * 3600 * 1000);
const httpsUrl = z.preprocess(
  (v) => (v === '' ? null : v),
  z
    .string()
    .max(500)
    .url('Must be a valid URL')
    .refine((v) => /^https?:\/\//i.test(v), 'Must be an http(s) URL')
    .nullable()
    .optional()
);

const GENDERS = ['male', 'female', 'other', 'prefer_not_to_say'];
const gender = z.preprocess(emptyToUndefined, z.enum(GENDERS).optional());

// ───────────────────────────── admin ─────────────────────────────
const admin = {
  studentId: idParam('student_id'),
  teacherId: idParam('teacher_id'),
  batchId: idParam('batch_id'),
  attendanceId: idParam('attendance_id'),

  studentsQuery: z.object({
    level_id: optionalId,
    status: z.preprocess(emptyToUndefined, z.enum(['active', 'inactive', 'all']).optional()),
    payment_window: z.preprocess(emptyToUndefined, paymentWindow.optional()),
    search: optionalText(100),
  }),

  updateStudent: withAliases(
    { current_level_id: ['level_id'] },
    z.object({
      full_name: optionalText(255),
      email: z.preprocess(emptyToUndefined, email.optional()),
      phone,
      current_level_id: optionalId,
      batch_id: nullableId,
      payment_window: z.preprocess(emptyToUndefined, paymentWindow.optional()),
      date_of_birth: optionalDate,
      gender,
      address: optionalText(1000),
      emergency_contact_name: optionalText(255),
      emergency_contact: phone,
    })
  ),

  createStudent: withAliases(
    { full_name: ['fullName', 'name'], current_level_id: ['level_id', 'levelId'], payment_window: ['paymentWindow'] },
    z.object({
      email,
      full_name: requiredText('Full name'),
      phone,
      date_of_birth: optionalDate,
      gender,
      address: optionalText(1000),
      emergency_contact_name: optionalText(255),
      emergency_contact: phone,
      current_level_id: id,
      payment_window: z.preprocess(emptyToUndefined, paymentWindow.optional()),
      batch_id: optionalId,
      enrollment_reason: optionalText(2000),
    })
  ),

  galleryId: idParam('gallery_id'),
  galleryCreate: z.object({
    title: requiredText('Title', 255),
    description: optionalText(2000),
    category: optionalText(100),
    is_visible: optionalBool,
  }),
  galleryUpdate: z.object({
    title: optionalText(255),
    description: optionalText(2000),
    category: optionalText(100),
    is_visible: optionalBool,
  }),

  messageId: idParam('message_id'),
  messageUpdate: z.object({ is_read: bool }),

  changeStudentStatus: z.object({
    status: z.enum(['active', 'inactive', 'discontinued'], {
      errorMap: () => ({ message: 'Status must be active, inactive or discontinued' }),
    }),
    reason: optionalText(1000),
    detailed_feedback: optionalText(4000),
  }),

  createTeacher: withAliases(
    { full_name: ['fullName'], experience_years: ['experienceYears'] },
    z.object({
      email,
      full_name: requiredText('Full name'),
      phone,
      specialization: optionalText(255),
      experience_years: optionalInt(0, 80),
      qualifications: optionalText(2000),
      bio: optionalText(4000),
      is_senior: optionalBool,
    })
  ),

  updateTeacher: z.object({
    full_name: optionalText(255),
    email: z.preprocess(emptyToUndefined, email.optional()),
    phone,
    specialization: optionalText(255),
    experience_years: optionalInt(0, 80),
    qualifications: optionalText(2000),
    bio: optionalText(4000),
    is_senior: optionalBool,
    is_active: optionalBool,
  }),

  createBatch: z.object({
    batch_name: requiredText('Batch name', 255),
    level_id: id,
    teacher_id: id,
    schedule: requiredText('Schedule', 100),
    time: requiredText('Time', 50),
    room: optionalText(100),
    max_students: z.preprocess(emptyToUndefined, int(1, 15).optional()),
    start_date: optionalDate,
    end_date: optionalDate,
  }),

  updateBatch: z.object({
    batch_name: optionalText(255),
    level_id: optionalId,
    teacher_id: optionalId,
    schedule: optionalText(100),
    time: optionalText(50),
    room: optionalText(100),
    max_students: z.preprocess(emptyToUndefined, int(1, 15).optional()),
    is_active: optionalBool,
    start_date: nullableDate,
    end_date: nullableDate,
  }),

  feesQuery: z.object({
    status: z.preprocess(
      emptyToUndefined,
      z.enum(['all', 'paid', 'completed', 'pending', 'overdue', 'failed', 'refunded']).optional()
    ),
    month: optionalInt(1, 12),
    year: optionalInt(2000, 2100),
    student_id: optionalId,
  }),

  recordFee: withAliases(
    { transaction_id: ['transaction_reference'] },
    z.object({
      student_id: id,
      amount_paid: z.coerce.number().positive('Amount must be greater than zero').max(10000000),
      late_fee: z.preprocess(emptyToUndefined, z.coerce.number().min(0).max(100000).optional()),
      payment_method: z.preprocess(
        (v) => (v === 'bank_transfer' ? 'net_banking' : emptyToUndefined(v)),
        z.enum(['cash', 'upi', 'card', 'net_banking', 'cheque']).optional()
      ),
      transaction_id: optionalText(255),
      // "YYYY-MM" from <input type="month">
      month: z.preprocess(emptyToUndefined, z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional()),
      payment_date: optionalDate,
      due_date: optionalDate,
      status: z.preprocess(emptyToUndefined, z.enum(['completed', 'pending']).optional()),
      notes: optionalText(1000),
    })
  ),

  statusChangesQuery: z.object({
    change_type: z.preprocess(
      emptyToUndefined,
      z.enum(['all', 'enrollment', 'discontinuation', 'rejoining', 'batch_switch']).optional()
    ),
  }),

  attendanceSummaryQuery: z.object({ start_date: optionalDate, end_date: optionalDate }),

  updateAttendance: z.object({
    status: z.preprocess(emptyToUndefined, z.enum(['present', 'absent', 'late']).optional()),
    notes: nullableText(500),
  }),
};

// ──────────────────────────── teacher ────────────────────────────
const teacher = {
  updateProfile: z.object({
    phone,
    bio: optionalText(4000),
    photo_url: httpsUrl,
    specialization: optionalText(255),
    qualifications: optionalText(2000),
    experience_years: optionalInt(0, 80),
  }),

  markAttendance: withAliases(
    { records: ['attendance_records'] },
    z.object({
      batch_id: id,
      attendance_date: isoDate.refine(notInFuture(), 'Attendance cannot be marked for a future date'),
      records: z
        .array(
          z.object({
            student_id: id,
            status: z.enum(['present', 'absent', 'late']),
            notes: optionalText(500),
          })
        )
        .min(1, 'At least one attendance record is required')
        .max(100),
    })
  ),

  batchAttendanceParams: idParam('batch_id'),
  batchAttendanceQuery: z.object({ date: isoDate }),

  createReview: z.object({
    student_id: id,
    review_month: int(1, 12),
    review_year: int(2000, 2100),
    technique_rating: int(1, 5),
    rhythm_rating: int(1, 5),
    creativity_rating: int(1, 5),
    discipline_rating: int(1, 5),
    review_text: optionalText(4000),
  }),

  createTransfer: withAliases(
    { to_teacher_id: ['substitute_teacher_id'] },
    z.object({
      batch_id: id,
      to_teacher_id: id,
      transfer_date: isoDate,
      reason: optionalText(1000),
      is_permanent: optionalBool,
    })
  ),

  resourceId: idParam('resource_id'),
  createResource: withAliases(
    { level_id: ['level'], resource_type: ['type'] },
    z.object({
      title: requiredText('Title', 255),
      description: optionalText(2000),
      level_id: optionalId,
      resource_type: z.preprocess(emptyToUndefined, z.enum(['video', 'audio', 'document', 'image']).optional()),
      external_url: z.preprocess(
        emptyToUndefined,
        z
          .string()
          .max(500)
          .url('Must be a valid link')
          .refine((v) => /^https:\/\//i.test(v), 'Links must start with https://')
          .optional()
      ),
    })
  ),

  makeupId: idParam('booking_id'),
  makeupDecision: z.object({
    status: z.enum(['approved', 'rejected', 'completed']),
    notes: optionalText(1000),
  }),
};

// ──────────────────────────── student ────────────────────────────
const activityFields = {
  activities_done: optionalText(4000),
  performances: optionalText(2000),
  practice_hours: z.preprocess(emptyToUndefined, z.coerce.number().min(0).max(24).optional()),
  notes: optionalText(4000),
  mood: optionalText(50),
};

const student = {
  updateProfile: z.object({
    phone,
    address: optionalText(1000),
    emergency_contact_name: optionalText(255),
    emergency_contact: phone,
  }),

  paymentWindow: z.object({ payment_window: paymentWindow }),

  logId: idParam('log_id'),
  createActivityLog: z.object({
    log_date: isoDate.refine(notInFuture(), 'Log date cannot be in the future'),
    ...activityFields,
  }),
  // Strict allowlist: these are the ONLY columns an update may touch.
  updateActivityLog: z
    .object({
      log_date: z.preprocess(emptyToUndefined, isoDate.refine(notInFuture(), 'Log date cannot be in the future').optional()),
      ...activityFields,
    })
    .refine((o) => Object.values(o).some((v) => v !== undefined), 'No valid fields to update'),

  attendanceQuery: z.object({ month: optionalInt(1, 12), year: optionalInt(2000, 2100) }),
  reviewsQuery: z.object({
    month: z.preprocess((v) => (v === 'all' || v === '' ? undefined : v), int(1, 12).optional()),
  }),
  reviewId: idParam('review_id'),

  createMakeup: withAliases(
    { attendance_id: ['original_attendance_id'] },
    z.object({
      attendance_id: id,
      makeup_batch_id: id,
      makeup_class_date: isoDate.refine(
        (v) => new Date(v) >= new Date(new Date().toISOString().slice(0, 10)),
        'Makeup class date must be today or later'
      ),
      notes: optionalText(1000),
    })
  ),
};

// ─────────────────────── notices & gallery ───────────────────────
const NOTICE_CATEGORIES = ['general', 'event', 'fees', 'admission', 'workshop', 'holiday', 'examination'];
const noticeBody = withAliases(
  { content: ['description'] },
  z.object({
    title: requiredText('Title', 255),
    content: requiredText('Content', 10000),
    target_audience: z.preprocess(emptyToUndefined, z.enum(['all', 'students', 'teachers']).default('all')),
    category: z.preprocess(emptyToUndefined, z.enum(NOTICE_CATEGORIES).default('general')),
    is_important: optionalBool,
    priority: z.preprocess(emptyToUndefined, z.enum(['normal', 'high']).optional()),
    status: z.preprocess(emptyToUndefined, z.enum(['draft', 'published']).default('published')),
    expiry_date: nullableDate,
    is_active: optionalBool,
  })
);

const content = {
  noticeId: idParam('id'),
  noticeBody,
  noticesQuery: z.object({
    category: z.preprocess((v) => (v === 'all' ? undefined : emptyToUndefined(v)), z.enum(NOTICE_CATEGORIES).optional()),
    target_audience: z.preprocess(
      (v) => (v === 'all' ? undefined : emptyToUndefined(v)),
      z.enum(['students', 'teachers']).optional()
    ),
  }),

  galleryRequestId: idParam('id'),
  galleryUpload: z.object({
    title: requiredText('Title', 255),
    description: optionalText(2000),
    category: optionalText(100),
    media_type: z.preprocess(emptyToUndefined, z.enum(['photo', 'video']).optional()),
  }),
  galleryDecision: z.object({
    status: z.enum(['approved', 'rejected'], { errorMap: () => ({ message: 'Invalid status' }) }),
    rejection_reason: optionalText(1000),
  }),
  mediaParams: z.object({ filename: z.string().max(200) }),
};

// ───────────────────────────── public ─────────────────────────────
const publicSite = {
  contact: z.object({
    name: requiredText('Name', 255),
    email,
    phone,
    subject: optionalText(255),
    message: requiredText('Message', 5000),
  }),
};

module.exports = { admin, teacher, student, content, publicSite, withAliases, NOTICE_CATEGORIES };
