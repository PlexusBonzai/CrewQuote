# CrewQuote Pro

Freelancer timesheets, invoices, clients, and cost calculations for Film & TV crew.

This project currently ships the monolithic React app in `src/App.tsx`. The modular rewrite work has been preserved in `archive/modular-wip/`, but it is not wired into the running app or the production build yet.

## Current App

The active app is rendered by `src/main.tsx`, which imports `src/App.tsx` directly. The active navigation includes:

- Timesheets
- Clients
- Invoices
- Settings

The app stores data in browser `localStorage` using `cqp-*` keys, with a fallback read/write path for `window.storage` when available. No backend is required for the current version.

## Core Workflow

1. Open Settings and enter your crew profile, rates, VAT preference, payment terms, and banking details.
2. Create clients as needed.
3. Create a timesheet for a production.
4. Add shoot days with call time, wrap time, meal break, travel time, expenses, and optional rate overrides.
5. Review weekly totals, overtime, turnaround warnings, equipment, per diem, VAT, and totals.
6. Create and export invoices from completed timesheets.

## Key Calculations

Overnight shoots are handled by treating a wrap time earlier than the call time as the next day.

```text
Call 22:00, Wrap 06:00 -> 8 hours on set
```

Per-day totals include:

```text
Work hours = on-set hours - meal break
Paid hours = work hours + paid travel hours
Overtime = max(paid hours - included hours, 0)
Day total = day rate + overtime + equipment + per diem + expenses
```

Turnaround warnings and penalties are calculated in the active `src/App.tsx` implementation.

## Setup

```bash
npm install
npm run dev
```

Open the URL printed by Vite, usually `http://127.0.0.1:5173`.

## Build

```bash
npm run build
```

The production build checks only the active app files:

- `src/main.tsx`
- `src/App.tsx`

The archived modular files are intentionally excluded from TypeScript checking until that rewrite is ready to be resumed.

## Project Structure

```text
src/
  App.tsx       Active monolithic app
  main.tsx      React entrypoint
  index.css     Tailwind/global styles

archive/modular-wip/
  src/          Preserved modular rewrite work, not part of the active app
```

## Notes For Future Modular Work

Before moving `archive/modular-wip/src` back into `src`, finish the migration deliberately:

- Add the required router, charting, and PDF dependencies only if they are still needed.
- Add or update `@/*` path aliases in both TypeScript and Vite.
- Add a data migration from current `cqp-*` localStorage keys to any new storage keys.
- Wire the modular app through `src/main.tsx`.
- Re-expand `tsconfig.json` only after the modular files compile.

## License

Private / Commercial - CrewQuote Pro
