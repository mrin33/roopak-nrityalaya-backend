# Changelog — backend

## Unreleased (branch `modernization`)

### Security
- **Removed** the public `POST/DELETE /api/seed/test-accounts` endpoints (anyone could create an admin).
  Replaced by CLI scripts: `npm run create-admin`, `npm run seed:dev` (development only, no hardcoded password).
- **Fixed SQL injection** in `PUT /api/students/activity-logs/:id`: column names now come from a fixed allowlist; request bodies are validated and unknown keys stripped.
- **No shared default teacher password.** Teachers are created without a password; the admin receives a one-time, expiring link (`/set-password?token=…`, SHA-256-hashed at rest). `POST /api/admin/teachers/:id/invite` issues a new link.
- Registration runs in a single transaction — a failure can no longer leave an orphaned login.
- Every authenticated request re-checks the user in the database: deleted, deactivated or password-changed accounts lose access immediately. JWTs are HS256-only with an issuer claim; the role is read from the database.
- Deactivating/discontinuing a student or teacher also disables their login; deleting them deletes the login account.
- Helmet security headers, CORS restricted to `FRONTEND_URL`/`CORS_ORIGINS`, rate limits on login/registration/password setup/uploads and a global API limit, 100 kB JSON body limit.
- Input validation with zod on every route that accepts data (types, lengths, enums, dates, ids).
- Uploads: strict MIME allowlist (JPG/PNG/WEBP/GIF/MP4/WEBM/MOV), magic-byte verification, random server-side file names, 50 MB limit; HTML/SVG/other types rejected.
- Uploaded files are no longer served from an open static folder. Only approved media is public; pending/rejected files are served to the owner or an admin via `GET /api/gallery-requests/:id/file`, with `nosniff` and a sandboxing CSP.
- Central error handler: SQL errors, stack traces and internal messages are never returned to clients.
- Login no longer reveals whether an email exists (constant bcrypt work, same message); bcrypt cost raised to 12; password policy: ≥8 chars, letters + numbers.
- Role checks added to all student routes; ownership checks for attendance, reviews, batch transfers, makeup classes, activity logs and gallery files.
- `PUT /api/auth/change-password` added (signs out other sessions).

### Database
- One authoritative schema managed by a migration runner (`db/migrate.js`, `db/migrations/*`). See `docs/DATABASE.md`.
- All queries rewritten against the real schema (previously many referenced non-existent columns/tables such as `students.status`, `students.batch_id`, `reviews`, `payment_status`, `makeup_class_requests`, `user_profiles`).
- Multi-statement operations use real transactions on one acquired client (`withTransaction`).
- Corrected foreign-key delete rules and added indexes/constraints.

### Fixed / now working
- Admin: student status toggle (with history), student update incl. batch reassignment, teacher activate/deactivate, batch delete, fee recording and filters, analytics, status-change history.
- Gallery requests end-to-end; approving publishes to the public gallery (`GET /api/gallery`).
- Notices: one consistent table; guests see only public notices; drafts hidden.
- Routes added for features whose controllers existed but were unreachable: teacher attendance, student reviews, makeup classes (student + teacher), admin attendance oversight.
- Payment history (previously always empty), performance score (was hardcoded 85), practice-hour totals.
- Deleting a batch with attendance history or a student with payments is blocked with a clear message instead of silently destroying records.

### Backend functionality (phase 5)
- **Consistent API responses:** every success is `{ success: true, message?, data }`, every error `{ success: false, message, errors? }` (`middleware/responseEnvelope.js`).
- **Learning resources:** teachers upload files (PDF, MP3/WAV/M4A, MP4/WEBM, images — magic-byte verified) or add https links, and delete their own; students list resources for their level; `GET /api/resources/:id/file` enforces level-based access.
- **Admin Add Student** (`POST /api/admin/students`) with optional batch, enrolment history and an invitation link; `POST /api/admin/students/:id/invite` issues reset links.
- **Admin gallery management:** list/upload/hide/delete (`/api/admin/gallery`).
- **Public site data:** `GET /api/public/teachers`, `GET /api/public/levels` (with fees), `POST /api/public/contact` (stored, rate-limited) and admin inbox `/api/admin/messages` (migration 0007).
- Teacher dashboard returns today's classes and how many still need attendance; admin dashboard counts unread messages.

### Removed
- `controllers/seedController.js`, `routes/seedRoutes.js`, `generatePassword.js`, unused `controllers/batchController.js` and `middleware/roleMiddleware.js`, conflicting schema files.
