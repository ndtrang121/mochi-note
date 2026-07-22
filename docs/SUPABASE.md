# Supabase setup

MochiNote remains local-first. IndexedDB is the write path; the background worker pushes an outbox and incrementally pulls PostgreSQL rows. Attachments and media remain local only.

## Local development

Start Docker Desktop, install dependencies, then run:

```powershell
pnpm supabase:setup:test
```

This starts the local stack, applies pending migrations, creates the ignored `.env.local`
with only the public URL/key, runs database advisors and Auth/RLS/LWW verification, and
builds the extension. It is safe to run repeatedly and does not reset existing local data.

Related commands:

```powershell
pnpm supabase:start
pnpm supabase:verify
pnpm supabase:reset
pnpm supabase:stop
```

`supabase:reset` is intentionally separate because it deletes local database data before
reapplying migrations. Email confirmation remains disabled for the current local password-auth phase.
Never add a service-role key to the extension or any `WXT_PUBLIC_*` variable.

## Backup and migration

Create a logical backup:

```bash
supabase db dump --project-ref <project-ref> -f backup.sql
supabase db dump --project-ref <project-ref> --data-only -f data.sql
```

Restore to a self-hosted PostgreSQL/Supabase database after reviewing roles and extensions:

```bash
psql --single-transaction --variable ON_ERROR_STOP=1 -f backup.sql <connection-string>
psql --single-transaction --variable ON_ERROR_STOP=1 -f data.sql <connection-string>
```

Schedule encrypted backups and regularly test restoration. Keep Auth schema/roles and extension versions compatible when moving from the hosted platform.

