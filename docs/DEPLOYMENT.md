# Deployment guide

Target setup: **Neon** (or Supabase) for PostgreSQL, **Render** for the API,
**Vercel** for the React app. Nothing here has been deployed; follow the steps
when you are ready. Never put secrets in git — set them in each provider's dashboard.

## 1. Environment variables

### API (`backend`)

| Variable | Required | Example / notes |
|---|---|---|
| `NODE_ENV` | yes | `production` (enables fail-fast checks) |
| `PORT` | no | Render sets it automatically |
| `DATABASE_URL` | yes* | `postgres://user:pass@host/db?sslmode=require`. *Or use `DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME`. |
| `DB_SSL` | yes (managed DB) | `true` = encrypted and certificate verified. `no-verify` only if a provider's certificate cannot be verified. |
| `DB_POOL_MAX` | no | default 10; keep below the provider's connection limit |
| `JWT_SECRET` | yes | 32+ random characters, not a placeholder (`node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`) |
| `JWT_EXPIRES_IN` | no | default `1d` |
| `FRONTEND_URL` / `CORS_ORIGINS` | yes | Public frontend origin(s), comma separated, no trailing slash, e.g. `https://roopak.vercel.app,https://www.example.com`. Wildcards are not supported, so Vercel preview URLs are blocked unless listed. |
| `TRUST_PROXY` | yes on Render | `1` (so rate limiting sees real client IPs) |
| `UPLOAD_DIR` | yes | Absolute path on a **persistent disk**, e.g. `/var/data/uploads` |
| `UPLOAD_MAX_MB` | no | default 50 |
| `BCRYPT_ROUNDS`, `INVITE_TOKEN_TTL_HOURS` | no | defaults 12 / 72 |

The API refuses to start in production if `JWT_SECRET` is missing, too short or
looks like a placeholder, or if no frontend origin is configured.

### Frontend (`frontend`)

| Variable | Required | Notes |
|---|---|---|
| `VITE_API_URL` | yes | API origin, e.g. `https://roopak-api.onrender.com` (no trailing slash, no `/api`). Read **at build time**; changing it requires a redeploy. If empty, the app calls its own origin. |

## 2. Database (Neon or Supabase)

1. Create a project and a database. Copy the **direct** connection string
   (not the pooled/pgbouncer one): migrations use a session-level advisory lock.
2. **Existing data?** Take a backup first: `pg_dump -Fc -d <old db> -f backup.dump`,
   restore it into the new database (`pg_restore --no-owner -d <new db> backup.dump`).
3. Apply migrations: `DATABASE_URL=... DB_SSL=true npm run migrate`
   (check with `npm run migrate:status`). On an empty database the baseline is
   executed; on a restored production dump it is adopted without being re-run.
   No migration drops or truncates data (see `docs/DATABASE.md`).
4. Create the first admin: `DATABASE_URL=... DB_SSL=true npm run create-admin`.
   Do **not** run `seed:dev` against production (it refuses to).
5. Neon free projects suspend when idle; the first request after a pause is slow.
   Supabase: use the direct connection (port 5432), not the transaction pooler (6543), for migrations.

## 3. API on Render

1. New → Blueprint, pick the backend repo (this repo contains `render.yaml`), or
   create a Web Service manually with:
   - Build command: `npm ci --omit=dev`
   - Pre-deploy command: `npm run migrate` (on a free instance without pre-deploy
     support, use start command `npm run migrate && npm start`)
   - Start command: `npm start`
   - Health check path: `/health`
2. Set the environment variables from the table above.
3. **Media storage:** uploads are written to `UPLOAD_DIR`. Render's filesystem is
   ephemeral, so attach a **persistent disk** (mount `/var/data`, `UPLOAD_DIR=/var/data/uploads`;
   paid instances only). Without a disk, uploaded gallery photos and resources are
   deleted on every deploy/restart. A disk also limits the service to one instance.
   Moving media to S3-compatible object storage (R2, Supabase Storage) would remove
   both limits but needs a storage account and a code change.
4. After the first deploy check `https://<api>/health` → `{"status":"ok"}`
   (`503 {"status":"unavailable"}` means the database is unreachable).

## 4. Frontend on Vercel

1. Import the frontend repo. Framework preset **Vite** (detected from `vercel.json`):
   build `npm run build`, output `dist`.
2. Environment variable: `VITE_API_URL=https://<your-api>.onrender.com`.
3. `vercel.json` rewrites every path to `index.html` (so `/admin/dashboard` and
   other deep links work on refresh), caches hashed assets for a year and adds
   basic security headers. For Netlify/Cloudflare Pages `public/_redirects` does the same.
4. After deploying, add the Vercel URL to the API's `FRONTEND_URL`/`CORS_ORIGINS`
   and redeploy the API — invitation/reset links are built from this value too.

## 5. Go-live checklist

- [ ] Change the passwords of `admin@roopak.com`, `priya.sharma@roopak.com`, `student1@test.com` (were `password123`) or delete those accounts.
- [ ] Fill in `frontend/src/config/academy.js` (address, phone, hours, social links) and rebuild.
- [ ] Open the site, log in as each role, upload a gallery photo, redeploy the API and confirm the photo is still there (proves the persistent disk).
- [ ] Confirm CORS: the browser console shows no CORS errors on the login page.
- [ ] Email delivery and online payments are **not** implemented (no SMTP / gateway credentials). Admins share invitation links manually and record payments by hand.

## 6. Local development

```bash
# backend
cp .env.example .env      # fill in DB settings and a JWT_SECRET
npm ci && npm run migrate && SEED_PASSWORD='Demo-pass1' npm run seed:dev && npm run dev
# frontend
cp .env.example .env      # VITE_API_URL=http://localhost:5000
npm ci && npm run dev     # http://localhost:3000
```

## 7. Tests

`npm test` (backend) runs three end-to-end suites against a running API
(`TEST_API_URL`, default `http://localhost:5055`) backed by a **disposable**
database seeded with `seed:dev` — never point them at production data. Frontend:
`npm test` (Vitest route smoke tests), `npm run lint`, `npm run build`.
