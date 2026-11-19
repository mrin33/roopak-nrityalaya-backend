-- 0003 reconcile `notices` and `gallery_requests`.
--
-- Two incompatible definitions of these tables existed:
--   A) the live dump: notices(notice_id, description, priority, is_active, ...)
--                     gallery_requests(request_id, media_url, student_id -> students)
--   B) ad-hoc scripts: notices(id, content, category, is_important, status, ...)
--                     gallery_requests(id, file_url, student_id -> users)
-- `CREATE TABLE IF NOT EXISTS` in those scripts was a no-op where (A) existed,
-- but a database may have been created from (B). This migration converges
-- EITHER shape onto one canonical structure (A + the extra columns the admin
-- UI needs). It only renames and adds columns; no data is dropped.

-- ───────────────────────────── notices ─────────────────────────────
DO $$
BEGIN
  -- Shape B → canonical names
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'notices' AND column_name = 'id')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'notices' AND column_name = 'notice_id') THEN
    ALTER TABLE public.notices RENAME COLUMN id TO notice_id;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'notices' AND column_name = 'content')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'notices' AND column_name = 'description') THEN
    ALTER TABLE public.notices RENAME COLUMN content TO description;
  END IF;
END $$;

ALTER TABLE public.notices ADD COLUMN IF NOT EXISTS priority    varchar(20) DEFAULT 'normal';
ALTER TABLE public.notices ADD COLUMN IF NOT EXISTS expiry_date date;
ALTER TABLE public.notices ADD COLUMN IF NOT EXISTS is_active   boolean DEFAULT true;
ALTER TABLE public.notices ADD COLUMN IF NOT EXISTS created_by  integer;
ALTER TABLE public.notices ADD COLUMN IF NOT EXISTS category    varchar(50) DEFAULT 'general';
ALTER TABLE public.notices ADD COLUMN IF NOT EXISTS status      varchar(20) DEFAULT 'published';
ALTER TABLE public.notices ADD COLUMN IF NOT EXISTS updated_at  timestamp DEFAULT CURRENT_TIMESTAMP;

-- Carry shape-B "is_important" into priority (the column itself is kept).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'notices' AND column_name = 'is_important') THEN
    EXECUTE $q$UPDATE public.notices SET priority = 'high' WHERE is_important IS TRUE AND priority IS DISTINCT FROM 'high'$q$;
  END IF;
END $$;

UPDATE public.notices SET category   = 'general'   WHERE category IS NULL;
UPDATE public.notices SET status     = 'published' WHERE status IS NULL;
UPDATE public.notices SET priority   = 'normal'    WHERE priority IS NULL;
UPDATE public.notices SET is_active  = true        WHERE is_active IS NULL;
UPDATE public.notices SET updated_at = created_at  WHERE updated_at IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notices_status_check') THEN
    ALTER TABLE public.notices ADD CONSTRAINT notices_status_check
      CHECK (status IN ('draft', 'published')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notices_category_check') THEN
    ALTER TABLE public.notices ADD CONSTRAINT notices_category_check
      CHECK (category IN ('general', 'event', 'fees', 'admission', 'workshop', 'holiday', 'examination')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notices_priority_check') THEN
    ALTER TABLE public.notices ADD CONSTRAINT notices_priority_check
      CHECK (priority IN ('normal', 'high')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notices_target_audience_check') THEN
    ALTER TABLE public.notices ADD CONSTRAINT notices_target_audience_check
      CHECK (target_audience IN ('all', 'students', 'teachers')) NOT VALID;
  END IF;
END $$;

-- ───────────────────────── gallery_requests ─────────────────────────
DO $$
DECLARE
  fk record;
  student_fk_targets_users boolean := false;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'gallery_requests' AND column_name = 'id')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'gallery_requests' AND column_name = 'request_id') THEN
    ALTER TABLE public.gallery_requests RENAME COLUMN id TO request_id;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'gallery_requests' AND column_name = 'file_url')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'gallery_requests' AND column_name = 'media_url') THEN
    ALTER TABLE public.gallery_requests RENAME COLUMN file_url TO media_url;
  END IF;

  -- Shape B pointed student_id at users.user_id; canonical is students.student_id.
  FOR fk IN
    SELECT c.conname, a.attname, cl.relname AS ref_table
      FROM pg_constraint c
      JOIN pg_class t   ON t.oid = c.conrelid
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
      JOIN pg_class cl  ON cl.oid = c.confrelid
     WHERE c.contype = 'f' AND t.relname = 'gallery_requests' AND a.attname = 'student_id'
  LOOP
    IF fk.ref_table = 'users' THEN
      student_fk_targets_users := true;
      EXECUTE format('ALTER TABLE public.gallery_requests DROP CONSTRAINT %I', fk.conname);
    END IF;
  END LOOP;

  IF student_fk_targets_users THEN
    -- Translate user ids into student ids; rows with no matching student keep NULL.
    UPDATE public.gallery_requests gr
       SET student_id = s.student_id
      FROM public.students s
     WHERE s.user_id = gr.student_id;
    ALTER TABLE public.gallery_requests
      ADD CONSTRAINT gallery_requests_student_id_fkey
      FOREIGN KEY (student_id) REFERENCES public.students(student_id) ON DELETE CASCADE NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gallery_requests_status_check') THEN
    ALTER TABLE public.gallery_requests ADD CONSTRAINT gallery_requests_status_check
      CHECK (status IN ('pending', 'approved', 'rejected')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gallery_requests_media_type_check') THEN
    ALTER TABLE public.gallery_requests ADD CONSTRAINT gallery_requests_media_type_check
      CHECK (media_type IN ('photo', 'video')) NOT VALID;
  END IF;
END $$;

-- Link an approved request to the gallery item it published.
ALTER TABLE public.gallery ADD COLUMN IF NOT EXISTS source_request_id integer;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gallery_source_request_id_fkey') THEN
    ALTER TABLE public.gallery ADD CONSTRAINT gallery_source_request_id_fkey
      FOREIGN KEY (source_request_id) REFERENCES public.gallery_requests(request_id) ON DELETE SET NULL;
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS gallery_source_request_id_key
  ON public.gallery (source_request_id) WHERE source_request_id IS NOT NULL;
