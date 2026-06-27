// ============================================================================
// CREWQUOTE PRO — Type Definitions
// ============================================================================

export type Currency = 'ZAR' | 'USD' | 'GBP' | 'EUR';

export type QuoteStatus    = 'draft' | 'sent' | 'accepted' | 'rejected';
export type InvoiceStatus  = 'draft' | 'unpaid' | 'paid' | 'partially_paid';
export type TimesheetStatus = 'open' | 'submitted' | 'invoiced';

export type Page =
  | 'dashboard'
  | 'timesheets'
  | 'calculator'
  | 'quotes'
  | 'invoices'
  | 'profiles'
  | 'settings';

// ── Shared ─────────────────────────────────────────────────────────────────

export interface LineItem {
  id: string;
  description: string;
  quantity: number;
  rate: number;
  amount: number;
}

export interface BankingDetails {
  accountName: string;
  bankName: string;
  accountNumber: string;
  branchCode: string;
  swiftCode: string;
  iban: string;
  reference: string;
}

// ── Quote ──────────────────────────────────────────────────────────────────

export interface Quote {
  id: string;
  quoteNumber: string;
  companyName: string;
  crewName: string;
  role: string;
  client: string;
  date: string;
  lineItems: LineItem[];
  subtotal: number;
  vat: number;
  vatAmount: number;
  total: number;
  notes: string;
  currency: Currency;
  status: QuoteStatus;
  createdAt: string;
}

// ── Invoice ────────────────────────────────────────────────────────────────

export interface Invoice {
  id: string;
  invoiceNumber: string;
  companyName: string;
  issueDate: string;
  dueDate: string;
  clientName: string;
  crewName: string;
  role: string;
  lineItems: LineItem[];
  subtotal: number;
  vat: number;
  vatAmount: number;
  total: number;
  paymentNotes: string;
  bankingDetails: BankingDetails;
  status: InvoiceStatus;
  currency: Currency;
  fromTimesheetId?: string;
  createdAt: string;
}

// ── Timesheet ──────────────────────────────────────────────────────────────

export interface TimesheetEntry {
  id: string;
  date: string;
  location: string;
  callTime: string;        // "HH:MM" 24-hour
  wrapTime: string;        // "HH:MM" 24-hour — may be next day (overnight)
  mealBreakMinutes: number;
  travelStartTime: string; // "HH:MM"
  travelEndTime: string;   // "HH:MM"
  travelDistance: number;
  notes: string;
  dayRate: number;
  includedHours: number;
  overtimeRate: number;
  equipmentRental: number;
  perDiem: number;
  otherExpenses: number;
}

export interface TimesheetSettings {
  includedHoursPerDay: number;
  minTurnaroundHours: number;
  travelTimePaid: boolean;
  mealBreaksDeducted: boolean;
  overtimeRate: number;
}

export interface Timesheet {
  id: string;
  timesheetNumber: string;
  crewName: string;
  role: string;
  productionName: string;
  currency: Currency;
  vat: number;
  status: TimesheetStatus;
  entries: TimesheetEntry[];
  settings: TimesheetSettings;
  invoiceId?: string;
  createdAt: string;
}

// Calculated values for a single timesheet entry
export interface EntryCalc {
  onSet: number;      // hours on set
  meal: number;       // meal deduction (hours)
  work: number;       // working hours after meal deduction
  trav: number;       // travel hours
  paid: number;       // total paid hours
  otH: number;        // overtime hours
  otC: number;        // overtime cost
  total: number;      // day total
  turnaround?: number | null;   // hours since previous wrap
  twarn?: string | null;        // turnaround warning message
}

// Full timesheet summary
export interface TimesheetSummary {
  results: (TimesheetEntry & EntryCalc)[];
  totalDays: number;
  totalDayRates: number;
  totalOtCost: number;
  totalEq: number;
  totalPD: number;
  totalOther: number;
  totalPaidH: number;
  totalOtH: number;
  totalTravH: number;
  subtotal: number;
  vatPct: number;
  vatAmt: number;
  grandTotal: number;
  warnings: string[];
}

// ── Crew Profile ───────────────────────────────────────────────────────────

export interface CrewProfile {
  id: string;
  name: string;
  role: string;
  dayRate: number;
  overtimeRate: number;
  includedHours: number;
  equipmentPackage: number;
  currency: Currency;
  notes: string;
}

// ── User Settings ──────────────────────────────────────────────────────────

export interface UserSettings {
  companyName: string;
  crewName: string;
  role: string;
  email: string;
  phone: string;
  address: string;
  vatNumber: string;
  defaultCurrency: Currency;
  defaultVat: number;
  defaultIncludedHours: number;
  defaultOvertimeRate: number;
  defaultMinTurnaround: number;
  travelTimePaid: boolean;
  mealBreaksDeducted: boolean;
  bankingDetails: BankingDetails;
}

// ── App State ──────────────────────────────────────────────────────────────

export interface AppState {
  quotes: Quote[];
  invoices: Invoice[];
  timesheets: Timesheet[];
  profiles: CrewProfile[];
  settings: UserSettings;
  initialized: boolean;
}
