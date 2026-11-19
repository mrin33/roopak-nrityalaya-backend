-- 0007 contact form storage + learning-resource support (additive only).

-- Messages submitted through the public contact form; read by admins.
CREATE TABLE IF NOT EXISTS public.contact_messages (
  message_id  serial PRIMARY KEY,
  name        varchar(255) NOT NULL,
  email       varchar(255) NOT NULL,
  phone       varchar(20),
  subject     varchar(255),
  message     text NOT NULL,
  is_read     boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_contact_messages_unread ON public.contact_messages (is_read, created_at DESC);

-- learning_resources.file_url holds either an uploaded file ("/uploads/resources/<name>")
-- or an external https link (e.g. a YouTube video).
CREATE INDEX IF NOT EXISTS idx_learning_resources_level ON public.learning_resources (level_id) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_learning_resources_uploader ON public.learning_resources (uploaded_by);
