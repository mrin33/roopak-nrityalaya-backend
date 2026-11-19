-- 0006 indexes for the application's query patterns, plus integrity
-- constraints. Uniqueness constraints are only created when existing data
-- already satisfies them; otherwise a NOTICE is raised and nothing changes,
-- so this migration can never fail on, or alter, existing records.

-- Foreign-key / filter columns used in joins and WHERE clauses.
CREATE INDEX IF NOT EXISTS idx_students_user               ON public.students (user_id);
CREATE INDEX IF NOT EXISTS idx_teachers_user               ON public.teachers (user_id);
CREATE INDEX IF NOT EXISTS idx_student_batches_batch_active   ON public.student_batches (batch_id)   WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_student_batches_student_active ON public.student_batches (student_id) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_attendance_batch_date       ON public.attendance (batch_id, attendance_date);
CREATE INDEX IF NOT EXISTS idx_fee_payments_status_due     ON public.fee_payments (status, due_date);
CREATE INDEX IF NOT EXISTS idx_notices_visible             ON public.notices (status, is_active, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gallery_requests_student    ON public.gallery_requests (student_id);
CREATE INDEX IF NOT EXISTS idx_gallery_visible             ON public.gallery (is_visible, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_teacher_reviews_teacher     ON public.teacher_reviews (teacher_id);
CREATE INDEX IF NOT EXISTS idx_batch_transfers_batch       ON public.batch_transfers (batch_id);
CREATE INDEX IF NOT EXISTS idx_makeup_bookings_student     ON public.makeup_class_bookings (student_id);
CREATE INDEX IF NOT EXISTS idx_makeup_bookings_makeup_batch ON public.makeup_class_bookings (makeup_batch_id);
CREATE INDEX IF NOT EXISTS idx_status_changes_student      ON public.student_status_changes (student_id, created_at DESC);

-- Conditional uniqueness: a user has at most one profile, a student at most
-- one active batch, and emails are unique case-insensitively.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'students_user_id_key') THEN
    IF EXISTS (SELECT user_id FROM public.students WHERE user_id IS NOT NULL GROUP BY user_id HAVING count(*) > 1) THEN
      RAISE NOTICE 'Skipped students_user_id_key: duplicate user_id values exist.';
    ELSE
      CREATE UNIQUE INDEX students_user_id_key ON public.students (user_id);
    END IF;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'teachers_user_id_key') THEN
    IF EXISTS (SELECT user_id FROM public.teachers WHERE user_id IS NOT NULL GROUP BY user_id HAVING count(*) > 1) THEN
      RAISE NOTICE 'Skipped teachers_user_id_key: duplicate user_id values exist.';
    ELSE
      CREATE UNIQUE INDEX teachers_user_id_key ON public.teachers (user_id);
    END IF;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'student_batches_one_active_key') THEN
    IF EXISTS (SELECT student_id FROM public.student_batches WHERE is_active GROUP BY student_id HAVING count(*) > 1) THEN
      RAISE NOTICE 'Skipped student_batches_one_active_key: a student has several active batches.';
    ELSE
      CREATE UNIQUE INDEX student_batches_one_active_key ON public.student_batches (student_id) WHERE is_active;
    END IF;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'users_email_lower_key') THEN
    IF EXISTS (SELECT lower(email) FROM public.users GROUP BY lower(email) HAVING count(*) > 1) THEN
      RAISE NOTICE 'Skipped users_email_lower_key: emails differing only by case exist.';
    ELSE
      CREATE UNIQUE INDEX users_email_lower_key ON public.users (lower(email));
    END IF;
  END IF;
END $$;

-- Value-range checks (NOT VALID: enforced for new/updated rows only).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'student_activity_logs_practice_hours_check') THEN
    ALTER TABLE public.student_activity_logs ADD CONSTRAINT student_activity_logs_practice_hours_check
      CHECK (practice_hours >= 0 AND practice_hours <= 24) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fee_payments_amounts_check') THEN
    ALTER TABLE public.fee_payments ADD CONSTRAINT fee_payments_amounts_check
      CHECK (amount_paid >= 0 AND total_amount >= 0 AND late_fee_applied >= 0) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fee_payments_month_check') THEN
    ALTER TABLE public.fee_payments ADD CONSTRAINT fee_payments_month_check
      CHECK (payment_month IS NULL OR payment_month BETWEEN 1 AND 12) NOT VALID;
  END IF;
END $$;
