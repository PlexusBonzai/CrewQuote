# Supabase Phase 4B Timesheets

## Source of truth and activation

Supabase is authoritative for the normal Timesheets workspace when either:

- the authenticated user matches `cqp-local-data-owner-user-id` and has the owner-scoped `cqp-phase4-timesheets-migration-completed-{userId}` marker; or
- the browser has no Timesheets requiring migration.

If browser Timesheets exist without the verified Phase 4 marker, `cqp-timesheets` remains the visible migration/recovery source and the workspace shows a migration-required notice. A different browser owner is blocked before private local state is rendered.

After cloud activation, no local key is authoritative for active Timesheet UI state. The active model is a complete mapped read from Supabase held in React state.

- `cqp-phase4-timesheet-mirror-{userId}` is the owner-scoped compatibility mirror. It stores mapped application models after complete successful cloud reads/writes only. It is not offline sync.
- `cqp-timesheets` is the original browser migration/recovery source. It is not displayed as current after activation and is not overwritten by normal cloud CRUD.
- `cqp-invoices` remains authoritative for browser-local invoices, embedded invoice lines, payment fields, invoice snapshots, and invoice numbering compatibility.
- `cqp-profile` continues to hold the local business-logo data URL compatibility copy; logos are not uploaded.

## Cloud tables used

The Timesheets workspace queries `timesheets`, `timesheet_entries`, `day_expenses`, and `clients`. Normal Phase 4B writes target only the three Timesheet tables. Invoice, invoice-line, and payment tables are not queried or mutated by invoice workflows.

App-facing legacy IDs remain stable. Supabase UUIDs are resolved internally for parent/child relationships. A day expense uses `{entryLegacyId}:expense`; zero or empty expense values delete or omit that child.

After every work-day mutation, CrewQuote re-reads mapped entries and expenses, runs the shared `calcSummary`, persists all deployed summary scalar fields plus `summary_snapshot`, then performs a final complete read before updating UI and the compatibility mirror. `calcSummary.totalTravH` maps to `timesheets.summary_travel_hours`; there is no `summary_travel_total` field or monetary travel summary.

## Backup behavior

An activated complete backup fetches the account profile, business settings, preferences, clients, rate presets, Timesheets, entries, and day expenses from Supabase. It combines them with the browser logo, invoices, embedded invoice lines/payments, ownership metadata, calculation snapshots, numbering data, and migration metadata. If current cloud Timesheets cannot be fetched, complete export stops with an error; stale `cqp-timesheets` recovery data is not silently labelled current.

Mixed cloud/local restore remains disabled.

## Required manual tests

### Existing migrated account

- [ ] Timesheets load from Supabase; counts and totals match the reviewed migration.
- [ ] Browser refresh retains the same cloud records and totals.

### New Timesheet

- [ ] Create, refresh, edit production/details/rates, refresh, and delete.
- [ ] A failed create keeps the form and Retry does not create a second legacy-ID row.

### Work days and expenses

- [ ] Add, edit, duplicate, Duplicate Previous Day, and delete.
- [ ] Add, edit, and remove the scalar expense; verify exactly one stable `day_expenses` row and no zero-value phantom row.
- [ ] Retry a partial/offline duplicate and confirm no second entry row is created.

### Failure handling

- [ ] Save offline: no success toast appears, values remain, the mirror remains unchanged, and Retry succeeds.
- [ ] Delete and duplicate actions are disabled while their request is active.

### Delete protection

- [ ] A Timesheet referenced by a local invoice names the blocking invoice and cannot be deleted.
- [ ] A work day in a Timesheet referenced by a local invoice cannot be deleted.

### Invoice compatibility

- [ ] Existing local invoices open with unchanged totals and generate the same PDF.
- [ ] Create a Detailed, Summary, and Summary + Timesheet invoice from a cloud Timesheet.
- [ ] Confirm the invoice remains in `cqp-invoices` and no Supabase `invoices`, `invoice_lines`, or `payments` row is created.

### Account isolation

- [ ] In one browser, sign in as User A, then User B.
- [ ] User B cannot see User A Timesheets, invoices, mirror, production names, totals, or snapshots.
- [ ] RLS prevents direct cross-owner access.

### Calculation regression

Use day rate R4,000, 10 included hours, R1,500 equipment, call 07:00, wrap 20:00, one-hour deducted meal, and R150 Parking expense.

- [ ] Before save: 12 paid hours, 2 overtime hours, R1,200 overtime, R6,850 day total.
- [ ] Confirm the same values after Supabase save and browser refresh.
- [ ] Confirm them in calculation breakdown, Timesheet summary, printed Timesheet, and a new local invoice.
- [ ] Confirm the existing VAT workflow remains unchanged.
