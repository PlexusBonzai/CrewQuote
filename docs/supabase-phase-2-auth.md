# Supabase Phase 2 Authentication

Phase 2 adds Supabase Auth to the existing CrewQuote Pro UI. It protects access to the current app, adds registration, login, email confirmation, password reset, session restoration, logout, and an Account screen.

## Scope

Included:

- Auth provider and protected app wrapper in `src/auth/`
- Login, registration, email confirmation, forgot-password, and reset-password screens in `src/components/auth/`
- Account profile screen in `src/components/account/AccountPage.tsx`
- Auth/profile service functions in `src/services/authService.ts`
- Browser Supabase client typed with `Database` from `src/types/database.types.ts`

Not included:

- No localStorage migration
- No timesheet, client, invoice, setting, calculation, or PDF storage changes
- No database schema changes
- No hosted Supabase linking, pushing, or automatic project configuration

## Environment

Copy `.env.example` to `.env.local` for local auth testing:

```bash
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_PUBLISHABLE_KEY=replace-with-local-publishable-key
```

`VITE_SUPABASE_PUBLISHABLE_KEY` is preferred. Existing local projects that still expose `VITE_SUPABASE_ANON_KEY` are also supported by the browser client.

The app still builds without these variables. Without a URL and either browser-safe key, CrewQuote shows a configuration screen instead of creating a Supabase client.

## Supabase Dashboard Settings

Configure these manually in the Supabase Dashboard for whichever local or hosted project you are testing. Do not paste privileged server keys into Vite environment files.

Local development:

```text
Site URL: http://127.0.0.1:5173
Additional Redirect URLs:
http://127.0.0.1:5173?auth=confirmed
http://127.0.0.1:5173?auth=recovery
http://localhost:5173?auth=confirmed
http://localhost:5173?auth=recovery
```

Production placeholders:

```text
Site URL: https://your-production-domain.example
Additional Redirect URLs:
https://your-production-domain.example?auth=confirmed
https://your-production-domain.example?auth=recovery
```

Email confirmation links should return to `?auth=confirmed`. Password reset links should return to `?auth=recovery`.

Before public testing, configure the email provider settings and preferably custom SMTP in the Supabase Dashboard so confirmation and recovery emails are delivered from a verified sender.

## Data Boundary

Phase 2 only queries Supabase Auth and the current user's `profiles` row. The Account screen updates `profiles.full_name` for the authenticated user and reads the authenticated email from Supabase Auth.

All CrewQuote business data remains browser-local:

- Timesheets
- Clients
- Invoices
- Business settings
- Logo data used by the existing UI
- PDF/export workflows

The UI intentionally shows a local-data notice after sign-in so users understand that existing records are not yet synced or account-bound.

## Manual Test Flow

1. Start Vite with local Supabase environment variables present.
2. Register with email, full name, and password.
3. Confirm the email through Supabase's local email tool or configured email provider.
4. Verify the app loads only after a valid session exists.
5. Sign out from Account and confirm the protected app returns to login.
6. Request a password reset and verify the recovery link opens the reset-password screen.
7. Save a full-name change on Account and confirm only the current user's `profiles` row is updated.
8. Confirm existing timesheets, clients, invoices, settings, calculations, and PDF export still use browser-local data.
