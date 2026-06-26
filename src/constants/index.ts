import type { Currency, QuoteStatus, InvoiceStatus, TimesheetStatus, UserSettings, Page } from '@/types'

// ── Currency Config ────────────────────────────────────────────────────────

export const CURRENCIES: Record<Currency, { symbol: string; locale: string; name: string; flag: string }> = {
  ZAR: { symbol: 'R',  locale: 'en-ZA', name: 'South African Rand', flag: '🇿🇦' },
  USD: { symbol: '$',  locale: 'en-US', name: 'US Dollar',           flag: '🇺🇸' },
  GBP: { symbol: '£',  locale: 'en-GB', name: 'British Pound',       flag: '🇬🇧' },
  EUR: { symbol: '€',  locale: 'de-DE', name: 'Euro',                flag: '🇪🇺' },
}

// ── Navigation ─────────────────────────────────────────────────────────────

export const NAV_ITEMS: { id: Page; label: string; icon: string }[] = [
  { id: 'dashboard',  label: 'Dashboard',  icon: 'layout-dashboard' },
  { id: 'timesheets', label: 'Timesheets', icon: 'clock'            },
  { id: 'calculator', label: 'Calculator', icon: 'calculator'       },
  { id: 'quotes',     label: 'Quotes',     icon: 'file-text'        },
  { id: 'invoices',   label: 'Invoices',   icon: 'receipt'          },
  { id: 'profiles',   label: 'Profiles',   icon: 'users'            },
  { id: 'settings',   label: 'Settings',   icon: 'settings'         },
]

// ── Status Configs ─────────────────────────────────────────────────────────

export const QUOTE_STATUSES: Record<QuoteStatus, { label: string; color: string }> = {
  draft:    { label: 'Draft',    color: 'bg-gray-100 text-gray-700'   },
  sent:     { label: 'Sent',     color: 'bg-blue-100 text-blue-700'   },
  accepted: { label: 'Accepted', color: 'bg-green-100 text-green-700' },
  rejected: { label: 'Rejected', color: 'bg-red-100 text-red-700'     },
}

export const INVOICE_STATUSES: Record<InvoiceStatus, { label: string; color: string }> = {
  draft:          { label: 'Draft',   color: 'bg-gray-100 text-gray-700'    },
  unpaid:         { label: 'Unpaid',  color: 'bg-amber-100 text-amber-700'  },
  paid:           { label: 'Paid',    color: 'bg-green-100 text-green-700'  },
  partially_paid: { label: 'Partial', color: 'bg-orange-100 text-orange-700' },
}

export const TIMESHEET_STATUSES: Record<TimesheetStatus, { label: string; color: string }> = {
  open:      { label: 'Open',      color: 'bg-blue-100 text-blue-700'     },
  submitted: { label: 'Submitted', color: 'bg-purple-100 text-purple-700' },
  invoiced:  { label: 'Invoiced',  color: 'bg-green-100 text-green-700'   },
}

// ── Default Settings ───────────────────────────────────────────────────────

export const DEFAULT_BANKING = {
  accountName:   '',
  bankName:      '',
  accountNumber: '',
  branchCode:    '',
  swiftCode:     '',
  iban:          '',
  reference:     '',
}

export const DEFAULT_SETTINGS: UserSettings = {
  companyName:           '',
  crewName:              '',
  role:                  '',
  email:                 '',
  phone:                 '',
  address:               '',
  vatNumber:             '',
  defaultCurrency:       'ZAR',
  defaultVat:            0,
  defaultIncludedHours:  10,
  defaultOvertimeRate:   0,
  defaultMinTurnaround:  10,
  travelTimePaid:        true,
  mealBreaksDeducted:    true,
  bankingDetails:        { ...DEFAULT_BANKING },
}

// ── Storage Keys ───────────────────────────────────────────────────────────

export const STORAGE_KEYS = {
  QUOTES:     'crewquote-pro:quotes',
  INVOICES:   'crewquote-pro:invoices',
  TIMESHEETS: 'crewquote-pro:timesheets',
  PROFILES:   'crewquote-pro:profiles',
  SETTINGS:   'crewquote-pro:settings',
} as const
