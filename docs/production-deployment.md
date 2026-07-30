# CrewQuote production deployment

This runbook prepares a Vite production build for conventional Apache/shared hosting. It does not deploy the site or change Supabase schema, migrations, policies, or Auth settings automatically.

The examples deliberately use `https://app.example.com`. Replace that placeholder with the real HTTPS origin before configuring or building production.

## 1. Supabase Auth URLs

In the linked hosted Supabase project, open **Authentication → URL Configuration**.

1. Set **Site URL** to `https://app.example.com`.
2. Add `https://app.example.com/**` to **Redirect URLs** so confirmation and password-recovery links can return to application routes on the same origin.
3. Remove obsolete preview URLs only after confirming they are no longer used. Keep localhost redirects if local Auth testing still needs them.
4. Confirm email confirmation remains enabled if that is the intended account policy.

In **Authentication → Email Templates**, verify confirmation and password-recovery templates use Supabase's redirect variables rather than a hard-coded development host.

## 2. Production SMTP

In **Project Settings → Authentication → SMTP Settings** (location may be shown under Authentication settings in the dashboard):

1. Configure a production SMTP provider and a sender address on a domain you control.
2. Complete the provider's SPF, DKIM, and DMARC setup.
3. Send confirmation and password-reset tests to at least two external mailbox providers.
4. Confirm links return to `https://app.example.com` and that expired links show CrewQuote's recovery state safely.

Do not rely on the Supabase development mail service for production delivery.

## 3. Private logo bucket checklist

In **Storage**, inspect the existing `business-logos` bucket. It must remain:

- private (public access disabled);
- limited to 5 MB objects;
- restricted in the application to PNG, JPEG, and WebP;
- protected by authenticated `SELECT`, `INSERT`, `UPDATE`, and `DELETE` policies whose first folder segment equals `auth.uid()`;
- free of permanent public URLs.

CrewQuote stores objects under the authenticated user's folder and records the active private path in `business_settings.business_logo_path`. The browser downloads the object through the signed-in Supabase client and converts it to a data URL for the unchanged invoice preview and PDF paths. No service-role client or user-supplied account ID is used.

## 4. Production environment

Create `.env.local` on the trusted build machine (it is Git-ignored):

```dotenv
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-browser-publishable-key
```

Both values are required by the production runtime validator. A legacy `VITE_SUPABASE_ANON_KEY` is accepted only in local development, not in a production build.

Only browser-safe Supabase values may use the `VITE_` prefix. Never place a service-role JWT, an `sb_secret_...` key, database password, SMTP credential, or other secret in a Vite environment variable: Vite embeds referenced values into browser assets.

The committed `.env.example` intentionally contains blank values. Before release, confirm `.env.local` is ignored with:

```powershell
git check-ignore .env.local
```

## 5. Build and inspect

From the repository root:

```powershell
npm ci
npm run build
```

Confirm:

- `dist/index.html` exists;
- `dist/.htaccess` exists (Vite copies it from `public/.htaccess`);
- asset filenames in `dist/assets` are hashed;
- no `.env`, `.env.local`, source map containing secrets, service-role key, or SMTP/database credential appears in `dist`;
- opening the build without required production variables shows the configuration error without printing supplied values.

## 6. Apache/shared-host requirements

The virtual host or hosting account must provide:

- Apache `mod_rewrite`;
- `AllowOverride FileInfo` (or `AllowOverride All`) for the deployed directory so `.htaccess` rewrite rules are honored;
- `mod_headers` for cache and conservative security headers;
- `mod_expires` support for explicit expiration behavior;
- HTTPS with a valid certificate.

The committed `.htaccess` serves existing assets directly, sends unknown application routes to `index.html`, prevents aggressive caching of `index.html`, and assigns long immutable caching only to hashed assets. It sets `X-Content-Type-Options`, referrer and permissions policies, and same-origin frame protection. It intentionally does not impose a strict CSP before Supabase/Auth/PDF compatibility has been tested under one.

If the app is deployed below a path rather than at the origin root, stop and validate Vite `base`, Supabase redirect URLs, and Apache rewrite base before release.

## 7. Deploy the build

1. Back up the currently deployed document root.
2. Upload the **contents** of `dist` to the HTTPS document root for `https://app.example.com`; include the hidden `.htaccess` file.
3. Do not upload `.env.local`, repository files, `node_modules`, Supabase migrations, or source code.
4. Purge any host/CDN cache for `index.html`; hashed assets may remain cached.
5. Visit the root and a direct application route in a fresh private window.

## 8. Production smoke tests

Use a dedicated non-admin test account:

1. Register, receive the confirmation email, follow the link, sign in, sign out, and sign back in.
2. Request password recovery, follow the email link, set a new password, and sign in with it.
3. Confirm owner-scoped settings, clients, Timesheets, Invoices, lines, and Payments load normally.
4. If an owner-matched browser logo exists with no cloud logo, verify the one-time notice and **Keep Browser Only** without data loss.
5. Use **Upload Existing Logo**, refresh, sign out/in, and confirm the same private logo appears in Settings, invoice preview, print preview, and generated PDF.
6. Replace the logo with another accepted image; refresh and confirm only the verified replacement is active.
7. Try an unsupported file and a file over 5 MB; confirm the active logo and unsaved Settings fields remain unchanged.
8. Remove the logo explicitly, refresh, and confirm it is absent while the exported backup still labels the browser recovery copy separately.
9. Switch between two test accounts in the same browser profile and confirm neither account ever displays the other's logo.
10. Export a backup and confirm `cloudRecovery.businessLogo` states whether the current image is cloud-backed and contains a recoverable data URL, while `phase4Recovery.businessLogoRecovery` is separately owner-labelled when present. Confirm restore remains disabled with an account-aware explanation.
11. Paste a nested application URL into a new tab and confirm Apache returns the app; request a missing asset URL and confirm it is not mistaken for a valid asset.

## 9. Rollback

If a release fails:

1. Restore the previous document-root backup, including its `.htaccess`.
2. Purge `index.html` from host/CDN caches.
3. Leave the Supabase database, migrations, private logo bucket, and browser recovery records intact.
4. If Auth URL changes caused the problem, restore the previously recorded Site URL and Redirect URL list in the dashboard.
5. Diagnose against the failed `dist` artifact offline. Do not delete private Storage objects or browser recovery records as part of a hosting rollback.

No database downgrade is part of this Phase 6 rollback because Phase 6 does not change schema or migrations.
