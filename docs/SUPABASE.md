# Supabase setup

MochiNote remains local-first. IndexedDB is the write path; the background worker pushes an outbox and incrementally pulls PostgreSQL rows. Attachments and media remain local only.

## Local development

1. Install the Supabase CLI.
2. Run `supabase start`.
3. Apply migrations with `supabase db reset`.
4. Set these public extension variables:
   - `WXT_PUBLIC_SUPABASE_URL`
   - `WXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
5. Disable email confirmation for the current password-auth phase in Supabase Auth settings.

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

