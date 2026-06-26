# CrewQuote Pro — Freelancer Timesheet

> **Timesheets, Invoices and Cost Calculations for Film & TV Crew**

A single-user web app built for freelance crew members. Set your rates once in Settings, then log shoot days in seconds — the app calculates overtime, turnaround, travel, equipment, and per diem automatically.

---

## The Workflow

```
Settings  →  New Timesheet  →  Add Days  →  Summary  →  Create Invoice
(once)        (per job)        (daily)       (totals)    (one click)
```

1. **Settings** — Enter your name, day rate, overtime rate, included hours, equipment rental, per diem, VAT, and banking details. Done once. Saved forever.

2. **New Timesheet** — Enter the production name. Your rates auto-fill every day.

3. **Add Day** — Enter date, location, call time, wrap time. Done. The app calculates everything live as you type:
   - On-set hours (overnight shoots handled automatically)
   - Meal break deduction
   - Travel hours
   - Overtime hours and cost
   - Day total

4. **Weekly tab** — See all days in a table. Turnaround warnings show in amber between short-turnaround days.

5. **Summary tab** — Total days, hours, overtime, equipment, per diem, VAT, grand total.

6. **Create Invoice** — One click generates a professional invoice with all your banking details.

---

## Key Calculations

### Overnight Shoots
Call 22:00, Wrap 06:00 → **8 hours on-set** (not −16 hours).
The app detects when wrap is earlier than call and adds 24h automatically.

### Overtime
```
Paid Hours = (Wrap − Call) − Meal Break + Travel (if enabled)
Overtime   = max(Paid Hours − Included Hours, 0)
OT Cost    = Overtime Hours × OT Rate
Day Total  = Day Rate + OT Cost + Equipment + Per Diem + Expenses
```

### Turnaround
```
Turnaround = Next Call − Previous Wrap (overnight-aware)
Warning if Turnaround < Minimum Turnaround Hours (set in Settings)
```
Example: Wrap 22:00, Next call 06:00 → 8h turnaround, warns if minimum is 10h.

---

## Setup

```bash
npm install
npm run dev
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173)

### First time
1. Go to **Settings**
2. Set your **Full Name** and **Role**
3. Set **Default Rates** (day rate, overtime rate, included hours, equipment, per diem, VAT)
4. Set **Banking Details**
5. Save — done. Now create a timesheet.

### Build for production
```bash
npm run build
```
Deploy the `dist/` folder to any static host (Netlify, Vercel, Cloudflare Pages).

---

## Architecture

All application logic lives in **`src/App.tsx`** — a single, self-contained TypeScript file with no internal imports.

| Section | What it does |
|---|---|
| `DEFAULT_PROFILE` | All user settings with sensible defaults |
| `calcDay()` | Core per-day calculation engine |
| `calcSummary()` | Aggregates all days in a timesheet |
| `calcTurnaround()` | Overnight-aware gap between days |
| `SettingsPage` | 4-tab profile setup (saved to `window.storage`) |
| `AddDayForm` | Daily entry form — auto-fills from profile, rates collapsible |
| `LiveCalcPanel` | Real-time calculation preview (right column) |
| `WeeklyView` | Table of all days with turnaround warnings |
| `SummaryView` | Totals + Create Invoice button |
| `TimesheetsPage` | List + create + detail |
| `InvoicesPage` | List + detail view |

Utility files in `src/utils/` and `src/services/` are kept as clean reference code for Phase 2 (Supabase backend, PDF export service, etc.) but are not imported by the current MVP.

---

## Phase 2 Roadmap

The utility/service files are already written and ready:

- **`src/services/pdf.ts`** — HTML-print-based PDF export for timesheets, quotes, invoices (no DOMPurify dependency)
- **`src/services/storage.ts`** — Drop-in replacement with localStorage. Swap `window.storage` → `localStorage` for deployment outside Claude artifacts
- **`src/utils/calculations.ts`** — Same calculation engine extracted as pure functions for testing
- **`src/utils/time.ts`** — Overnight-aware time utilities

### When ready to add a backend
1. Replace `window.storage` calls with Supabase queries
2. Add authentication (Supabase Auth)
3. Add `src/services/pdf.ts` exports to the PDF buttons
4. Add Stripe subscriptions

---

## Production Notes

### Storage
In this version, data persists in `window.storage` (Claude artifact storage). For a deployed standalone app, change `Store.get/set` in `App.tsx` to use `localStorage`:

```ts
const Store = {
  get: (k: string) => JSON.parse(localStorage.getItem(k) || 'null'),
  set: (k: string, v: unknown) => localStorage.setItem(k, JSON.stringify(v)),
}
```

### Security
- `vite.config.ts` sets `host: '127.0.0.1'` to mitigate GHSA-67mh-4wv8-2f99 (esbuild dev server exposure)
- No jsPDF / DOMPurify in the dependency tree (previously had 13+ CVEs)
- All user input is escaped before HTML rendering

---

## Licence
Private / Commercial — CrewQuote Pro
