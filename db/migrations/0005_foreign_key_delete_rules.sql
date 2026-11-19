-- 0005 correct ON DELETE behaviour of foreign keys.
--
-- Problems in the baseline:
--  * "audit" references (created_by, reviewed_by, marked_by, ...) used the
--    default NO ACTION, so deleting a user or teacher who ever created a
--    notice / marked attendance failed with a foreign-key error.
--  * fee_payments cascaded on student deletion, silently destroying
--    financial records. It now RESTRICTs: deactivate such students instead.
--
-- Each constraint is replaced in place (drop + add in one transaction).
-- No rows are deleted or modified. New constraints are added NOT VALID and
-- then validated, which is safe because the referenced data is unchanged.

CREATE OR REPLACE FUNCTION pg_temp.reset_fk(
  p_table text, p_column text, p_ref_table text, p_ref_column text, p_on_delete text
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  c record;
  new_name text := p_table || '_' || p_column || '_fkey';
BEGIN
  IF to_regclass('public.' || p_table) IS NULL THEN
    RETURN;
  END IF;
  FOR c IN
    SELECT con.conname
      FROM pg_constraint con
      JOIN pg_class t ON t.oid = con.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = ANY (con.conkey)
     WHERE con.contype = 'f' AND n.nspname = 'public'
       AND t.relname = p_table AND a.attname = p_column
  LOOP
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', p_table, c.conname);
  END LOOP;
  EXECUTE format(
    'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.%I(%I) ON DELETE %s NOT VALID',
    p_table, new_name, p_column, p_ref_table, p_ref_column, p_on_delete);
  EXECUTE format('ALTER TABLE public.%I VALIDATE CONSTRAINT %I', p_table, new_name);
END $$;

-- Audit / authorship columns: keep the record, forget the author.
SELECT pg_temp.reset_fk('notices',                'created_by',      'users',    'user_id',    'SET NULL');
SELECT pg_temp.reset_fk('events',                 'created_by',      'users',    'user_id',    'SET NULL');
SELECT pg_temp.reset_fk('gallery',                'uploaded_by',     'users',    'user_id',    'SET NULL');
SELECT pg_temp.reset_fk('gallery_requests',       'reviewed_by',     'users',    'user_id',    'SET NULL');
SELECT pg_temp.reset_fk('student_status_changes', 'changed_by',      'users',    'user_id',    'SET NULL');
SELECT pg_temp.reset_fk('batch_transfers',        'created_by',      'users',    'user_id',    'SET NULL');
SELECT pg_temp.reset_fk('attendance',             'marked_by',       'teachers', 'teacher_id', 'SET NULL');
SELECT pg_temp.reset_fk('batch_transfers',        'from_teacher_id', 'teachers', 'teacher_id', 'SET NULL');
SELECT pg_temp.reset_fk('batch_transfers',        'to_teacher_id',   'teachers', 'teacher_id', 'SET NULL');
SELECT pg_temp.reset_fk('learning_resources',     'uploaded_by',     'teachers', 'teacher_id', 'SET NULL');
SELECT pg_temp.reset_fk('makeup_class_bookings',  'approved_by',     'teachers', 'teacher_id', 'SET NULL');
SELECT pg_temp.reset_fk('makeup_class_bookings',  'original_batch_id', 'batches', 'batch_id',  'SET NULL');
SELECT pg_temp.reset_fk('makeup_class_bookings',  'makeup_batch_id', 'batches',  'batch_id',   'SET NULL');

-- Financial records must never disappear as a side effect of a delete.
SELECT pg_temp.reset_fk('fee_payments',           'student_id',      'students', 'student_id', 'RESTRICT');
