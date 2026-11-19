# Database

## Source of truth

The schema is defined **only** by the SQL migrations in `db/migrations/`.
The old `database-schema.sql`, `database/schema-v2.sql`, `database/sample-data.sql`
and `live_schema*.sql` files conflicted with each other and were removed
(they remain in git history).

| Migration | Purpose |
|---|---|
| `0001_baseline` | Exact schema of the production database (pg_dump of 2026-04-06). **Adopted, not executed**, on a database that already has the tables. |
| `0002_reference_data` | The 8 Kathak levels and the default fee structure (`ON CONFLICT DO NOTHING`). |
| `0003_reconcile_notices_gallery_requests` | Converges both historical shapes of `notices` / `gallery_requests` onto one structure; adds `category`, `status`, `updated_at` to notices and `gallery.source_request_id`. Renames/adds columns only. |
| `0004_auth_security` | `users.password_changed_at`, `password_setup_tokens` (teacher invitations / resets). |
| `0005_foreign_key_delete_rules` | Audit columns `ON DELETE SET NULL`; `fee_payments.student_id` → `RESTRICT` so payments are never deleted as a side effect. |
| `0006_indexes_and_constraints` | Indexes for the app's queries; uniqueness only where existing data already satisfies it; `NOT VALID` range checks. |

No migration drops a table, truncates data or deletes rows.

## Commands

```bash
npm run migrate:status   # what is applied / pending
npm run migrate          # apply pending migrations (each in its own transaction)
npm run create-admin     # create or reset an admin account (replaces the old /api/seed route)
SEED_PASSWORD='Demo-pass1' npm run seed:dev   # demo accounts, refuses to run in production
```

## Applying to the existing (live) database — do this once

Direct access to the live database was not available while these migrations
were written. They were verified against throwaway PostgreSQL 18 clusters
loaded with (a) an empty database, (b) the production dump plus sample data,
and (c) the dump with the alternative ad-hoc `notices`/`gallery_requests`
tables. Before running them against real data:

1. **Back up:** `pg_dump -Fc -d roopak_nrityalaya -f roopak-backup.dump`
2. Optionally restore the backup into a scratch database and run
   `npm run migrate` against that first.
3. Run `npm run migrate`. Watch for `NOTICE` lines from 0006 — they mean a
   uniqueness index was skipped because existing data contains duplicates
   (e.g. two users whose emails differ only by case). Clean those up and add
   the index in a new migration.
4. Existing users keep their passwords. Existing sessions (old token format)
   are rejected, so everyone logs in once more.

## Rules for new schema changes

* Add a new file `NNNN_description.sql`; never edit an applied migration
  (the runner detects checksum changes and refuses to continue).
* Prefer additive changes. For risky constraints use `NOT VALID`, then
  `VALIDATE CONSTRAINT` in a later migration after cleaning data.
