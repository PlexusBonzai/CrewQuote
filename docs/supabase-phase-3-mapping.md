# Supabase Phase 3 Mapping

Phase 3 makes Supabase authoritative for account profile, business settings, user preferences, clients, and reusable rate presets where they exist. Timesheets, timesheet entries, day expenses, invoices, invoice lines, payments, and logo files remain local until later phases.

## Local Storage Keys

- `cqp-profile`: current CrewQuote business/settings object.
- `cqp-clients`: app-facing client records.
- `cqp-timesheets`: browser-local timesheets and entries.
- `cqp-invoices`: browser-local invoices, line items, payment snapshots, and invoice snapshots.
- `cqp-onboarding-dismissed`: onboarding preference compatibility cache.
- `cqp-data-version`: local data-version marker.
- `cqp-local-data-owner-user-id`: Phase 3 temporary owner marker for remaining local records. It is written only after an explicit ownership confirmation, a confirmed Phase 3 import, or a new authenticated local write.

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

## Import Batches

Browser migration uses `import_batches` with:

- `source = localstorage-phase-3`
- deterministic SHA-256 fingerprint over canonicalized settings, clients, rate memory, and onboarding data
- `status`: `started`, `completed`, or `failed`
- `imported_counts`: counts for settings, preferences, clients, and rate presets

Retries use stable conflict targets and do not delete unrelated cloud records.
