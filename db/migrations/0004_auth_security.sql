-- 0004 authentication hardening (additive only).

-- Tokens issued before this moment are rejected by the auth middleware,
-- so changing/setting a password signs out every other session.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS password_changed_at timestamptz;

-- One-time tokens for teacher invitations and password resets.
-- Only a SHA-256 hash of the token is stored.
CREATE TABLE IF NOT EXISTS public.password_setup_tokens (
  token_id    serial PRIMARY KEY,
  user_id     integer NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  token_hash  char(64) NOT NULL UNIQUE,
  purpose     varchar(20) NOT NULL CHECK (purpose IN ('invite', 'reset')),
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  created_by  integer REFERENCES public.users(user_id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_password_setup_tokens_user ON public.password_setup_tokens (user_id);

-- Case-insensitive email lookups (login uses lower(email)).
CREATE INDEX IF NOT EXISTS idx_users_email_lower ON public.users (lower(email));
