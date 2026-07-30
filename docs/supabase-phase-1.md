# Supabase Phase 1

Phase 1 adds local Supabase infrastructure only. It does not add login or registration screens, replace `localStorage`, connect the UI to Supabase data, or apply anything to a hosted Supabase project.

## Scope

Included:

- Supabase browser client dependency: `@supabase/supabase-js`
- Supabase CLI dev dependency and local scripts
- Local Supabase project config in `supabase/config.toml`
- Versioned migration in `supabase/migrations/20260727120000_supabase_phase_1.sql`
- Additive schema-completion migration in `supabase/migrations/20260727133000_supabase_phase_1_schema_completion.sql`
- Typed browser client in `src/lib/supabase.ts`
- Type-generation target in `src/types/database.types.ts`
- Private Storage bucket named `business-logos`

Not included yet:

- Auth screens or auth routing
- Data reads/writes from the active React UI
- Migration from current `cqp-*` browser `localStorage`
- Hosted Supabase linking, pushing, or remote type generation

## Environment

Copy `.env.example` to `.env.local` only when you want to test against a local Supabase stack.

```bash
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_PUBLISHABLE_KEY=replace-with-local-publishable-key
```

The app still builds without these variables. `src/lib/supabase.ts` exports `supabase` as `null` when the variables are absent and exposes `getSupabaseBrowserClient()` for future code that wants a hard failure only at the point of use.

## Local Commands

```bash
npm run supabase:start
npm run supabase:reset
npm run supabase:types:local
npm run supabase:stop
```

These commands are local-only. They require Docker through the Supabase CLI.

## Database Shape

The migration creates these owned application tables:

- `profiles`
- `business_settings`
- `user_preferences`
- `clients`
- `rate_presets`
- `timesheets`
- `timesheet_entries`
- `day_expenses`
- `invoices`
- `invoice_lines`
- `payments`
- `import_batches`

Every user-owned table has either `id = auth.uid()` for `profiles` or a `user_id` column referencing `auth.users(id)`. Child relationships use composite foreign keys such as `(user_id, client_id)`, `(user_id, timesheet_id)`, `(user_id, timesheet_entry_id)`, and `(user_id, invoice_id)` so rows cannot link to another user's parent records.

Client identity is transitional during the localStorage-to-cloud migration:

- `clients.id` is the Supabase UUID primary key.
- `clients.legacy_id` preserves the existing CrewQuote browser-facing client ID used by local timesheets and invoices.
- Local timesheets and invoices continue referencing `legacy_id` during Phase 3.
- `(user_id, legacy_id)` is unique when `legacy_id` is present; multiple null `legacy_id` values are allowed.
- New cloud clients receive both a UUID and an app-facing legacy ID during Phase 3.
- Historical local timesheet and invoice client references must not be rewritten during Phase 3.

Important constraints include:

- Per-user unique timesheet and invoice numbers
- One business settings row and one preferences row per user
- Idempotent localStorage import batches by per-user source fingerprint
- Positive payment amounts
- Enum-backed statuses, overtime rules, turnaround modes, invoice detail modes, currencies, and invoice line categories
- Non-negative money, hour, multiplier, meal-break, and line-order checks
- Due dates cannot be before issue dates
- JSON snapshot fields must be JSON objects
- Logo paths must live under the current user's Storage folder

## RLS

Row Level Security is enabled on all Phase 1 application tables. Authenticated users can select, insert, update, and delete only their own rows. Anonymous access is revoked for these tables.

The RLS policies intentionally do not expose shared data or cross-user relationships.

## Storage

The migration creates a private Storage bucket:

```text
business-logos
```

Objects must be stored under a user-id folder:

```text
{auth.uid()}/logo-file-name.png
```

Storage policies allow authenticated users to read, insert, update, and delete only objects whose first path segment matches their own user id. The `profiles.business_logo_path` and `invoices.seller_logo_path` constraints mirror that folder rule.

The bucket allows original uploads up to 5 MB. The browser UI may still compress or resize logos later, but Phase 1 keeps the database/storage limit aligned with the original migration requirement.

## Type Generation

After the local Supabase stack is running and migrations have been applied:

```bash
npm run supabase:types:local
```

This overwrites `src/types/database.types.ts` from the local database. Do not run remote type generation or link to a hosted project during Phase 1.

## Verification

Recommended local checks:

```bash
npm run build
npm run supabase:reset
npm run supabase:types:local
```

If Docker is unavailable, `supabase:reset` and `supabase:types:local` cannot be fully verified locally. The app build and secret scan should still pass without Supabase environment variables.
