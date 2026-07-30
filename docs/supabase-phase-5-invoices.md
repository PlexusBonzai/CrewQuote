# Supabase Phase 5 Invoices

## Authority and preservation

After verified Phase 5 activation, Supabase is authoritative for `invoices`, `invoice_lines`, and `payments`. The existing `cqp-invoices` value is retained unchanged as an owner-protected browser recovery source and is never silently treated as current cloud data.

- `invoices.id` is the internal Supabase UUID.
- `invoices.legacy_id` is the app-facing CrewQuote Invoice ID.
- `invoices.source_timesheet_legacy_id` preserves the original `fromTimesheetId`.
- `invoices.from_timesheet_id` is the optional internal cloud Timesheet UUID.
- `invoices.invoice_snapshot` preserves the saved historical Invoice model.
- `invoice_lines.legacy_id` and `payments.legacy_id` preserve unique app-facing IDs per user.

Business logo data URLs are not uploaded. Cloud snapshot writers blank logo fields, and mapped reads overlay logo values only from the authenticated browser owner's recovery copy. Existing scalar Invoice columns remain available for lists, status, totals, and payment summaries. Historical values are imported from saved browser records and are never reconstructed from current Timesheets or Settings.

## Confirmed migration

The Settings → Data & Backup action:

1. Confirms the authenticated user owns the browser data.
2. Validates Invoice, line, and Payment IDs and required saved values.
3. Generates and downloads a complete safety backup.
4. Computes a deterministic SHA-256 fingerprint using saved Invoice identities, dates, statuses, modes, snapshots, source references, lines, expenses, totals, VAT, Payments, and protected state.
5. Uses `import_batches` source `localstorage-phase-5-invoices`.
6. Resolves owner-scoped Client and source Timesheet UUIDs where available.
7. Upserts headers by Invoice legacy ID, lines by line legacy ID, and Payments by Payment legacy ID.
8. Re-reads and verifies all identities, relationships, snapshots, lines, Payments, and decimal financial fields.
9. Marks the import batch and owner-scoped Phase 5 marker complete only after verification.
10. Activates the Supabase Invoice workspace and writes an owner-scoped compatibility mirror.

Existing lines or Payments without IDs receive deterministic IDs derived from the Invoice legacy ID and their stable source/position. A failed or partially completed import can safely retry. Browser source records are not deleted.

## Cloud workspace

Complete Invoice reads load headers, lines, and Payments before replacing UI state. Account changes immediately clear the prior state. A cloud failure shows an error and retry action; it does not fall back to stale recovery Invoices.

Invoice creation and draft editing save the header, both line collections, Payments, scalar totals, and the current saved snapshot. The existing calculation and PDF paths are unchanged. Sent, paid, and otherwise protected Invoices retain the existing editing restrictions and remain snapshot-driven.

Payment additions, edits, deletion, and Mark Paid use stable Payment records. After each change, the existing Invoice paid amount and balance fields are persisted and the complete Invoice is re-read. The original Invoice total is never changed by a Payment operation.

Allowed Invoice deletion removes Payments first, then lines, then the Invoice. It does not mutate the source Timesheet. Timesheet and work-day deletion protection re-reads cloud Invoice references when Phase 5 is active.

Complete backup export fetches authoritative cloud Invoices, lines, and Payments. It stops if any required cloud fetch fails, includes local logo and ownership/migration metadata, and labels the original browser Invoices as recovery data.

## Manual acceptance tests

### Migration

- [ ] A browser owner with existing local Invoices sees exact Invoice, line, Payment, protected, paid, and outstanding counts before confirmation.
- [ ] Starting migration downloads the complete safety backup before cloud writes.
- [ ] Invoice numbers, dates, modes, statuses, snapshots, lines, totals, VAT, Payments, and balances match after migration.
- [ ] Running the same migration again verifies the completed fingerprint and creates no duplicates.
- [ ] Business logo data remains browser-local and the original `cqp-invoices` recovery value remains present.

### Historical Invoice and PDF

- [ ] Open existing draft, sent, partial, paid, overdue, and cancelled Invoices after refresh.
- [ ] Confirm Detailed, Summary, and Summary + Timesheet modes are unchanged.
- [ ] Compare historical PDF/print output with the pre-migration backup.
- [ ] Confirm totals, client/business/banking snapshots, Invoice expenses, and protected behavior are unchanged.

### New Invoice and draft editing

- [ ] Create an Invoice from a cloud Timesheet, refresh, and open it from the Invoice list.
- [ ] Retry a simulated header/line failure and confirm no duplicate Invoice or lines are created.
- [ ] Edit a draft's details, line items, manual expenses, and mode; refresh and verify.
- [ ] Confirm sent/paid Invoices cannot silently edit or rebuild saved values.

### Payments

- [ ] Add a partial Payment with date, method, reference, and notes; refresh and verify the balance.
- [ ] Edit and delete the Payment; refresh after each action.
- [ ] Mark Paid and confirm Payments equal the original total and balance reaches zero.
- [ ] Confirm Payments cannot exceed the original Invoice total and never change that total.

### Failure and isolation

- [ ] Save while offline and confirm there is no success message and form content remains available.
- [ ] Confirm a failed complete cloud read does not display stale recovery Invoices.
- [ ] Confirm User A cannot read or mutate User B's Invoices, lines, Payments, snapshots, production names, or totals.
- [ ] Confirm an account switch clears Invoice state before the new account load completes.
- [ ] Confirm same-browser recovery data remains blocked for a non-owning account.

### Delete protection and backup

- [ ] A source Timesheet and referenced work day cannot be deleted while a cloud Invoice depends on it.
- [ ] An allowed draft/cancelled Invoice with no Payments deletes without changing its source Timesheet.
- [ ] Protected or paid Invoice deletion remains blocked with the existing explanation.
- [ ] Complete backup contains authoritative cloud Invoices, lines, and Payments plus clearly labelled local recovery and logo data.
- [ ] A forced Invoice fetch failure stops backup export and is not labelled complete.
