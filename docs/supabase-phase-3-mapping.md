# Supabase Phase 3 Mapping

Phase 3 made Supabase authoritative for account profile, business settings, user preferences, clients, and reusable rate presets. Phase 4B additionally makes activated Timesheets, timesheet entries, and day expenses authoritative in Supabase. Invoices, invoice lines, payments, and logo files remain browser-local.

## Local Storage Keys

- `cqp-profile`: current CrewQuote business/settings object.
- `cqp-clients`: app-facing client records.
- `cqp-timesheets`: original Timesheet migration/recovery source; not authoritative for the active UI after Phase 4B activation.
- `cqp-invoices`: browser-local invoices, line items, payment snapshots, and invoice snapshots.
- `cqp-onboarding-dismissed`: onboarding preference compatibility cache.
- `cqp-data-version`: local data-version marker.
- `cqp-local-data-owner-user-id`: Phase 3 temporary owner marker for remaining local records. It is written only after an explicit ownership confirmation, a confirmed Phase 3 import, or a new authenticated local write.
- `cqp-phase4-timesheet-mirror-{userId}`: owner-scoped mapped compatibility mirror written only after complete successful cloud reads/writes; never a general offline source.

## Profile

`profiles` is account identity only:

- `id`: authenticated Supabase user id.
- `full_name`: Account page full name.
- `email`: authentication email mirror where available.
- `created_at`, `updated_at`: display metadata.

Business details are not read from or written to `profiles` during Phase 3 even though older schema columns still exist there.

## Business Settings

`business_settings` stores the former `cqp-profile` business fields:

- `fullName` -> `full_name`
- `companyName` -> `trading_name`
- `role` -> `role`
- `email` -> `business_email`
- `phone` -> `phone`
- `address` -> `billing_address`
- `vatRegistered` -> `vat_registered`
- `vatNumber` -> `vat_number`
- `invoiceLabel` -> `invoice_label`
- `invoiceNumberHistory` -> `invoice_number_history`
- `defaultCurrency` -> `default_currency`
- `defaultDayRate` -> `default_day_rate`
- `defaultIncludedHours` -> `default_included_hours`
- `defaultEquipmentRental` -> `default_equipment_rental`
- `defaultPerDiem` -> `default_per_diem`
- `defaultVat` -> `default_vat`
- `paymentTerms` -> `payment_terms`
- `bankAccountName`, `bankName`, `bankAccountNumber`, `bankBranchCode`, `bankSwift`, `bankIban`, `bankReference` -> matching banking columns
- `defaultOvertimeRule`, `defaultOtBand1Hours`, `defaultOtBand1Mult`, `defaultOtBand2Mult` -> overtime columns
- `defaultMinTurnaround`, `defaultTurnaroundMode`, `defaultTurnaroundPenMult` -> turnaround columns
- `mealBreaksDeducted`, `travelTimePaid`, `equipmentRentalDaily` -> `invoice_preferences` JSON compatibility fields

`businessLogoDataUrl` remains local-only in `cqp-profile`. Phase 3 never uploads it and never overwrites it from a null `business_logo_path`.

## User Preferences

`user_preferences.onboarding_dismissed` stores `cqp-onboarding-dismissed`. `ui_preferences` is reserved for non-financial UI preferences and remains an object.

## Clients

`clients.id` is the Supabase UUID primary key. `clients.legacy_id` preserves the existing CrewQuote browser-facing `Client.id`.

Local `Client.id` values are strings generated as:

```text
{Date.now()}-{Math.random().toString(36).slice(2)}
```

Phase 3 mapping:

- `Client.id` -> `clients.legacy_id`
- `companyName` -> `company_name`
- `contactPerson` -> `contact_person`
- `email` -> `email`
- `phone` -> `phone`
- `billingAddress` -> `billing_address`
- `vatNumber` -> `vat_number`
- `poRequired` -> `po_required`
- `vendorNumber` -> `vendor_number`
- `accountsEmail` -> `accounts_email`
- `paymentTerms` -> `payment_terms`
- `defaultPaymentTerms` -> `default_payment_terms`
- `preferredInvoiceDetailMode` -> `preferred_invoice_detail_mode`
- `rateMemory` -> `rate_memory`
- `notes` -> `notes`

Cloud client reads map back to the existing frontend model with `Client.id = legacy_id || id`. Existing local timesheets and invoices keep their `clientId` strings and are not rewritten.

## Rate Presets

The current app has client-specific last-used rate memory embedded in `Client.rateMemory`; it does not yet expose independent reusable preset management. Phase 3 preserves client rate memory on `clients.rate_memory` and leaves `rate_presets` available for future standalone presets.

## Timesheet Legacy IDs

`timesheets.id` remains the Supabase UUID primary key. `timesheets.legacy_id` preserves the existing CrewQuote app-facing timesheet ID during the staged cloud migration.

- Existing local invoices continue to reference the app-facing timesheet ID, not the cloud UUID.
- `(user_id, legacy_id)` is unique when `legacy_id` is present; null legacy IDs remain valid for existing cloud rows.
- New Phase 4 timesheets will receive both a cloud UUID and an app-facing legacy ID.
- Historical local invoice references must not be rewritten.

## Timesheet Summary Snapshots

`calcSummary` remains the only CrewQuote calculation authority. Phase 4 will run it in the application after a successful work-day change, then save its output on the owning `timesheets` row. PostgreSQL stores the already-calculated values and does not recalculate them with triggers.

| `calcSummary` value | Persisted field |
| --- | --- |
| `totalDays` | `summary_day_count` |
| `totalPaidH` | `summary_paid_hours` |
| `totalOtH` | `summary_overtime_hours` |
| `totalTravH` | `summary_travel_hours` |
| `totalDayRates` | `summary_day_rate_total` |
| `totalOtCost` | `summary_overtime_total` |
| `totalEquip` | `summary_equipment_total` |
| `totalPerDiem` | `summary_per_diem_total` |
| `totalExp` | `summary_expense_total` |
| `totalTurnaroundPenalty` | `summary_turnaround_penalty_total` |
| `subtotal` | `summary_subtotal` |
| `vatPct` | `summary_vat_rate` |
| `mixedVat` | `summary_mixed_vat` |
| `vatAmt` | `summary_vat_amount` |
| `grandTotal` | `summary_grand_total` |

`summary_snapshot` stores an object-form audit snapshot of the calculated summary, including the existing per-day calculation breakdown where Phase 4 supplies it. It is not a second calculation engine and contains no client, invoice, or authentication records.

Work-day rate and calculation snapshots remain on `timesheet_entries`. Loading a timesheet must use saved snapshots rather than recalculating historical values from current Settings. Changing Settings alone must not rewrite summary fields. Invoices remain local during Phase 4 and continue using the existing saved timesheet/day data and invoice workflow.

## Phase 5 Invoice Schema Preparation

Phase 5 application migration is not active yet. The prepared Invoice identity and preservation model is:

- `invoices.id` is the internal Supabase UUID primary key.
- `invoices.legacy_id` is the CrewQuote app-facing `Invoice.id`; non-null values are unique per user.
- `invoices.source_timesheet_legacy_id` preserves the browser-facing `fromTimesheetId` for direct lookup and source-delete protection.
- `invoices.from_timesheet_id` remains the optional internal UUID relationship to the cloud Timesheet.
- `invoices.invoice_snapshot` preserves the exact JSON-serialisable historical local Invoice model, including its client, business, banking, source Timesheet, line, expense, and PDF-visible snapshots where present.
- `invoice_lines.legacy_id` preserves the app-facing line ID; non-null values are unique per user.

Historical Invoice values must be imported from their saved browser records and snapshots. They must not be reconstructed or recalculated from current Timesheets or Settings. Phase 5 will keep the original browser Invoice data as a recovery copy after verified cloud activation.

## Import Batches

Browser migration uses `import_batches` with:

- `source = localstorage-phase-3`
- deterministic SHA-256 fingerprint over canonicalized settings, clients, rate memory, and onboarding data
- `status`: `started`, `completed`, or `failed`
- `imported_counts`: counts for settings, preferences, clients, and rate presets

Retries use stable conflict targets and do not delete unrelated cloud records.
