import { Component, Fragment, forwardRef, useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  Clock, Receipt, Settings, Film, Plus, Trash2,
  AlertTriangle, CheckCircle, Moon, ChevronDown, ChevronUp,
  Save, Zap, Copy, FileText, Info, Users, Building2, Pencil, UserCircle
} from "lucide-react";
import { useAuth } from "./auth/AuthContext";
import { AccountPage } from "./components/account/AccountPage";
import { claimLocalDataOwner, getCalculationSnapshot, migrationCompletedForUser, phase4MigrationCompletedForUser, phase4MigrationFingerprintForUser, readCalculationSnapshots, readLocalDataOwnerId } from "./data/localCompatibilityStore";
import {
  hasPhase3MigrationSource,
  migrateBrowserDataToCloud,
  summarizePhase3MigrationSource,
  type Phase3MigrationSummary,
} from "./services/cloudMigrationService";
import { buildCloudAwareBackupData, buildPhase4CloudBackupData } from "./services/cloudBackupService";
import { migratePreparedTimesheets, preflightPhase4TimesheetMigration, type Phase4MigrationPreflight, type Phase4MigrationStage } from "./services/timesheetMigrationService";
import { getCurrentBusinessSettings, saveCurrentBusinessSettings } from "./services/businessSettingsService";
import { getCurrentUserPreferences, saveCurrentUserPreferences } from "./services/userPreferencesService";
import { createClient as createCloudClient, deleteClient as deleteCloudClient, listClients, updateClient as updateCloudClient } from "./services/clientService";
import { calcDay, calcSummary, calcTurnaround, entryCallDateTime, sortEntriesForTurnaround, num, profileForTimesheet } from "./domain/calculations/timesheetCalculations";
import {
  calculationSourceFingerprint,
  confirmCurrentBaselineSnapshot,
  evaluateCalculationSnapshot,
  prepareCurrentBaselineSnapshot,
  type LegacyTimesheetCalculationSnapshotV1,
} from "./domain/calculations/timesheetCalculationSnapshots";
import type { CrewTimesheet } from "./data/crewquoteTypes";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

type OTRuleId        = "sa-film" | "sa-bcea" | "custom";
type TurnaroundMode  = "warning" | "penalty" | "manual";
type ToastType       = "success" | "error" | "info";
type InvoiceDetailMode = "summary" | "detailed" | "summary_timesheet";
type InvoiceStatus = "draft" | "sent" | "paid" | "partial" | "overdue" | "cancelled";

interface ToastMsg { id: string; msg: string; type: ToastType; }

interface RateDraft {
  dayRate: number;
  includedHours: number;
  overtimeRule: OTRuleId;
  otBand1Hours: number;
  otBand1Mult: number;
  otBand2Mult: number;
  equipmentRental: number;
  perDiem: number;
  vat: number;
  minTurnaround: number;
  turnaroundMode: TurnaroundMode;
  turnaroundPenMult: number;
  travelPaid: boolean;
  mealDeducted: boolean;
}

interface RateMemory {
  productionName: string;
  dayRate: number;
  includedHours: number;
  overtimeRule: OTRuleId;
  otBand1Hours: number;
  otBand1Mult: number;
  otBand2Mult: number;
  equipmentRental: number;
  perDiem: number;
  vat: number;
  minTurnaround: number;
  turnaroundMode: TurnaroundMode;
  turnaroundPenMult: number;
  travelPaid: boolean;
  mealDeducted: boolean;
  updatedAt: string;
}

interface Client {
  id: string;
  companyName: string;
  contactPerson: string;
  email: string;
  phone: string;
  billingAddress: string;
  vatNumber: string;
  poRequired: boolean;
  vendorNumber: string;
  accountsEmail: string;
  paymentTerms: string;
  preferredInvoiceDetailMode: InvoiceDetailMode;
  defaultPaymentTerms: string;
  rateMemory?: RateMemory;
  notes: string;
}

interface TimesheetEntry {
  id: string;
  date: string;
  productionName: string;
  location: string;
  notes: string;
  callTime: string;
  wrapTime: string;
  mealBreakMinutes: number;
  mealDeducted: boolean;
  travelStartTime: string;
  travelEndTime: string;
  travelDistance: string;
  travelPaid: boolean;
  dayRate: number;
  includedHours: number;
  overtimeRule: OTRuleId;
  otBand1Hours: number;
  otBand1Mult: number;
  otBand2Mult: number;
  equipmentRental: number;
  perDiem: number;
  expenses: number;
  expenseDescription: string;
  dayRateUsed?: number;
  includedHoursUsed?: number;
  overtimeRuleUsed?: OTRuleId;
  otBand1HoursUsed?: number;
  otBand1MultUsed?: number;
  otBand2MultUsed?: number;
  equipmentRentalUsed?: number;
  perDiemUsed?: number;
  vatRateUsed?: number;
  travelPaidUsed?: boolean;
  mealDeductedUsed?: boolean;
  turnaroundRuleUsed?: TurnaroundMode;
  turnaroundMinimumHoursUsed?: number;
  turnaroundPenaltyMultUsed?: number;
  calcOnSetHours?: number;
  calcMealHours?: number;
  calcTravelHours?: number;
  calcPaidHours?: number;
  calcOvertimeHours?: number;
  calcOvertimeCost?: number;
  calcDayTotal?: number;
  isSunday: boolean;
  isPublicHoliday: boolean;
}

interface Timesheet {
  id: string;
  timesheetNumber: string;
  productionName: string;
  clientId?: string;
  clientName?: string;
  clientIncomplete?: boolean;
  crewName: string;
  role: string;
  startDate?: string;
  notes?: string;
  currency: string;
  vat: number;
  status: "open" | "submitted" | "invoiced";
  entries: TimesheetEntry[];
  paymentTerms?: string;
  defaultDayRate?: number;
  defaultIncludedHours?: number;
  defaultEquipmentRental?: number;
  defaultPerDiem?: number;
  defaultOvertimeRule?: OTRuleId;
  defaultOtBand1Hours?: number;
  defaultOtBand1Mult?: number;
  defaultOtBand2Mult?: number;
  defaultMinTurnaround?: number;
  defaultTurnaroundMode?: TurnaroundMode;
  defaultTurnaroundPenMult?: number;
  mealBreaksDeducted?: boolean;
  travelTimePaid?: boolean;
  equipmentRentalDaily?: boolean;
  invoiceId?: string;
  createdAt: string;
}

interface InvoiceLine {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  isExtra?: boolean;
  taxable?: boolean;
  category?: "day-rate" | "overtime" | "equipment" | "travel" | "expenses" | "turnaround" | "additional";
}

interface InvoiceSellerSnapshot {
  fullName: string;
  role: string;
  companyName: string;
  email: string;
  phone: string;
  address: string;
  vatRegistered: boolean;
  vatNumber: string;
  invoiceLabel: string;
  businessLogoDataUrl: string;
}

interface Invoice {
  id: string;
  invoiceNumber: string;
  poNumber?: string;
  issueDate: string;
  dueDate: string;
  clientId?: string;
  clientName: string;
  client?: Client;
  crewName: string;
  role: string;
  companyName: string;
  sellerLogoDataUrl?: string;
  sellerSnapshot?: InvoiceSellerSnapshot;
  productionName?: string;
  timesheetNumber: string;
  timesheetDates?: string;
  detailMode?: InvoiceDetailMode;
  lineItems: InvoiceLine[];
  timesheetBreakdown?: InvoiceLine[];
  subtotal: number;
  vat: number;
  vatAmount: number;
  total: number;
  paidAmount?: number;
  paidDate?: string;
  balanceDue?: number;
  currency: string;
  status: InvoiceStatus;
  banking: Record<string, string>;
  paymentTerms?: string;
  paymentNotes: string;
  notes?: string;
  fromTimesheetId: string;
  createdAt: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// OT RULE PRESETS
// ═══════════════════════════════════════════════════════════════════════════

const OT_PRESETS: Record<OTRuleId, { name: string; desc: string }> = {
  "sa-film":  { name: "SA Film / Commercial Standard", desc: "First 4 OT hrs @ 1.5×, remaining @ 2×" },
  "sa-bcea":  { name: "SA BCEA Basic",                  desc: "All OT @ 1.5×" },
  "custom":   { name: "Custom Rule",                    desc: "Define your own overtime bands" },
};

const INVOICE_STATUS: Record<InvoiceStatus, { label: string; color: string }> = {
  draft:     { label: "Draft",     color: "gray"  },
  sent:      { label: "Sent",      color: "blue"  },
  paid:      { label: "Paid",      color: "green" },
  partial:   { label: "Partial",   color: "orange" },
  overdue:   { label: "Overdue",   color: "red"   },
  cancelled: { label: "Cancelled", color: "gray"  },
};

const APP_VERSION = "0.1.0";
const CURRENT_DATA_VERSION = 1;
const BACKUP_VERSION = 1;
const FEEDBACK_EMAIL = "dbruning22@gmail.com";
const DEFAULT_INVOICE_DETAIL_MODE: InvoiceDetailMode = "detailed";
const IS_DEV_BUILD = Boolean((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV);
const PHASE3_BACKUP_IMPORT_DISABLED_MESSAGE =
  "Cloud backup restore is paused during Phase 3 while settings and clients are stored in Supabase and timesheets/invoices remain in this browser. Export backup remains enabled and includes both cloud and local CrewQuote data.";

const STORAGE_KEYS = {
  dataVersion: "cqp-data-version",
  profile: "cqp-profile",
  clients: "cqp-clients",
  timesheets: "cqp-timesheets",
  invoices: "cqp-invoices",
  onboardingDismissed: "cqp-onboarding-dismissed",
} as const;

const CREWQUOTE_STORAGE_KEYS = Object.values(STORAGE_KEYS);

// ═══════════════════════════════════════════════════════════════════════════
// PROFILE DEFAULTS
// ═══════════════════════════════════════════════════════════════════════════

const DEFAULT_PROFILE = {
  fullName: "", role: "", companyName: "", email: "", phone: "", address: "", vatNumber: "",
  businessLogoDataUrl:     "",
  vatRegistered:          false,
  invoiceLabel:           "Invoice",
  paymentTerms:           "Payment due within 30 days",
  invoiceNumberHistory:   [] as string[],
  defaultCurrency:          "ZAR",
  defaultDayRate:           0,
  defaultIncludedHours:     10,
  defaultEquipmentRental:   0,
  defaultPerDiem:           0,
  defaultVat:               0,
  defaultOvertimeRule:      "sa-film" as OTRuleId,
  defaultOtBand1Hours:      4,
  defaultOtBand1Mult:       1.5,
  defaultOtBand2Mult:       2.0,
  defaultMinTurnaround:     10,
  defaultTurnaroundMode:    "warning" as TurnaroundMode,
  defaultTurnaroundPenMult: 1.5,
  mealBreaksDeducted:       true,
  travelTimePaid:           true,
  equipmentRentalDaily:     true,
  bankAccountName: "", bankName: "", bankAccountNumber: "",
  bankBranchCode:  "", bankSwift:  "", bankIban: "", bankReference: "",
};
type Profile = typeof DEFAULT_PROFILE;

interface AppData {
  dataVersion: number;
  profile: Profile;
  clients: Client[];
  timesheets: Timesheet[];
  invoices: Invoice[];
  onboardingDismissed: boolean;
}

interface CrewQuoteBackup {
  format: "crewquote-backup";
  backupVersion: number;
  appVersion: string;
  dataVersion: number;
  exportedAt: string;
  data: {
    profile: Profile;
    clients: Client[];
    timesheets: Timesheet[];
    invoices: Invoice[];
    onboardingDismissed: boolean;
    calculationSnapshots?: { ownerUserId: string; records: Record<string, unknown> };
    phase4Recovery?: {
      localOwnerUserId: string;
      phase4MigrationFingerprint: string;
      phase3MigrationCompleted: boolean;
      phase4MigrationAlreadyCompleted: boolean;
      cloudRecovery: unknown;
    };
  };
}

interface ImportSummary {
  exportedAt: string;
  appVersion: string;
  clients: number;
  timesheets: number;
  invoices: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// STORAGE
// ═══════════════════════════════════════════════════════════════════════════

const Store = {
  async get(k: string) {
    let localRaw: string | null = null;
    try {
      localRaw = window.localStorage?.getItem(k) ?? null;
      if (localRaw !== null) return JSON.parse(localRaw);
    } catch (err) {
      try {
        const r = await (window as any).storage?.get?.(k);
        if (r?.value) {
          try { window.localStorage?.setItem(k, r.value); } catch {}
          return JSON.parse(r.value);
        }
      } catch {}
      throw new Error(storageReadMessage(k, err));
    }
    try {
      const r = await (window as any).storage?.get?.(k);
      if (r?.value) {
        try { window.localStorage?.setItem(k, r.value); } catch {}
        return JSON.parse(r.value);
      }
    } catch {}
    return null;
  },
  set(k: string, v: unknown) {
    const raw = JSON.stringify(v);
    writeRawStorage(k, raw);
    try { void (window as any).storage?.set?.(k, raw); } catch {}
  },
};

function storageReadMessage(key: string, err: unknown) {
  const label = storageLabel(key);
  return `CrewQuote could not read saved ${label}. Your data has not been intentionally removed. Export an emergency backup before resetting the app.`;
}

function storageWriteMessage(err: unknown) {
  const name = err instanceof DOMException ? err.name : "";
  if (name === "QuotaExceededError" || name === "NS_ERROR_DOM_QUOTA_REACHED") {
    return "CrewQuote could not save because this browser's local storage is full. Export a backup, then remove unused data or a large logo.";
  }
  return "CrewQuote could not save to this browser. Your current on-screen changes have not been written.";
}

function storageLabel(key: string) {
  if (key === STORAGE_KEYS.profile) return "settings";
  if (key === STORAGE_KEYS.clients) return "clients";
  if (key === STORAGE_KEYS.timesheets) return "timesheets";
  if (key === STORAGE_KEYS.invoices) return "invoices";
  if (key === STORAGE_KEYS.onboardingDismissed) return "onboarding preference";
  if (key === STORAGE_KEYS.dataVersion) return "data version";
  return "CrewQuote data";
}

function writeRawStorage(key: string, raw: string) {
  try {
    window.localStorage?.setItem(key, raw);
  } catch (err) {
    throw new Error(storageWriteMessage(err));
  }
}

function removeRawStorage(key: string) {
  try {
    window.localStorage?.removeItem(key);
  } catch (err) {
    throw new Error(storageWriteMessage(err));
  }
}

function parseRawStorage(raw: string | null) {
  if (raw === null || raw === "") return null;
  return JSON.parse(raw);
}

function readCrewQuoteStorageRaw() {
  const raw: Record<string, string | null> = {};
  CREWQUOTE_STORAGE_KEYS.forEach(key => {
    try { raw[key] = window.localStorage?.getItem(key) ?? null; }
    catch { raw[key] = null; }
  });
  return raw;
}

function restoreCrewQuoteStorageRaw(raw: Record<string, string | null>) {
  CREWQUOTE_STORAGE_KEYS.forEach(key => {
    const value = raw[key] ?? null;
    if (value === null) removeRawStorage(key);
    else writeRawStorage(key, value);
  });
}

function clearCrewQuoteStorage() {
  CREWQUOTE_STORAGE_KEYS.forEach(key => removeRawStorage(key));
}

function writeAppDataToStorage(data: AppData) {
  const payloads: Record<string, unknown> = {
    [STORAGE_KEYS.dataVersion]: CURRENT_DATA_VERSION,
    [STORAGE_KEYS.profile]: data.profile,
    [STORAGE_KEYS.clients]: data.clients,
    [STORAGE_KEYS.timesheets]: data.timesheets,
    [STORAGE_KEYS.invoices]: data.invoices,
    [STORAGE_KEYS.onboardingDismissed]: data.onboardingDismissed,
  };
  const raw = Object.fromEntries(Object.entries(payloads).map(([key, value]) => [key, JSON.stringify(value)])) as Record<string, string>;
  Object.entries(raw).forEach(([key, value]) => writeRawStorage(key, value));
}

function backupTimestamp(d = new Date()) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

function createBackupPayload(data: AppData, calculationSnapshots?: { ownerUserId: string; records: Record<string, unknown> }, phase4Recovery?: CrewQuoteBackup["data"]["phase4Recovery"]): CrewQuoteBackup {
  return {
    format: "crewquote-backup",
    backupVersion: BACKUP_VERSION,
    appVersion: APP_VERSION,
    dataVersion: CURRENT_DATA_VERSION,
    exportedAt: new Date().toISOString(),
    data: {
      profile: data.profile,
      clients: data.clients,
      timesheets: data.timesheets,
      invoices: data.invoices,
      onboardingDismissed: data.onboardingDismissed,
      calculationSnapshots,
      phase4Recovery,
    },
  };
}

function downloadBackup(data: AppData, prefix = "crewquote-backup", calculationSnapshots?: { ownerUserId: string; records: Record<string, unknown> }, phase4Recovery?: CrewQuoteBackup["data"]["phase4Recovery"]) {
  const payload = createBackupPayload(data, calculationSnapshots, phase4Recovery);
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${prefix}-${backupTimestamp()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ═══════════════════════════════════════════════════════════════════════════
// CALCULATION ENGINE
// ═══════════════════════════════════════════════════════════════════════════

const hoursToHM  = (h: number) => { const n = Math.abs(h ?? 0); const hrs = Math.floor(n); const m = Math.round((n - hrs) * 60); return m > 0 ? `${hrs}h ${m}m` : `${hrs}h`; };
const safe       = (v: unknown, def = 0) => parseFloat(String(v ?? def)) || def;
const uid        = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const todayStr   = () => new Date().toISOString().split("T")[0];
const nextDayStr = (d: string) => { try { const dt = new Date(d + "T12:00:00"); dt.setDate(dt.getDate() + 1); return dt.toISOString().split("T")[0]; } catch { return todayStr(); } };
const fmtDate    = (d: string) => { if (!d) return "—"; try { return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(d + "T12:00:00")); } catch { return d; } };
const fmtMoney   = (n: unknown, cur = "ZAR") => {
  const sym = { ZAR: "R", USD: "$", GBP: "£", EUR: "€" }[cur] || "R";
  const locale = { ZAR: "en-ZA", USD: "en-US", GBP: "en-GB", EUR: "de-DE" }[cur] || "en-ZA";
  return `${sym} ${new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(parseFloat(String(n ?? 0)) || 0)}`;
};
const latestEntryForDefaults = (entries: TimesheetEntry[]) => {
  const sorted = sortEntriesForTurnaround(entries);
  return [...sorted].reverse().find(e => entryCallDateTime(e)) || entries[entries.length - 1];
};
const findPreviousEntryForTurnaround = (entries: TimesheetEntry[], next: Partial<TimesheetEntry>) => {
  const nextCall = entryCallDateTime(next);
  if (!nextCall) return null;
  const nextMs = nextCall.getTime();
  return [...sortEntriesForTurnaround(entries)].reverse().find(e => {
    const start = entryCallDateTime(e)?.getTime();
    return start !== undefined && start < nextMs;
  }) || null;
};

const blankClient = (overrides: Partial<Client> = {}): Client => ({
  id: uid(),
  companyName: "",
  contactPerson: "",
  email: "",
  phone: "",
  billingAddress: "",
  vatNumber: "",
  poRequired: false,
  vendorNumber: "",
  accountsEmail: "",
  paymentTerms: "",
  preferredInvoiceDetailMode: "summary",
  defaultPaymentTerms: "",
  rateMemory: undefined,
  notes: "",
  ...overrides,
});

const normalizeClient = (c: Partial<Client>): Client => {
  const terms = c.paymentTerms || c.defaultPaymentTerms || "";
  return blankClient({ ...c, id: c.id || uid(), paymentTerms: terms, defaultPaymentTerms: terms });
};
const clientName = (c?: Partial<Client> | null) => c?.companyName || c?.contactPerson || "";
const getTimesheetClient = (ts: Partial<Timesheet>, clients: Client[]) => clients.find(c => c.id === ts.clientId) || null;
const invoiceClient = (inv: Invoice): Client | null => inv.client || (inv.clientName ? blankClient({ companyName: inv.clientName, id: inv.clientId || uid() }) : null);

function normalizeInvoiceStatus(status?: string): InvoiceStatus {
  if (status === "unpaid") return "sent";
  if (status === "partially_paid") return "partial";
  if (["draft","sent","paid","partial","overdue","cancelled"].includes(status || "")) return status as InvoiceStatus;
  return "draft";
}

const invoiceBalance = (inv: Partial<Invoice>) => Math.max(safe(inv.total, 0) - safe(inv.paidAmount, 0), 0);
const invoiceDetailModeLabel = (mode?: InvoiceDetailMode) =>
  mode === "detailed" ? "Detailed" : mode === "summary_timesheet" ? "Summary + Attached Timesheet" : "Summary";
const invoiceLineAmount = (line: Partial<InvoiceLine>) => num(line.quantity, 1) * num(line.unitPrice, 0);
const withInvoiceLineAmount = (line: InvoiceLine): InvoiceLine => ({
  ...line,
  quantity: num(line.quantity, 1),
  unitPrice: num(line.unitPrice, 0),
  amount: invoiceLineAmount(line),
});
const comparableInvoiceLines = (lines: InvoiceLine[] = []) => lines.map(line => {
  const l = withInvoiceLineAmount(line);
  return {
    description: l.description,
    quantity: l.quantity,
    unitPrice: l.unitPrice,
    amount: l.amount,
    taxable: l.taxable !== false,
    category: l.category || "",
    isExtra: Boolean(l.isExtra),
  };
});
const isManualInvoiceLine = (line: Partial<InvoiceLine>) => Boolean(line.isExtra || line.category === "additional");
const invoiceGeneratedLines = (lines: InvoiceLine[] = []) => lines.filter(l => !isManualInvoiceLine(l));
const invoiceManualLines = (lines: InvoiceLine[] = []) => lines.filter(isManualInvoiceLine);

const clientBillingErrors = (client?: Partial<Client> | null): Partial<Record<keyof Client, string>> => {
  const errors: Partial<Record<keyof Client, string>> = {};
  if (!String(client?.companyName || "").trim()) errors.companyName = "Legal/business client name is required.";
  if (!String(client?.billingAddress || "").trim()) errors.billingAddress = "Billing address is required.";
  return errors;
};
const clientBillingComplete = (c?: Partial<Client> | null) => Object.keys(clientBillingErrors(c)).length === 0;
const clientBillingMissingLabels = (errors: Partial<Record<keyof Client, string>>) =>
  ([
    ["companyName", "Legal/business client name"],
    ["billingAddress", "Billing address"],
  ] as [keyof Client, string][]).filter(([key]) => errors[key]).map(([, label]) => label);
const firstClientBillingErrorField = (errors: Partial<Record<keyof Client, string>>) =>
  (["companyName", "billingAddress"] as (keyof Client)[]).find(key => errors[key]) || null;

const sellerSnapshotFromProfile = (profile: Profile): InvoiceSellerSnapshot => ({
  fullName: profile.fullName || "",
  role: profile.role || "",
  companyName: profile.companyName || "",
  email: profile.email || "",
  phone: profile.phone || "",
  address: profile.address || "",
  vatRegistered: Boolean(profile.vatRegistered),
  vatNumber: profile.vatNumber || "",
  invoiceLabel: profile.invoiceLabel || "Invoice",
  businessLogoDataUrl: profile.businessLogoDataUrl || "",
});

const sellerProfileForInvoice = (inv: Partial<Invoice>, profile: Profile): Profile => {
  const snap = protectedInvoiceStatus(inv.status) ? inv.sellerSnapshot : undefined;
  if (!snap) return profile;
  return {
    ...profile,
    fullName: snap.fullName || profile.fullName,
    role: snap.role || profile.role,
    companyName: snap.companyName || profile.companyName,
    email: snap.email || profile.email,
    phone: snap.phone || profile.phone,
    address: snap.address || profile.address,
    vatRegistered: snap.vatRegistered,
    vatNumber: snap.vatNumber || profile.vatNumber,
    invoiceLabel: snap.invoiceLabel || profile.invoiceLabel,
    businessLogoDataUrl: inv.sellerLogoDataUrl || snap.businessLogoDataUrl || "",
  };
};

function invoiceTotalsFromLines(lines: InvoiceLine[], vatPct: number, vatRegistered: boolean, paidAmount = 0) {
  const normalized = lines.map(withInvoiceLineAmount);
  const subtotal = normalized.reduce((s, l) => s + safe(l.amount, 0), 0);
  const taxableSubtotal = normalized.reduce((s, l) => s + (l.taxable === false ? 0 : safe(l.amount, 0)), 0);
  const vatAmount = vatRegistered ? taxableSubtotal * (num(vatPct, 0) / 100) : 0;
  const total = subtotal + vatAmount;
  const paid = Math.min(safe(paidAmount, 0), total);
  return { lines: normalized, subtotal, taxableSubtotal, vatAmount, total, paidAmount: paid, balanceDue: Math.max(total - paid, 0) };
}

const invoiceHasRecordedPayment = (inv: Partial<Invoice>) => safe(inv.paidAmount, 0) > 0 || Boolean(inv.paidDate);

const LOGO_ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_LOGO_FILE_BYTES = 5 * 1024 * 1024;
const MAX_LOGO_EDGE_PX = 1000;
const TARGET_LOGO_BYTES = 500 * 1024;
const MAX_STORED_LOGO_BYTES = 750 * 1024;

const dataUrlBytes = (dataUrl: string) => Math.ceil((dataUrl.split(",")[1]?.length || dataUrl.length) * 0.75);
const formatBytes = (bytes: number) => bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;

function loadLogoImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("decode")); };
    img.src = url;
  });
}

function canvasHasTransparency(ctx: CanvasRenderingContext2D, width: number, height: number) {
  try {
    const sample = ctx.getImageData(0, 0, width, height).data;
    for (let i = 3; i < sample.length; i += 4) if (sample[i] < 255) return true;
  } catch {}
  return false;
}

async function prepareBusinessLogo(file: File) {
  if (!LOGO_ACCEPTED_TYPES.includes(file.type)) throw new Error("Unsupported file type. Upload a PNG, JPG, or WebP logo.");
  if (file.size > MAX_LOGO_FILE_BYTES) throw new Error(`Logo file is too large. Please upload an image under ${formatBytes(MAX_LOGO_FILE_BYTES)}.`);

  const img = await loadLogoImage(file).catch(() => {
    throw new Error("The selected file could not be decoded as an image. Try a different PNG, JPG, or WebP file.");
  });
  if (!img.naturalWidth || !img.naturalHeight) throw new Error("The selected image appears to be empty or corrupted.");

  const scale = Math.min(1, MAX_LOGO_EDGE_PX / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser could not prepare the logo image.");
  ctx.drawImage(img, 0, 0, width, height);

  const hasTransparency = canvasHasTransparency(ctx, width, height);
  let dataUrl = hasTransparency ? canvas.toDataURL("image/png") : canvas.toDataURL("image/jpeg", 0.88);
  if (!hasTransparency && dataUrlBytes(dataUrl) > TARGET_LOGO_BYTES) {
    for (const quality of [0.82, 0.76, 0.7]) {
      dataUrl = canvas.toDataURL("image/jpeg", quality);
      if (dataUrlBytes(dataUrl) <= TARGET_LOGO_BYTES) break;
    }
  }

  const bytes = dataUrlBytes(dataUrl);
  if (bytes > MAX_STORED_LOGO_BYTES) throw new Error(`The optimised logo is still too large (${formatBytes(bytes)}). Try a smaller or simpler image.`);
  return { dataUrl, width, height, bytes, hasTransparency };
}

const protectedInvoiceStatus = (status?: string) => normalizeInvoiceStatus(status) !== "draft";
const invoiceLogoForDisplay = (inv: Partial<Invoice>, profile: Profile) =>
  protectedInvoiceStatus(inv.status) ? (inv.sellerLogoDataUrl || "") : (profile.businessLogoDataUrl || inv.sellerLogoDataUrl || "");

function timesheetDateRange(ts: Timesheet): string {
  const dates = (ts.entries || []).map(e => e.date).filter(Boolean).sort();
  if (!dates.length) return ts.startDate ? fmtDate(ts.startDate) : "Not set";
  const first = fmtDate(dates[0]);
  const last = fmtDate(dates[dates.length - 1]);
  return first === last ? first : `${first} - ${last}`;
}

function normalizeTimesheet(t: Partial<Timesheet>): Timesheet {
  const ts: Timesheet = {
    id: t.id || uid(),
    timesheetNumber: t.timesheetNumber || "T-Not set",
    productionName: t.productionName || "",
    clientId: t.clientId,
    clientName: t.clientName || "",
    clientIncomplete: t.clientIncomplete ?? !t.clientId,
    crewName: t.crewName || "",
    role: t.role || "",
    startDate: t.startDate || t.createdAt?.slice(0, 10) || todayStr(),
    notes: t.notes || "",
    currency: t.currency || "ZAR",
    vat: safe(t.vat, 0),
    status: t.status || "open",
    entries: [],
    paymentTerms: t.paymentTerms || "",
    defaultDayRate: t.defaultDayRate,
    defaultIncludedHours: t.defaultIncludedHours,
    defaultEquipmentRental: t.defaultEquipmentRental,
    defaultPerDiem: t.defaultPerDiem,
    defaultOvertimeRule: t.defaultOvertimeRule,
    defaultOtBand1Hours: t.defaultOtBand1Hours,
    defaultOtBand1Mult: t.defaultOtBand1Mult,
    defaultOtBand2Mult: t.defaultOtBand2Mult,
    defaultMinTurnaround: t.defaultMinTurnaround,
    defaultTurnaroundMode: t.defaultTurnaroundMode,
    defaultTurnaroundPenMult: t.defaultTurnaroundPenMult,
    mealBreaksDeducted: t.mealBreaksDeducted,
    travelTimePaid: t.travelTimePaid,
    equipmentRentalDaily: t.equipmentRentalDaily,
    invoiceId: t.invoiceId,
    createdAt: t.createdAt || new Date().toISOString(),
  };
  ts.entries = Array.isArray(t.entries) ? t.entries.map(e => normalizeEntry(e, ts)) : [];
  return ts;
}

function normalizeInvoice(i: Partial<Invoice>): Invoice {
  const status = normalizeInvoiceStatus(i.status);
  const paidAmount = safe(i.paidAmount, status === "paid" ? i.total : 0);
  const total = safe(i.total, 0);
  return {
    id: i.id || uid(),
    invoiceNumber: i.invoiceNumber || "I-Not set",
    poNumber: i.poNumber || "",
    issueDate: i.issueDate || todayStr(),
    dueDate: i.dueDate || "",
    clientId: i.clientId,
    clientName: i.clientName || "",
    client: i.client,
    crewName: i.crewName || "",
    role: i.role || "",
    companyName: i.companyName || "",
    sellerLogoDataUrl: i.sellerLogoDataUrl || "",
    sellerSnapshot: i.sellerSnapshot ? { ...i.sellerSnapshot } : undefined,
    productionName: i.productionName || "",
    timesheetNumber: i.timesheetNumber || "",
    timesheetDates: i.timesheetDates || "",
    detailMode: i.detailMode || "summary",
    lineItems: Array.isArray(i.lineItems) ? i.lineItems : [],
    timesheetBreakdown: Array.isArray(i.timesheetBreakdown) ? i.timesheetBreakdown : [],
    subtotal: safe(i.subtotal, 0),
    vat: safe(i.vat, 0),
    vatAmount: safe(i.vatAmount, 0),
    total,
    paidAmount,
    paidDate: i.paidDate || "",
    balanceDue: Math.max(total - paidAmount, 0),
    currency: i.currency || "ZAR",
    status,
    banking: i.banking || {},
    paymentTerms: i.paymentTerms || i.paymentNotes || "",
    paymentNotes: i.paymentNotes || "",
    notes: i.notes || "",
    fromTimesheetId: i.fromTimesheetId || "",
    createdAt: i.createdAt || new Date().toISOString(),
  };
}

function normalizeEntry(e: Partial<TimesheetEntry>, ts?: Partial<Timesheet>): TimesheetEntry {
  const p = profileForTimesheet(DEFAULT_PROFILE, ts);
  const base: TimesheetEntry = {
    id: e.id || uid(),
    date: e.date || ts?.startDate || todayStr(),
    productionName: e.productionName || ts?.productionName || "",
    location: e.location || "",
    notes: e.notes || "",
    callTime: e.callTime || "08:00",
    wrapTime: e.wrapTime || "18:00",
    mealBreakMinutes: num(e.mealBreakMinutes, 60),
    mealDeducted: e.mealDeductedUsed ?? e.mealDeducted ?? p.mealBreaksDeducted,
    travelStartTime: e.travelStartTime || "",
    travelEndTime: e.travelEndTime || "",
    travelDistance: e.travelDistance || "",
    travelPaid: e.travelPaidUsed ?? e.travelPaid ?? p.travelTimePaid,
    dayRate: num(e.dayRateUsed ?? e.dayRate, p.defaultDayRate),
    includedHours: num(e.includedHoursUsed ?? e.includedHours, p.defaultIncludedHours),
    overtimeRule: (e.overtimeRuleUsed || e.overtimeRule || p.defaultOvertimeRule) as OTRuleId,
    otBand1Hours: num(e.otBand1HoursUsed ?? e.otBand1Hours, p.defaultOtBand1Hours),
    otBand1Mult: num(e.otBand1MultUsed ?? e.otBand1Mult, p.defaultOtBand1Mult),
    otBand2Mult: num(e.otBand2MultUsed ?? e.otBand2Mult, p.defaultOtBand2Mult),
    equipmentRental: num(e.equipmentRentalUsed ?? e.equipmentRental, p.equipmentRentalDaily ? p.defaultEquipmentRental : 0),
    perDiem: num(e.perDiemUsed ?? e.perDiem, p.defaultPerDiem),
    expenses: num(e.expenses, 0),
    expenseDescription: e.expenseDescription || "",
    isSunday: e.isSunday ?? false,
    isPublicHoliday: e.isPublicHoliday ?? false,
  };
  return withEntrySnapshots({ ...base, ...e }, p);
}

function withEntrySnapshots(entry: TimesheetEntry, profile: Profile): TimesheetEntry {
  const normalized: TimesheetEntry = {
    ...entry,
    mealDeducted: entry.mealDeductedUsed ?? entry.mealDeducted ?? profile.mealBreaksDeducted,
    travelPaid: entry.travelPaidUsed ?? entry.travelPaid ?? profile.travelTimePaid,
    dayRate: num(entry.dayRateUsed ?? entry.dayRate, profile.defaultDayRate),
    includedHours: num(entry.includedHoursUsed ?? entry.includedHours, profile.defaultIncludedHours),
    overtimeRule: (entry.overtimeRuleUsed || entry.overtimeRule || profile.defaultOvertimeRule) as OTRuleId,
    otBand1Hours: num(entry.otBand1HoursUsed ?? entry.otBand1Hours, profile.defaultOtBand1Hours),
    otBand1Mult: num(entry.otBand1MultUsed ?? entry.otBand1Mult, profile.defaultOtBand1Mult),
    otBand2Mult: num(entry.otBand2MultUsed ?? entry.otBand2Mult, profile.defaultOtBand2Mult),
    equipmentRental: num(entry.equipmentRentalUsed ?? entry.equipmentRental, profile.equipmentRentalDaily ? profile.defaultEquipmentRental : 0),
    perDiem: num(entry.perDiemUsed ?? entry.perDiem, profile.defaultPerDiem),
  };
  const c = calcDay(normalized, profile);
  return {
    ...normalized,
    dayRateUsed: c.dayRate,
    includedHoursUsed: c.incH,
    overtimeRuleUsed: c.ruleId,
    otBand1HoursUsed: c.bands.band1Hours,
    otBand1MultUsed: c.bands.band1Mult,
    otBand2MultUsed: c.bands.band2Mult,
    equipmentRentalUsed: c.equip,
    perDiemUsed: c.perDiem,
    vatRateUsed: num(entry.vatRateUsed, profile.defaultVat),
    travelPaidUsed: normalized.travelPaid,
    mealDeductedUsed: normalized.mealDeducted,
    turnaroundRuleUsed: entry.turnaroundRuleUsed || profile.defaultTurnaroundMode,
    turnaroundMinimumHoursUsed: num(entry.turnaroundMinimumHoursUsed, profile.defaultMinTurnaround),
    turnaroundPenaltyMultUsed: num(entry.turnaroundPenaltyMultUsed, profile.defaultTurnaroundPenMult),
    calcOnSetHours: c.onSetH,
    calcMealHours: c.mealH,
    calcTravelHours: c.travH,
    calcPaidHours: c.paidH,
    calcOvertimeHours: c.totalOtH,
    calcOvertimeCost: c.totalOtCost,
    calcDayTotal: c.total,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function validStoredLogo(value: unknown) {
  if (!value) return true;
  if (typeof value !== "string") return false;
  return /^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=\s]+$/i.test(value);
}

function validateLogoData(data: AppData) {
  if (!validStoredLogo(data.profile.businessLogoDataUrl)) {
    throw new Error("Backup contains a business logo that is not a supported PNG, JPG, or WebP data image.");
  }
  const badInvoiceLogo = data.invoices.some(inv => inv.sellerLogoDataUrl && !validStoredLogo(inv.sellerLogoDataUrl));
  if (badInvoiceLogo) {
    throw new Error("Backup contains an invoice logo snapshot that is not a supported PNG, JPG, or WebP data image.");
  }
}

function migrateV0ToV1(raw: Record<string, unknown>): Record<string, unknown> {
  const profileRaw = isRecord(raw.profile) ? raw.profile : {};
  return {
    ...raw,
    dataVersion: 1,
    profile: { ...DEFAULT_PROFILE, ...profileRaw, businessLogoDataUrl: typeof profileRaw.businessLogoDataUrl === "string" ? profileRaw.businessLogoDataUrl : "" },
    onboardingDismissed: Boolean(raw.onboardingDismissed),
  };
}

function migrateAppData(raw: Record<string, unknown>): Record<string, unknown> {
  let version = Number(raw.dataVersion ?? 0);
  if (!Number.isFinite(version) || version < 0) version = 0;
  let next: Record<string, unknown> = { ...raw };
  if (version === 0) next = migrateV0ToV1(next);
  version = Number(next.dataVersion ?? version);
  if (version > CURRENT_DATA_VERSION) {
    throw new Error(`This data was created by a newer CrewQuote data version (${version}) and cannot be opened by this beta.`);
  }
  return { ...next, dataVersion: CURRENT_DATA_VERSION };
}

function normalizeAppData(rawInput: Record<string, unknown>, options: { strict?: boolean; validateLogos?: boolean } = {}): AppData {
  const raw = migrateAppData(rawInput);
  if (options.strict && Object.keys(rawInput).length === 0) throw new Error("Backup file does not contain CrewQuote data.");
  if (raw.profile !== undefined && !isRecord(raw.profile)) throw new Error("Backup settings section is not valid.");
  if (raw.clients !== undefined && !Array.isArray(raw.clients)) throw new Error("Backup clients section is not valid.");
  if (raw.timesheets !== undefined && !Array.isArray(raw.timesheets)) throw new Error("Backup timesheets section is not valid.");
  if (raw.invoices !== undefined && !Array.isArray(raw.invoices)) throw new Error("Backup invoices section is not valid.");

  const data: AppData = {
    dataVersion: CURRENT_DATA_VERSION,
    profile: { ...DEFAULT_PROFILE, ...(isRecord(raw.profile) ? raw.profile : {}) },
    clients: Array.isArray(raw.clients) ? raw.clients.map(c => normalizeClient((isRecord(c) ? c : {}) as Partial<Client>)) : [],
    timesheets: Array.isArray(raw.timesheets) ? raw.timesheets.map(t => normalizeTimesheet((isRecord(t) ? t : {}) as Partial<Timesheet>)) : [],
    invoices: Array.isArray(raw.invoices) ? raw.invoices.map(i => normalizeInvoice((isRecord(i) ? i : {}) as Partial<Invoice>)) : [],
    onboardingDismissed: Boolean(raw.onboardingDismissed),
  };
  if (options.validateLogos !== false) validateLogoData(data);
  return data;
}

async function loadStoredAppData(): Promise<AppData> {
  const [version, p, c, t, i, onboardingDismissed] = await Promise.all([
    Store.get(STORAGE_KEYS.dataVersion),
    Store.get(STORAGE_KEYS.profile),
    Store.get(STORAGE_KEYS.clients),
    Store.get(STORAGE_KEYS.timesheets),
    Store.get(STORAGE_KEYS.invoices),
    Store.get(STORAGE_KEYS.onboardingDismissed),
  ]);
  return normalizeAppData({
    dataVersion: Number(version ?? 0),
    profile: p || undefined,
    clients: c || undefined,
    timesheets: t || undefined,
    invoices: i || undefined,
    onboardingDismissed: Boolean(onboardingDismissed),
  }, { validateLogos: false });
}

function appDataFromRawStorage(validateLogos = false): AppData {
  const raw = readCrewQuoteStorageRaw();
  const parsed: Record<string, unknown> = {};
  CREWQUOTE_STORAGE_KEYS.forEach(key => {
    try { parsed[key] = parseRawStorage(raw[key]); }
    catch { parsed[key] = null; }
  });
  return normalizeAppData({
    dataVersion: Number(parsed[STORAGE_KEYS.dataVersion] ?? 0),
    profile: parsed[STORAGE_KEYS.profile] || undefined,
    clients: parsed[STORAGE_KEYS.clients] || undefined,
    timesheets: parsed[STORAGE_KEYS.timesheets] || undefined,
    invoices: parsed[STORAGE_KEYS.invoices] || undefined,
    onboardingDismissed: Boolean(parsed[STORAGE_KEYS.onboardingDismissed]),
  }, { validateLogos });
}

function validateBackupPayload(value: unknown): { data: AppData; summary: ImportSummary } {
  if (!isRecord(value)) throw new Error("This is not a valid CrewQuote backup JSON file.");
  if (value.format !== "crewquote-backup") throw new Error("This JSON file is not a CrewQuote backup.");
  const backupVersion = Number(value.backupVersion);
  if (!Number.isFinite(backupVersion)) throw new Error("This backup is missing a valid backup version.");
  if (backupVersion > BACKUP_VERSION) throw new Error(`This backup was created by a newer CrewQuote backup format (version ${backupVersion}). This beta supports version ${BACKUP_VERSION}.`);
  if (backupVersion < 1) throw new Error("This backup version is not supported.");
  if (!isRecord(value.data)) throw new Error("This backup is missing its CrewQuote data section.");

  const dataVersion = Number(value.dataVersion ?? value.data.dataVersion ?? 0);
  const data = normalizeAppData({ ...value.data, dataVersion }, { strict: true, validateLogos: true });
  return {
    data,
    summary: {
      exportedAt: typeof value.exportedAt === "string" ? value.exportedAt : "",
      appVersion: typeof value.appVersion === "string" ? value.appVersion : "Unknown",
      clients: data.clients.length,
      timesheets: data.timesheets.length,
      invoices: data.invoices.length,
    },
  };
}

function hasMeaningfulCrewQuoteData(data: AppData) {
  const p = data.profile;
  return data.clients.length > 0
    || data.timesheets.length > 0
    || data.invoices.length > 0
    || Boolean(p.fullName || p.companyName || p.email || p.phone || p.businessLogoDataUrl || p.bankAccountNumber || p.defaultDayRate);
}

const genTSNum  = (list: Timesheet[]) => { const yr = new Date().getFullYear(); return `T-${yr}-${String((list || []).filter(t => t?.timesheetNumber?.startsWith(`T-${yr}`)).length + 1).padStart(4, "0")}`; };
const invoiceNumberSeq = (invoiceNumber: string, year: number) => {
  const match = String(invoiceNumber || "").match(new RegExp(`^I-${year}-(\\d+)$`));
  return match ? parseInt(match[1], 10) || 0 : 0;
};
const rememberInvoiceNumber = (profile: Profile, invoiceNumber?: string): Profile => {
  const n = String(invoiceNumber || "").trim();
  if (!n) return profile;
  const history = Array.isArray(profile.invoiceNumberHistory) ? profile.invoiceNumberHistory : [];
  return history.includes(n) ? profile : { ...profile, invoiceNumberHistory: [...history, n] };
};
const genINVNum = (list: Invoice[], profile?: Profile) => {
  const yr = new Date().getFullYear();
  const used = [
    ...(list || []).map(i => i?.invoiceNumber || ""),
    ...((profile?.invoiceNumberHistory || []) as string[]),
  ];
  const maxSeq = used.reduce((max, invoiceNumber) => Math.max(max, invoiceNumberSeq(invoiceNumber, yr)), 0);
  return `I-${yr}-${String(maxSeq + 1).padStart(4, "0")}`;
};

const rateDraftFromProfile = (profile: Profile): RateDraft => ({
  dayRate: profile.defaultDayRate,
  includedHours: profile.defaultIncludedHours,
  overtimeRule: profile.defaultOvertimeRule,
  otBand1Hours: profile.defaultOtBand1Hours,
  otBand1Mult: profile.defaultOtBand1Mult,
  otBand2Mult: profile.defaultOtBand2Mult,
  equipmentRental: profile.equipmentRentalDaily ? profile.defaultEquipmentRental : 0,
  perDiem: profile.defaultPerDiem,
  vat: profile.defaultVat,
  minTurnaround: profile.defaultMinTurnaround,
  turnaroundMode: profile.defaultTurnaroundMode,
  turnaroundPenMult: profile.defaultTurnaroundPenMult,
  travelPaid: profile.travelTimePaid,
  mealDeducted: profile.mealBreaksDeducted,
});

const rateDraftFromTimesheet = (timesheet: Partial<Timesheet>, profile: Profile): RateDraft => rateDraftFromProfile(profileForTimesheet(profile, timesheet));

const rateDraftFromMemory = (memory: RateMemory): RateDraft => ({
  dayRate: memory.dayRate,
  includedHours: memory.includedHours,
  overtimeRule: memory.overtimeRule,
  otBand1Hours: memory.otBand1Hours,
  otBand1Mult: memory.otBand1Mult,
  otBand2Mult: memory.otBand2Mult,
  equipmentRental: memory.equipmentRental,
  perDiem: memory.perDiem,
  vat: memory.vat,
  minTurnaround: memory.minTurnaround,
  turnaroundMode: memory.turnaroundMode,
  turnaroundPenMult: memory.turnaroundPenMult,
  travelPaid: memory.travelPaid,
  mealDeducted: memory.mealDeducted,
});

const memoryFromRateDraft = (rates: RateDraft, productionName: string): RateMemory => ({
  productionName,
  dayRate: num(rates.dayRate),
  includedHours: num(rates.includedHours, 10),
  overtimeRule: rates.overtimeRule,
  otBand1Hours: num(rates.otBand1Hours, 4),
  otBand1Mult: num(rates.otBand1Mult, 1.5),
  otBand2Mult: num(rates.otBand2Mult, 2),
  equipmentRental: num(rates.equipmentRental),
  perDiem: num(rates.perDiem),
  vat: num(rates.vat),
  minTurnaround: num(rates.minTurnaround, 10),
  turnaroundMode: rates.turnaroundMode,
  turnaroundPenMult: num(rates.turnaroundPenMult, 1.5),
  travelPaid: rates.travelPaid,
  mealDeducted: rates.mealDeducted,
  updatedAt: new Date().toISOString(),
});

const applyRateDraftToTimesheet = (timesheet: Timesheet, rates: RateDraft): Timesheet => ({
  ...timesheet,
  vat: num(rates.vat),
  defaultDayRate: num(rates.dayRate),
  defaultIncludedHours: num(rates.includedHours, 10),
  defaultEquipmentRental: num(rates.equipmentRental),
  defaultPerDiem: num(rates.perDiem),
  defaultOvertimeRule: rates.overtimeRule,
  defaultOtBand1Hours: num(rates.otBand1Hours, 4),
  defaultOtBand1Mult: num(rates.otBand1Mult, 1.5),
  defaultOtBand2Mult: num(rates.otBand2Mult, 2),
  defaultMinTurnaround: num(rates.minTurnaround, 10),
  defaultTurnaroundMode: rates.turnaroundMode,
  defaultTurnaroundPenMult: num(rates.turnaroundPenMult, 1.5),
  mealBreaksDeducted: rates.mealDeducted,
  travelTimePaid: rates.travelPaid,
  equipmentRentalDaily: true,
});

const applyRateDraftToEntry = (entry: TimesheetEntry, rates: RateDraft, profile: Profile): TimesheetEntry =>
  withEntrySnapshots({
    ...entry,
    dayRate: num(rates.dayRate),
    includedHours: num(rates.includedHours, 10),
    overtimeRule: rates.overtimeRule,
    otBand1Hours: num(rates.otBand1Hours, 4),
    otBand1Mult: num(rates.otBand1Mult, 1.5),
    otBand2Mult: num(rates.otBand2Mult, 2),
    equipmentRental: num(rates.equipmentRental),
    perDiem: num(rates.perDiem),
    mealDeducted: rates.mealDeducted,
    travelPaid: rates.travelPaid,
    dayRateUsed: num(rates.dayRate),
    includedHoursUsed: num(rates.includedHours, 10),
    overtimeRuleUsed: rates.overtimeRule,
    otBand1HoursUsed: num(rates.otBand1Hours, 4),
    otBand1MultUsed: num(rates.otBand1Mult, 1.5),
    otBand2MultUsed: num(rates.otBand2Mult, 2),
    equipmentRentalUsed: num(rates.equipmentRental),
    perDiemUsed: num(rates.perDiem),
    vatRateUsed: num(rates.vat),
    mealDeductedUsed: rates.mealDeducted,
    travelPaidUsed: rates.travelPaid,
    turnaroundRuleUsed: rates.turnaroundMode,
    turnaroundMinimumHoursUsed: num(rates.minTurnaround, 10),
    turnaroundPenaltyMultUsed: num(rates.turnaroundPenMult, 1.5),
  }, { ...profile, ...profileForTimesheet(profile, { vat: rates.vat, defaultDayRate: rates.dayRate, defaultIncludedHours: rates.includedHours, defaultEquipmentRental: rates.equipmentRental, defaultPerDiem: rates.perDiem, defaultOvertimeRule: rates.overtimeRule, defaultOtBand1Hours: rates.otBand1Hours, defaultOtBand1Mult: rates.otBand1Mult, defaultOtBand2Mult: rates.otBand2Mult, defaultMinTurnaround: rates.minTurnaround, defaultTurnaroundMode: rates.turnaroundMode, defaultTurnaroundPenMult: rates.turnaroundPenMult, mealBreaksDeducted: rates.mealDeducted, travelTimePaid: rates.travelPaid, equipmentRentalDaily: true }) });

/** Default fields for a new entry, auto-filled from profile */
const entryDefaults = (profile: Profile, prev?: TimesheetEntry, prodName?: string): Omit<TimesheetEntry, "id"> => ({
  date:             prev ? nextDayStr(prev.date) : todayStr(),
  productionName:   prodName || prev?.productionName || "",
  location:         "",
  notes:            "",
  callTime:         "08:00",
  wrapTime:         "18:00",
  mealBreakMinutes: 60,
  mealDeducted:     profile.mealBreaksDeducted,
  travelStartTime:  "",
  travelEndTime:    "",
  travelDistance:   "",
  travelPaid:       profile.travelTimePaid,
  dayRate:          profile.defaultDayRate,
  includedHours:    profile.defaultIncludedHours,
  overtimeRule:     profile.defaultOvertimeRule,
  otBand1Hours:     profile.defaultOtBand1Hours,
  otBand1Mult:      profile.defaultOtBand1Mult,
  otBand2Mult:      profile.defaultOtBand2Mult,
  equipmentRental:  profile.equipmentRentalDaily ? profile.defaultEquipmentRental : 0,
  perDiem:          profile.defaultPerDiem,
  expenses:         0,
  expenseDescription: "",
  dayRateUsed:      profile.defaultDayRate,
  includedHoursUsed: profile.defaultIncludedHours,
  overtimeRuleUsed: profile.defaultOvertimeRule,
  otBand1HoursUsed: profile.defaultOtBand1Hours,
  otBand1MultUsed:  profile.defaultOtBand1Mult,
  otBand2MultUsed:  profile.defaultOtBand2Mult,
  equipmentRentalUsed: profile.equipmentRentalDaily ? profile.defaultEquipmentRental : 0,
  perDiemUsed:      profile.defaultPerDiem,
  vatRateUsed:      profile.defaultVat,
  travelPaidUsed:   profile.travelTimePaid,
  mealDeductedUsed: profile.mealBreaksDeducted,
  turnaroundRuleUsed: profile.defaultTurnaroundMode,
  turnaroundMinimumHoursUsed: profile.defaultMinTurnaround,
  turnaroundPenaltyMultUsed: profile.defaultTurnaroundPenMult,
  isSunday:         false,
  isPublicHoliday:  false,
});

/** Prefill a new unsaved day from the previous saved day. */
const duplicateEntry = (prev: TimesheetEntry, currentDate: string, includeExpenses = false): Omit<TimesheetEntry, "id"> => {
  const {
    id: _id,
    calcOnSetHours: _calcOnSetHours,
    calcMealHours: _calcMealHours,
    calcTravelHours: _calcTravelHours,
    calcPaidHours: _calcPaidHours,
    calcOvertimeHours: _calcOvertimeHours,
    calcOvertimeCost: _calcOvertimeCost,
    calcDayTotal: _calcDayTotal,
    ...copy
  } = prev;
  return {
    ...copy,
    date: currentDate,
    expenses: includeExpenses ? num(prev.expenses) : 0,
    expenseDescription: includeExpenses ? (prev.expenseDescription || "") : "",
  };
};

// ═══════════════════════════════════════════════════════════════════════════
// UI PRIMITIVES
// ═══════════════════════════════════════════════════════════════════════════

const UI = {
  focus: "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500",
  card: "bg-white rounded-lg border border-slate-200 shadow-[0_1px_2px_rgba(15,23,42,0.04)]",
  field: "w-full min-h-10 px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white placeholder:text-slate-300 text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/25 focus:border-blue-500 disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed aria-[invalid=true]:border-red-300 aria-[invalid=true]:focus:border-red-500 aria-[invalid=true]:focus:ring-red-500/20 transition-colors",
  tableWrap: "overflow-x-auto scrollbar-thin",
  table: "w-full min-w-[760px]",
  th: "px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase text-left whitespace-nowrap bg-slate-50/80 border-b border-slate-200",
  td: "px-4 py-4 text-sm align-middle",
  row: "group transition-colors hover:bg-blue-50/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500",
  rowClickable: "group cursor-pointer transition-colors hover:bg-blue-50/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500",
};

const Fld = ({ label, hint, error, required, children }: { label?: string; hint?: string; error?: string; required?: boolean; children: React.ReactNode }) => (
  <div className="space-y-1.5">
    {label && <label className="block text-[11px] font-semibold text-slate-600 uppercase">{label}{required && <span className="ml-1 text-red-500">*</span>}</label>}
    {children}
    {error && <p className="text-xs leading-relaxed text-red-600">{error}</p>}
    {hint && <p className="text-xs leading-relaxed text-slate-500">{hint}</p>}
  </div>
);

const base = UI.field;

const Inp = ({ label, hint, error, className = "", required, ...p }: React.InputHTMLAttributes<HTMLInputElement> & { label?: string; hint?: string; error?: string }) =>
  <Fld label={label} hint={hint} error={error} required={required}><input className={`${base} ${className}`} required={required} aria-invalid={Boolean(error) || p["aria-invalid"]} {...p} /></Fld>;

const TInp = ({ label, className = "", required, ...p }: React.InputHTMLAttributes<HTMLInputElement> & { label?: string }) =>
  <Fld label={label} required={required}><input className={`${base} font-mono text-[15px] font-semibold ${className}`} type="time" required={required} {...p} /></Fld>;

const SInp = ({ label, hint, error, children, className = "", required, ...p }: React.SelectHTMLAttributes<HTMLSelectElement> & { label?: string; hint?: string; error?: string; children: React.ReactNode }) =>
  <Fld label={label} hint={hint} error={error} required={required}><select className={`${base} ${className}`} required={required} aria-invalid={Boolean(error) || p["aria-invalid"]} {...p}>{children}</select></Fld>;

const TxInp = ({ label, error, className = "", required, ...p }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string; error?: string }) =>
  <Fld label={label} error={error} required={required}><textarea className={`${base} resize-none ${className}`} required={required} aria-invalid={Boolean(error) || p["aria-invalid"]} {...p} /></Fld>;

const Tog = ({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) => (
  <div className="flex min-h-12 items-center justify-between gap-4 py-2.5">
    <div className="min-w-0"><p className="text-sm font-medium text-slate-800">{label}</p>{hint && <p className="text-xs leading-relaxed text-slate-500 mt-0.5">{hint}</p>}</div>
    <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 flex-shrink-0 rounded-full transition-colors ${UI.focus} ${checked ? "bg-blue-600" : "bg-slate-300"}`}>
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${checked ? "translate-x-5" : "translate-x-0.5"}`} />
    </button>
  </div>
);

const Btn = ({ children, variant = "primary", size = "md", className = "", ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string; size?: string }) => {
  const v: Record<string, string> = { primary: "bg-blue-600 hover:bg-blue-700 text-white shadow-sm", secondary: "bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 shadow-sm", ghost: "hover:bg-slate-100 text-slate-600", success: "bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm", danger: "bg-red-50 hover:bg-red-100 text-red-700 border border-red-200", amber: "bg-amber-500 hover:bg-amber-600 text-white shadow-sm" };
  const s: Record<string, string> = { xs: "px-2.5 py-1.5 text-xs rounded-md min-h-8", sm: "px-3 py-2 text-xs rounded-md min-h-9", md: "px-4 py-2.5 text-sm rounded-lg min-h-10", lg: "px-5 py-3 text-sm rounded-lg min-h-11" };
  return <button type={p.type || "button"} className={`inline-flex items-center justify-center gap-2 font-semibold transition-colors ${UI.focus} ${v[variant] || v.primary} ${s[size] || s.md} disabled:opacity-50 disabled:cursor-not-allowed ${className}`} {...p}>{children}</button>;
};

const Card = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement> & { children: React.ReactNode }>(({ children, className = "", ...p }, ref) =>
  <div ref={ref} className={`${UI.card} ${className}`} {...p}>{children}</div>
);

const Badge = ({ children, color = "gray" }: { children: React.ReactNode; color?: string }) => {
  const c: Record<string, string> = {
    gray: "bg-slate-100 text-slate-700 ring-slate-200",
    neutral: "bg-slate-100 text-slate-700 ring-slate-200",
    blue: "bg-blue-50 text-blue-700 ring-blue-200",
    teal: "bg-teal-50 text-teal-700 ring-teal-200",
    green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    amber: "bg-amber-50 text-amber-800 ring-amber-200",
    orange: "bg-orange-50 text-orange-700 ring-orange-200",
    purple: "bg-purple-50 text-purple-700 ring-purple-200",
    red: "bg-red-50 text-red-700 ring-red-200",
  };
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold leading-none ring-1 ${c[color] || c.gray}`}>{children}</span>;
};

const SRow = ({ label, value, bold, amber, indent }: { label: string; value: React.ReactNode; bold?: boolean; amber?: boolean; indent?: boolean }) => (
  <div className={`flex justify-between text-sm py-0.5 ${indent ? "pl-3" : ""} ${bold ? "font-bold text-gray-900 pt-2" : "text-gray-600"}`}>
    <span>{label}</span>
    <span className={`tabular-nums ${amber ? "text-amber-600 font-semibold" : bold ? "text-gray-900" : "font-medium text-gray-900"}`}>{value}</span>
  </div>
);

const AlertBox = ({ type = "info", children }: { type?: string; children: React.ReactNode }) => {
  const t: Record<string, string> = { info: "bg-blue-50 border-blue-200 text-blue-800", warning: "bg-amber-50 border-amber-200 text-amber-900", success: "bg-green-50 border-green-200 text-green-800", error: "bg-red-50 border-red-200 text-red-800" };
  const I: Record<string, React.ElementType> = { info: Info, warning: AlertTriangle, success: CheckCircle, error: AlertTriangle };
  const Icon = I[type] || Info;
  return <div className={`flex items-start gap-2.5 p-3 rounded-lg border text-sm ${t[type] || t.info}`}><Icon size={15} className="flex-shrink-0 mt-0.5" /><div>{children}</div></div>;
};

const IconButton = ({ label, variant = "ghost", className = "", children, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string; variant?: "ghost" | "danger" | "primary"; children: React.ReactNode }) => {
  const tone = variant === "danger"
    ? "text-slate-400 hover:text-red-600 hover:bg-red-50 focus-visible:text-red-600"
    : variant === "primary"
      ? "text-slate-400 hover:text-blue-600 hover:bg-blue-50 focus-visible:text-blue-600"
      : "text-slate-400 hover:text-slate-700 hover:bg-slate-100 focus-visible:text-slate-700";
  return <button type={p.type || "button"} aria-label={label} title={label} className={`inline-flex h-9 w-9 items-center justify-center rounded-md transition-colors ${UI.focus} ${tone} ${className}`} {...p}>{children}</button>;
};

function PageHeader({ title, description, actions, secondaryActions, badge }: { title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; secondaryActions?: React.ReactNode; badge?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="truncate text-2xl font-bold tracking-tight text-slate-950">{title}</h1>
          {badge}
        </div>
        {description && <p className="mt-1 text-sm leading-relaxed text-slate-500">{description}</p>}
        {secondaryActions && <div className="mt-3 flex flex-wrap gap-2">{secondaryActions}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 sm:justify-end">{actions}</div>}
    </div>
  );
}

function SectionCard({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <Card className="p-5 sm:p-6">
      <div className="mb-5">
        <h2 className="text-base font-bold text-slate-950">{title}</h2>
        {description && <p className="mt-1 text-sm leading-relaxed text-slate-500">{description}</p>}
      </div>
      {children}
    </Card>
  );
}

function MetricCard({ label, value, detail, tone = "slate", icon: Icon }: { label: string; value: React.ReactNode; detail: React.ReactNode; tone?: "slate" | "blue" | "green" | "red" | "orange"; icon: React.ElementType }) {
  const tones: Record<string, string> = { slate: "text-slate-900 bg-slate-100", blue: "text-blue-700 bg-blue-50", green: "text-emerald-700 bg-emerald-50", red: "text-red-700 bg-red-50", orange: "text-orange-700 bg-orange-50" };
  return (
    <Card className="p-4 sm:p-5 min-h-32">
      <div className="flex h-full items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
          <p className={`mt-3 truncate text-2xl font-bold tabular-nums ${tones[tone]?.split(" ")[0] || "text-slate-900"}`}>{value}</p>
          <p className="mt-2 text-sm text-slate-500">{detail}</p>
        </div>
        <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${tones[tone] || tones.slate}`}><Icon size={16}/></span>
      </div>
    </Card>
  );
}

function ProductionRateFields({ rates, onChange, currency }: { rates: RateDraft; onChange: (rates: RateDraft) => void; currency: string }) {
  const sym = { ZAR: "R", USD: "$", GBP: "£", EUR: "€" }[currency] || "R";
  const setN = (k: keyof RateDraft) => (e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...rates, [k]: num(e.target.value) });
  const setS = (k: keyof RateDraft) => (e: React.ChangeEvent<HTMLSelectElement>) => onChange({ ...rates, [k]: e.target.value });
  const setB = (k: keyof RateDraft) => (v: boolean) => onChange({ ...rates, [k]: v });
  const isCustom = rates.overtimeRule === "custom";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Inp label={`Day Rate (${sym})`} type="number" min="0" value={rates.dayRate || ""} onChange={setN("dayRate")} />
        <Inp label="Included Hours" type="number" min="1" value={rates.includedHours || ""} onChange={setN("includedHours")} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <SInp label="Overtime Rule" value={rates.overtimeRule} onChange={setS("overtimeRule") as any}>
          {(Object.entries(OT_PRESETS) as [OTRuleId, { name: string }][]).map(([id, preset]) => <option key={id} value={id}>{preset.name}</option>)}
        </SInp>
        <Inp label="Minimum Turnaround (hrs)" type="number" min="0" value={rates.minTurnaround || ""} onChange={setN("minTurnaround")} />
      </div>
      {isCustom && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Inp label="Band 1 hrs" type="number" min="0" value={rates.otBand1Hours || ""} onChange={setN("otBand1Hours")} />
          <Inp label="Band 1 mult" type="number" min="0" step="0.1" value={rates.otBand1Mult || ""} onChange={setN("otBand1Mult")} />
          <Inp label="Band 2 mult" type="number" min="0" step="0.1" value={rates.otBand2Mult || ""} onChange={setN("otBand2Mult")} />
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Inp label={`Equipment / day (${sym})`} type="number" min="0" value={rates.equipmentRental || ""} onChange={setN("equipmentRental")} />
        <Inp label={`Per Diem (${sym})`} type="number" min="0" value={rates.perDiem || ""} onChange={setN("perDiem")} />
        <Inp label="VAT %" type="number" min="0" max="100" value={rates.vat || ""} onChange={setN("vat")} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <SInp label="Short Turnaround" value={rates.turnaroundMode} onChange={setS("turnaroundMode") as any}>
          <option value="warning">Show warning only</option>
          <option value="penalty">Charge penalty automatically</option>
          <option value="manual">Manual approval required</option>
        </SInp>
        <Inp label="Penalty Multiplier" type="number" min="0" step="0.1" value={rates.turnaroundPenMult || ""} onChange={setN("turnaroundPenMult")} />
      </div>
      <div className="divide-y divide-gray-100">
        <Tog checked={rates.travelPaid} onChange={setB("travelPaid")} label="Travel time is paid" />
        <Tog checked={rates.mealDeducted} onChange={setB("mealDeducted")} label="Meal breaks are deducted" />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TOAST
// ═══════════════════════════════════════════════════════════════════════════

function ToastContainer({ toasts }: { toasts: ToastMsg[] }) {
  if (!toasts.length) return null;
  return (
    <div className="fixed top-4 right-4 z-50 space-y-2 pointer-events-none">
      {toasts.map(t => (
        <div key={t.id} className={`flex items-center gap-3 px-4 py-3 rounded-xl shadow-xl text-sm font-medium min-w-64 max-w-sm animate-pulse ${t.type === "success" ? "bg-emerald-600 text-white" : t.type === "error" ? "bg-red-600 text-white" : "bg-slate-800 text-white"}`}>
          {t.type === "success" ? <CheckCircle size={16} /> : t.type === "error" ? <AlertTriangle size={16} /> : <Info size={16} />}
          {t.msg}
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SETTINGS PAGE
// ═══════════════════════════════════════════════════════════════════════════

type SettingsTabId = "profile" | "invoice" | "rates" | "overtime" | "timesheet" | "banking" | "backup";

function TimesheetCalculationReview({ timesheets, profile, ownerUserId }: {
  timesheets: Timesheet[];
  profile: Profile;
  ownerUserId?: string;
}) {
  const [candidates, setCandidates] = useState<Record<string, LegacyTimesheetCalculationSnapshotV1>>({});
  const [states, setStates] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!ownerUserId) { setStates({}); return; }
    let active = true;
    void Promise.all(timesheets.map(async timesheet => {
      const snapshot = getCalculationSnapshot(ownerUserId, timesheet.id);
      const state = await evaluateCalculationSnapshot(ownerUserId, timesheet as CrewTimesheet, snapshot);
      return [timesheet.id, state] as const;
    })).then(entries => {
      if (active) setStates(Object.fromEntries(entries));
    }).catch(() => {
      if (active) setError("CrewQuote could not read the local calculation review state.");
    });
    return () => { active = false; };
  }, [ownerUserId, revision, timesheets]);

  const prepare = async (timesheet: Timesheet) => {
    if (!ownerUserId) return;
    setBusyId(timesheet.id);
    setError("");
    try {
      const snapshot = await prepareCurrentBaselineSnapshot(ownerUserId, timesheet as CrewTimesheet, profile);
      setCandidates(current => ({ ...current, [timesheet.id]: snapshot }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "CrewQuote could not prepare this calculation review.");
    } finally {
      setBusyId("");
    }
  };

  const confirmBaseline = async (timesheet: Timesheet) => {
    if (!ownerUserId) return;
    const candidate = candidates[timesheet.id];
    if (!candidate) return;
    setBusyId(timesheet.id);
    setError("");
    try {
      const sourceFingerprint = await calculationSourceFingerprint(timesheet as CrewTimesheet);
      confirmCurrentBaselineSnapshot(ownerUserId, candidate, sourceFingerprint);
      setCandidates(current => { const { [timesheet.id]: _, ...remaining } = current; return remaining; });
      setRevision(current => current + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "CrewQuote could not confirm this calculation baseline.");
    } finally {
      setBusyId("");
    }
  };

  if (!ownerUserId) {
    return <AlertBox type="info">Sign in to review browser-local timesheet calculations for the owning CrewQuote account.</AlertBox>;
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-semibold text-slate-900">Timesheet Calculation Review</p>
        <p className="mt-1 text-sm leading-relaxed text-slate-500">Review freezes the displayed work-day and summary values in this browser for the signed-in account. It does not upload or migrate anything.</p>
      </div>
      {error && <AlertBox type="error">{error}</AlertBox>}
      {!timesheets.length && <p className="text-sm text-slate-500">No browser-local timesheets need review.</p>}
      {timesheets.map(timesheet => {
        const candidate = candidates[timesheet.id];
        const status = candidate ? "review-ready" : (states[timesheet.id] || "checking");
        const summary = candidate?.databaseSummaryPayload;
        return (
          <div key={timesheet.id} className="rounded-lg border border-slate-200 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900">{timesheet.timesheetNumber || "Untitled timesheet"}</p>
                <p className="mt-1 text-sm text-slate-500">{timesheet.productionName || "No production name"} · {timesheet.entries.length} work day{timesheet.entries.length === 1 ? "" : "s"}</p>
                <p className={`mt-2 text-xs font-semibold ${status === "valid" ? "text-emerald-700" : status === "review-ready" ? "text-amber-800" : "text-slate-500"}`}>Calculation state: {status.replace(/-/g, " ")}</p>
              </div>
              {!candidate && <Btn size="sm" variant="secondary" disabled={busyId === timesheet.id} onClick={() => void prepare(timesheet)}><FileText size={13}/>{busyId === timesheet.id ? "Preparing..." : "Review Values"}</Btn>}
            </div>
            {candidate && summary && (
              <div className="mt-4 border-t border-slate-200 pt-4">
                <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  <SRow label="Paid hours" value={Number(summary.summary_paid_hours).toFixed(2)} />
                  <SRow label="Overtime" value={Number(summary.summary_overtime_hours).toFixed(2)} />
                  <SRow label="VAT" value={fmtMoney(Number(summary.summary_vat_amount), timesheet.currency)} />
                  <SRow label="Total" value={fmtMoney(Number(summary.summary_grand_total), timesheet.currency)} />
                </div>
                <AlertBox type="warning"><span>The original record does not persist every historical calculation setting. Confirming stores this displayed baseline locally and makes it eligible for a later, separate migration step.</span></AlertBox>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Btn size="sm" disabled={busyId === timesheet.id} onClick={() => void confirmBaseline(timesheet)}><CheckCircle size={13}/>{busyId === timesheet.id ? "Confirming..." : "Confirm Frozen Baseline"}</Btn>
                  <Btn size="sm" variant="secondary" disabled={busyId === timesheet.id} onClick={() => void prepare(timesheet)}>Recalculate Review</Btn>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function SettingsPage({ profile, appData, onSave, onExportBackup, onImportBackup, onTestError, cloudSaving, cloudError, migrationPanel, phase4MigrationPanel, backupImportDisabledMessage, calculationOwnerUserId, phase4Completed }: {
  profile: Profile;
  appData: AppData;
  onSave: (p: Profile) => void | Promise<void>;
  onExportBackup: () => void | Promise<void>;
  onImportBackup: (data: AppData) => void | Promise<void>;
  onTestError: () => void;
  cloudSaving?: boolean;
  cloudError?: string;
  migrationPanel?: React.ReactNode;
  phase4MigrationPanel?: React.ReactNode;
  backupImportDisabledMessage?: string;
  calculationOwnerUserId?: string;
  phase4Completed?: boolean;
}) {
  const [f, setF] = useState<Profile>({ ...DEFAULT_PROFILE, ...profile });
  const [tab, setTab] = useState<SettingsTabId>("profile");
  const [saved, setSaved] = useState(false);
  const [logoMessage, setLogoMessage] = useState<{ type: "error" | "info"; text: string } | null>(null);
  const [logoBusy, setLogoBusy] = useState(false);
  const [importError, setImportError] = useState("");
  const [importReady, setImportReady] = useState<{ fileName: string; summary: ImportSummary; data: AppData } | null>(null);
  const logoInputId = "business-logo-upload";
  const set  = (k: keyof Profile) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF(p => ({ ...p, [k]: e.target.value }));
  const setN = (k: keyof Profile) => (e: React.ChangeEvent<HTMLInputElement>) => setF(p => ({ ...p, [k]: parseFloat(e.target.value) || 0 }));
  const setT = (k: keyof Profile) => (v: boolean) => setF(p => ({ ...p, [k]: v }));
  const savedProfile = useMemo(() => ({ ...DEFAULT_PROFILE, ...profile }), [profile]);
  const hasUnsavedChanges = useMemo(() => JSON.stringify(f) !== JSON.stringify(savedProfile), [f, savedProfile]);
  useEffect(() => {
    setF({ ...DEFAULT_PROFILE, ...profile });
  }, [profile]);

  const save = async () => {
    try {
      await onSave(f);
    } catch (err) {
      setLogoMessage({ type: "error", text: err instanceof Error ? err.message : "Settings could not be saved. Try exporting a backup and freeing browser storage." });
      return;
    }
    setSaved(true);
    setLogoMessage(null);
    setTimeout(() => setSaved(false), 2500);
  };
  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    setImportReady(null);
    setImportError("");
    if (!file) return;
    try {
      const text = await file.text();
      if (!text.trim()) throw new Error("The selected backup file is empty.");
      let parsed: unknown;
      try { parsed = JSON.parse(text); }
      catch { throw new Error("The selected file is not valid JSON."); }
      const validated = validateBackupPayload(parsed);
      setImportReady({ fileName: file.name, ...validated });
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "CrewQuote could not read this backup file.");
    }
  };
  const confirmImport = () => {
    if (!importReady) return;
    const ok = confirm("Importing this backup will replace your current CrewQuote data. CrewQuote will first download an emergency backup of your current data.");
    if (!ok) return;
    try {
      void Promise.resolve(onImportBackup(importReady.data)).catch(err => {
        setImportError(err instanceof Error ? err.message : "CrewQuote could not import this backup. Your current data has been preserved.");
      });
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "CrewQuote could not import this backup. Your current data has been preserved.");
    }
  };
  const handleLogoFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setLogoBusy(true);
    setLogoMessage(null);
    try {
      const logo = await prepareBusinessLogo(file);
      setF(p => ({ ...p, businessLogoDataUrl: logo.dataUrl }));
      setLogoMessage({ type: "info", text: `Logo ready to save. Optimised to ${logo.width} x ${logo.height}px, ${formatBytes(logo.bytes)}.` });
    } catch (err) {
      setLogoMessage({ type: "error", text: err instanceof Error ? err.message : "The logo could not be processed. Try a different image." });
    } finally {
      setLogoBusy(false);
    }
  };
  const removeLogo = () => {
    if (!f.businessLogoDataUrl) return;
    if (!confirm("Remove the saved business logo from Settings?")) return;
    setF(p => ({ ...p, businessLogoDataUrl: "" }));
    setLogoMessage({ type: "info", text: "Logo removed. Save Settings to keep this change." });
  };
  const sym  = { ZAR: "R", USD: "$", GBP: "£", EUR: "€" }[f.defaultCurrency] || "R";
  const isCustom = f.defaultOvertimeRule === "custom";
  const sections: { id: SettingsTabId; label: string; desc: string; icon: React.ElementType }[] = [
    { id: "profile", label: "My Business Details", desc: "Your name, role, company, and contact details.", icon: Users },
    { id: "invoice", label: "Invoice settings", desc: "Invoice label, VAT details, and default payment terms.", icon: FileText },
    { id: "rates", label: "Default Rates", desc: "Day rate, included hours, kit, per diem, currency, and VAT rate.", icon: Receipt },
    { id: "overtime", label: "Overtime & Turnaround", desc: "Overtime preset, custom bands, and turnaround handling.", icon: Zap },
    { id: "timesheet", label: "Timesheet", desc: "Default meal, travel, and equipment rules.", icon: Clock },
    { id: "banking", label: "Banking", desc: "Payment details printed on invoices.", icon: Building2 },
    { id: "backup", label: "Data & Backup", desc: "Export, import, version, and beta safety tools.", icon: Save },
  ];
  const activeSection = sections.find(s => s.id === tab) || sections[0];
  const ActiveIcon = activeSection.icon;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Settings"
        description="Set your business details once so timesheets and invoices fill themselves in."
      />

      <div className="grid gap-5 lg:grid-cols-[232px_minmax(0,1fr)]">
        <aside className="hidden lg:block">
          <nav className="sticky top-0 space-y-1">
            {sections.map(({ id, label, desc, icon: Icon }) => {
              const active = tab === id;
              return (
                <button key={id} type="button" onClick={() => setTab(id)}
                  className={`w-full rounded-lg px-3 py-3 text-left transition-colors ${UI.focus} ${active ? "bg-slate-900 text-white shadow-sm" : "text-slate-600 hover:bg-white hover:text-slate-950 hover:shadow-sm"}`}>
                  <span className="flex items-center gap-2.5">
                    <Icon size={16} className={active ? "text-blue-200" : "text-slate-400"} />
                    <span className="text-sm font-semibold">{label}</span>
                  </span>
                  <span className={`mt-1 block pl-6 text-xs leading-relaxed ${active ? "text-slate-300" : "text-slate-500"}`}>{desc}</span>
                </button>
              );
            })}
          </nav>
        </aside>

        <div className="min-w-0 max-w-[1100px] space-y-5">
          <div className="lg:hidden">
            <SInp label="Settings Section" value={tab} onChange={e => setTab(e.target.value as SettingsTabId)}>
              {sections.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
            </SInp>
          </div>

          <div className="sticky top-0 z-20 -mx-1 rounded-lg border border-slate-200 bg-slate-50/95 p-3 shadow-sm backdrop-blur">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-700"><ActiveIcon size={15}/></span>
                  <div>
                    <h2 className="text-base font-bold text-slate-950">{activeSection.label}</h2>
                    <p className="text-xs text-slate-500">{activeSection.desc}</p>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                {hasUnsavedChanges && <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800 ring-1 ring-amber-200">Unsaved changes</span>}
                {cloudError && <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 ring-1 ring-red-200">Cloud save unavailable</span>}
                {saved && <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200"><CheckCircle size={13}/> Saved to your CrewQuote account.</span>}
                <Btn onClick={save} disabled={cloudSaving}><Save size={14} /> {cloudSaving ? "Saving..." : "Save Settings"}</Btn>
              </div>
            </div>
          </div>

          {tab === "profile" && (
            <div className="space-y-5">
              <SectionCard title="Business identity" description="These details identify you on timesheets and invoices.">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2"><Inp label="Full Name" value={f.fullName} onChange={set("fullName")} placeholder="Your full name" /></div>
                  <Inp label="Role" value={f.role} onChange={set("role")} placeholder="e.g. Sound Mixer" />
                  <Inp label="Trading / Company Name" value={f.companyName} onChange={set("companyName")} />
                </div>
              </SectionCard>

              <SectionCard title="Contact details" description="Used as seller contact details on generated documents.">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Inp label="Email" type="email" value={f.email} onChange={set("email")} />
                  <Inp label="Phone" type="tel" value={f.phone} onChange={set("phone")} />
                  <div className="md:col-span-2"><TxInp label="Address" value={f.address} onChange={set("address")} rows={3} placeholder="Street, city, postal code" /></div>
                </div>
              </SectionCard>
            </div>
          )}

          {tab === "invoice" && (
            <div className="space-y-5">
              <SectionCard title="Business logo" description="Your logo will appear on invoice PDFs. PNG, JPG, or WebP. A transparent PNG works best.">
                <div className="grid grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)] gap-5">
                  <div>
                    <div
                      className="flex h-36 w-full max-w-[280px] items-center justify-center rounded-lg border border-slate-200 bg-white p-4"
                      style={{ backgroundImage: "linear-gradient(45deg,#f8fafc 25%,transparent 25%),linear-gradient(-45deg,#f8fafc 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#f8fafc 75%),linear-gradient(-45deg,transparent 75%,#f8fafc 75%)", backgroundSize: "16px 16px", backgroundPosition: "0 0,0 8px,8px -8px,-8px 0" }}
                    >
                      {f.businessLogoDataUrl
                        ? <img src={f.businessLogoDataUrl} alt="Current business logo preview" className="max-h-full max-w-full object-contain" />
                        : <div className="text-center text-sm text-slate-400"><Building2 size={22} className="mx-auto mb-2 text-slate-300"/>No logo uploaded</div>}
                    </div>
                  </div>
                  <div className="space-y-3">
                    <Fld label="Business Logo" hint={`Accepted formats: PNG, JPG, WebP. Original file limit: ${formatBytes(MAX_LOGO_FILE_BYTES)}. Stored logo limit: ${formatBytes(MAX_STORED_LOGO_BYTES)}.`}>
                      <input
                        id={logoInputId}
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={handleLogoFile}
                        disabled={logoBusy}
                        className={`${base} file:mr-3 file:rounded-md file:border-0 file:bg-blue-50 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-blue-700 hover:file:bg-blue-100`}
                      />
                    </Fld>
                    <div className="flex flex-wrap gap-2">
                      <Btn variant="secondary" onClick={() => document.getElementById(logoInputId)?.click()} disabled={logoBusy}>{logoBusy ? "Processing..." : "Replace Logo"}</Btn>
                      <Btn variant="danger" onClick={removeLogo} disabled={!f.businessLogoDataUrl || logoBusy}>Remove Logo</Btn>
                    </div>
                    {logoMessage && (
                      <div className={`rounded-lg border px-3 py-2 text-sm ${logoMessage.type === "error" ? "border-red-200 bg-red-50 text-red-700" : "border-blue-200 bg-blue-50 text-blue-800"}`}>
                        {logoMessage.text}
                      </div>
                    )}
                  </div>
                </div>
              </SectionCard>

              <SectionCard title="Invoice defaults" description="These settings appear on every invoice you create.">
                <div className="space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <SInp label="Invoice Label" value={f.invoiceLabel} onChange={set("invoiceLabel")}>
                      <option value="Invoice">Invoice</option>
                      <option value="Tax Invoice">Tax Invoice</option>
                    </SInp>
                    <Inp label="VAT / Tax Number" value={f.vatNumber} onChange={set("vatNumber")} placeholder="Your VAT registration number" />
                  </div>
                  <div className="rounded-lg border border-slate-200 px-4 py-2">
                    <Tog checked={f.vatRegistered} onChange={setT("vatRegistered")} label="VAT registered" hint="When enabled, invoices show subtotal excluding VAT, VAT amount, and total including VAT." />
                  </div>
                  <TxInp label="Payment Terms" value={f.paymentTerms} onChange={set("paymentTerms")} rows={3} placeholder="e.g. Payment due within 30 days" />
                </div>
              </SectionCard>
            </div>
          )}

          {tab === "rates" && (
            <div className="space-y-5">
              <SectionCard title="Default day rates" description="These rates auto-fill new timesheets and days.">
                <div className="space-y-5">
                  <SInp label="Default Currency" value={f.defaultCurrency} onChange={set("defaultCurrency")}>
                    {[["ZAR","South African Rand"],["USD","US Dollar"],["GBP","British Pound"],["EUR","Euro"]].map(([k,n]) => <option key={k} value={k}>{k} - {n}</option>)}
                  </SInp>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Inp label={`Day Rate (${sym})`} type="number" value={f.defaultDayRate || ""} onChange={setN("defaultDayRate")} placeholder="0.00" min="0" />
                    <Inp label="Included Hours / Day" type="number" value={f.defaultIncludedHours || ""} onChange={setN("defaultIncludedHours")} placeholder="10" min="1" hint="Hours included in your day rate. Overtime starts after this." />
                  </div>
                  <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm text-blue-800">
                    Base hourly rate: <strong>{fmtMoney(f.defaultDayRate && f.defaultIncludedHours ? f.defaultDayRate / f.defaultIncludedHours : 0, f.defaultCurrency)}/hr</strong>
                    {f.defaultDayRate > 0 && f.defaultIncludedHours > 0 && ` (${fmtMoney(f.defaultDayRate, f.defaultCurrency)} / ${f.defaultIncludedHours}h)`}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Inp label={`Equipment / day (${sym})`} type="number" value={f.defaultEquipmentRental || ""} onChange={setN("defaultEquipmentRental")} placeholder="0.00" min="0" />
                    <Inp label={`Per Diem (${sym})`} type="number" value={f.defaultPerDiem || ""} onChange={setN("defaultPerDiem")} placeholder="0.00" min="0" />
                    <Inp label="Default VAT %" type="number" value={f.defaultVat || ""} onChange={setN("defaultVat")} placeholder="0" min="0" max="100" />
                  </div>
                </div>
              </SectionCard>
            </div>
          )}

          {tab === "overtime" && (
            <div className="space-y-5">
              <SectionCard title="Overtime rule preset" description="Overtime is calculated automatically from your day rate and included hours.">
                <div className="space-y-3">
                  {(Object.entries(OT_PRESETS) as [OTRuleId, { name: string; desc: string }][]).map(([id, preset]) => (
                    <label key={id} className={`flex items-start gap-3 rounded-lg border p-4 cursor-pointer transition-colors ${f.defaultOvertimeRule === id ? "border-blue-500 bg-blue-50" : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"}`}>
                      <input type="radio" name="otRule" value={id} checked={f.defaultOvertimeRule === id}
                        onChange={() => setF(p => ({ ...p, defaultOvertimeRule: id }))} className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500" />
                      <div><p className="text-sm font-semibold text-slate-900">{preset.name}</p><p className="text-sm leading-relaxed text-slate-500 mt-0.5">{preset.desc}</p></div>
                    </label>
                  ))}
                </div>
              </SectionCard>

              {isCustom && (
                <SectionCard title="Custom overtime bands" description="Used only when the Custom Rule preset is selected.">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Inp label="Band 1 Length (hrs)" type="number" min="0" value={f.defaultOtBand1Hours || ""} onChange={setN("defaultOtBand1Hours")} placeholder="4" hint="First N OT hours" />
                    <Inp label="Band 1 Multiplier" type="number" min="0" step="0.1" value={f.defaultOtBand1Mult || ""} onChange={setN("defaultOtBand1Mult")} placeholder="1.5" />
                    <Inp label="Band 2 Multiplier" type="number" min="0" step="0.1" value={f.defaultOtBand2Mult || ""} onChange={setN("defaultOtBand2Mult")} placeholder="2.0" hint="After band 1" />
                  </div>
                </SectionCard>
              )}

              <SectionCard title="Turnaround" description="Control what happens when the gap between wrap and the next call is short.">
                <div className="space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Inp label="Minimum Turnaround Hours" type="number" min="0" value={f.defaultMinTurnaround || ""} onChange={setN("defaultMinTurnaround")} placeholder="10" />
                    <SInp label="When turnaround is short" value={f.defaultTurnaroundMode} onChange={set("defaultTurnaroundMode") as any}>
                      <option value="warning">Show warning only</option>
                      <option value="penalty">Charge penalty automatically</option>
                      <option value="manual">Manual approval required</option>
                    </SInp>
                  </div>
                  {f.defaultTurnaroundMode === "penalty" && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-3">
                      <p className="text-sm text-amber-900">Shortfall hours x base hourly rate x penalty multiplier will be added to the day.</p>
                      <Inp label="Turnaround Penalty Multiplier" type="number" min="0" step="0.1" value={f.defaultTurnaroundPenMult || ""} onChange={setN("defaultTurnaroundPenMult")} placeholder="1.5" />
                    </div>
                  )}
                </div>
              </SectionCard>
            </div>
          )}

          {tab === "timesheet" && (
            <SectionCard title="Timesheet defaults" description="These switches decide how new timesheet days behave by default.">
              <div className="divide-y divide-slate-100">
                <Tog checked={f.mealBreaksDeducted} onChange={setT("mealBreaksDeducted")} label="Meal breaks are deducted" hint="Meal break time is subtracted from on-set hours before calculating paid time." />
                <Tog checked={f.travelTimePaid} onChange={setT("travelTimePaid")} label="Travel time is paid" hint="Travel hours count toward paid hours for overtime calculation." />
                <Tog checked={f.equipmentRentalDaily} onChange={setT("equipmentRentalDaily")} label="Equipment rental applies daily" hint="Your default equipment rental rate is added to every shoot day automatically." />
              </div>
            </SectionCard>
          )}

          {tab === "banking" && (
            <SectionCard title="Banking details" description="These payment details appear on invoices you generate.">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2"><Inp label="Account Holder" value={f.bankAccountName} onChange={set("bankAccountName")} /></div>
                <Inp label="Bank Name" value={f.bankName} onChange={set("bankName")} />
                <Inp label="Account Number" value={f.bankAccountNumber} onChange={set("bankAccountNumber")} />
                <Inp label="Branch / Sort Code" value={f.bankBranchCode} onChange={set("bankBranchCode")} />
                <Inp label="SWIFT / BIC" value={f.bankSwift} onChange={set("bankSwift")} />
                <Inp label="IBAN" value={f.bankIban} onChange={set("bankIban")} />
                <Inp label="Payment Reference" value={f.bankReference} onChange={set("bankReference")} placeholder="e.g. Invoice number" />
              </div>
            </SectionCard>
          )}

          {tab === "backup" && (
            <div className="space-y-5">
              {migrationPanel}
              <SectionCard title="Data & Backup" description={`CrewQuote Pro Beta · Version ${APP_VERSION} · Data version ${CURRENT_DATA_VERSION}`}>
                <div className="space-y-5">
                  <AlertBox type="warning">
                    {phase4Completed
                      ? "Settings and clients are cloud-backed. Reviewed timesheets have been safely copied to your account, while this Timesheets workspace remains browser-local until final cloud activation. Invoices and payments remain browser-local."
                      : "Settings and clients are cloud-backed. Timesheets remain in this browser while awaiting reviewed migration. Invoices and payments remain browser-local."}
                  </AlertBox>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <MetricCard label="Clients" value={appData.clients.length} detail="Stored locally" icon={Users} tone="blue" />
                    <MetricCard label="Timesheets" value={appData.timesheets.length} detail="Includes days, rates, and expenses" icon={Clock} tone="slate" />
                    <MetricCard label="Invoices" value={appData.invoices.length} detail="Includes snapshots and payments" icon={Receipt} tone="green" />
                  </div>
                  <div className="rounded-lg border border-slate-200 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">Export Backup</p>
                        <p className="mt-1 text-sm leading-relaxed text-slate-500">Download one JSON file containing cloud settings and clients plus local logo data, timesheets, rate snapshots, expenses, invoices, payments, and numbering data.</p>
                      </div>
                      <Btn onClick={onExportBackup}><FileText size={14}/> Export Backup</Btn>
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-200 p-4">
                    <TimesheetCalculationReview timesheets={appData.timesheets} profile={profile} ownerUserId={calculationOwnerUserId} />
                  </div>
                  {phase4MigrationPanel}
                  <div className="rounded-lg border border-slate-200 p-4">
                    <div className="flex flex-col gap-4">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">Import Backup</p>
                        <p className="mt-1 text-sm leading-relaxed text-slate-500">Backup restore will return after the cloud import path is fully validated for mixed cloud/local data.</p>
                      </div>
                      {backupImportDisabledMessage && <AlertBox type="warning">{backupImportDisabledMessage}</AlertBox>}
                      <Fld label="Backup JSON File" hint="Current data is preserved if validation fails or you cancel the import.">
                        <input type="file" accept="application/json,.json" onChange={handleImportFile} disabled={Boolean(backupImportDisabledMessage)} className={`${base} file:mr-3 file:rounded-md file:border-0 file:bg-blue-50 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-blue-700 hover:file:bg-blue-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400`} />
                      </Fld>
                      {importError && <AlertBox type="error">{importError}</AlertBox>}
                      {importReady && (
                        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                          <p className="text-sm font-bold text-amber-950">Backup ready to import</p>
                          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-amber-900">
                            <SRow label="File" value={importReady.fileName} />
                            <SRow label="Backup created" value={importReady.summary.exportedAt ? fmtDate(importReady.summary.exportedAt.slice(0, 10)) : "Unknown"} />
                            <SRow label="App version" value={importReady.summary.appVersion} />
                            <SRow label="Clients" value={importReady.summary.clients} />
                            <SRow label="Timesheets" value={importReady.summary.timesheets} />
                            <SRow label="Invoices" value={importReady.summary.invoices} />
                          </div>
                          <p className="mt-3 text-sm font-semibold text-amber-950">Importing this backup will replace your current CrewQuote data.</p>
                          <div className="mt-4 flex flex-wrap gap-2">
                            <Btn variant="danger" onClick={confirmImport} disabled={Boolean(backupImportDisabledMessage)}>Confirm Replacement</Btn>
                            <Btn variant="secondary" onClick={() => setImportReady(null)}>Cancel Import</Btn>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </SectionCard>

              <SectionCard title="Beta support" description="Useful details for feedback and recovery.">
                <div className="space-y-4">
                  <div className="rounded-lg border border-slate-200 p-4">
                    <p className="text-sm font-semibold text-slate-900">CrewQuote Pro Beta</p>
                    <p className="mt-1 text-sm text-slate-500">Version {APP_VERSION}</p>
                  </div>
                  {IS_DEV_BUILD && (
                    <div className="rounded-lg border border-slate-200 p-4">
                      <p className="text-sm font-semibold text-slate-900">Test Recovery Screen</p>
                      <p className="mt-1 text-sm leading-relaxed text-slate-500">Triggers a safe render error so you can confirm the recovery screen, emergency backup, and reset warning behave correctly.</p>
                      <Btn variant="secondary" className="mt-3" onClick={() => { if (confirm("Trigger the recovery screen now?")) onTestError(); }}>Trigger Test Error</Btn>
                    </div>
                  )}
                </div>
              </SectionCard>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// CLIENTS
// ═══════════════════════════════════════════════════════════════════════════

function ClientFields({ client, onChange, errors = {}, fieldPrefix = "client" }: {
  client: Client;
  onChange: (c: Client) => void;
  errors?: Partial<Record<keyof Client, string>>;
  fieldPrefix?: string;
}) {
  const set = (k: keyof Client) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange({ ...client, [k]: e.target.value });
  const setPaymentTerms = (e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...client, paymentTerms: e.target.value, defaultPaymentTerms: e.target.value });
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Inp id={`${fieldPrefix}-companyName`} label="Company / Client Name" value={client.companyName} onChange={set("companyName")} placeholder="e.g. Homebrew Films" required error={errors.companyName} />
        <Inp label="Contact Person" value={client.contactPerson} onChange={set("contactPerson")} placeholder="Accounts or producer" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Inp label="Email" type="email" value={client.email} onChange={set("email")} />
        <Inp label="Phone" type="tel" value={client.phone} onChange={set("phone")} />
        <Inp label="Accounts Email" type="email" value={client.accountsEmail} onChange={set("accountsEmail")} placeholder="accounts@example.com" />
        <Inp label="Vendor Number" value={client.vendorNumber} onChange={set("vendorNumber")} placeholder="Optional" />
      </div>
      <TxInp id={`${fieldPrefix}-billingAddress`} label="Billing Address" value={client.billingAddress} onChange={set("billingAddress")} rows={2} placeholder="Registered billing address" required error={errors.billingAddress} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Inp label="VAT Number" value={client.vatNumber} onChange={set("vatNumber")} placeholder="Optional" />
        <Inp label="Payment Terms" value={client.paymentTerms || client.defaultPaymentTerms} onChange={setPaymentTerms} placeholder="Optional" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SInp label="Preferred Invoice Detail" value={client.preferredInvoiceDetailMode} onChange={e => onChange({ ...client, preferredInvoiceDetailMode: e.target.value as InvoiceDetailMode })}>
          <option value="summary">Summary</option>
          <option value="detailed">Detailed</option>
          <option value="summary_timesheet">Summary + Attached Timesheet</option>
        </SInp>
        <label className="flex items-center gap-3 text-sm font-medium text-gray-800 pt-6">
          <input type="checkbox" checked={client.poRequired} onChange={e => onChange({ ...client, poRequired: e.target.checked })} className="w-4 h-4 rounded border-gray-300 text-blue-600" />
          PO number required
        </label>
      </div>
      <TxInp label="Notes" value={client.notes} onChange={set("notes")} rows={2} placeholder="Internal notes" />
    </div>
  );
}

function ClientsPage({ clients, timesheets, invoices, onSave, onShowToast, loading, loadError, saving, onRetry }: {
  clients: Client[];
  timesheets: Timesheet[];
  invoices: Invoice[];
  onSave: (clients: Client[]) => void | Promise<void>;
  onShowToast: (msg: string, type?: ToastType) => void;
  loading?: boolean;
  loadError?: string;
  saving?: boolean;
  onRetry?: () => void;
}) {
  const [draft, setDraft] = useState<Client | null>(null);
  const [clientErrors, setClientErrors] = useState<Partial<Record<keyof Client, string>>>({});
  const [busy, setBusy] = useState(false);

  const startAdd = () => { setDraft(blankClient()); setClientErrors({}); };
  const startEdit = (client: Client) => { setDraft({ ...client }); setClientErrors({}); };
  const cancel = () => { setDraft(null); setClientErrors({}); };

  const saveClient = async () => {
    if (!draft) return;
    const errors = clientBillingErrors(draft);
    if (Object.keys(errors).length) {
      setClientErrors(errors);
      const first = firstClientBillingErrorField(errors);
      setTimeout(() => first && document.getElementById(`client-${first}`)?.focus(), 0);
      onShowToast("Complete the highlighted client billing fields.", "error");
      return;
    }
    const client = normalizeClient(draft);
    const exists = clients.some(c => c.id === client.id);
    setBusy(true);
    try {
      await onSave(exists ? clients.map(c => c.id === client.id ? client : c) : [...clients, client]);
      setDraft(null);
      setClientErrors({});
      onShowToast(`${client.companyName} saved`);
    } catch (err) {
      onShowToast(err instanceof Error ? err.message : "CrewQuote could not save this client to your account.", "error");
    } finally {
      setBusy(false);
    }
  };

  const deleteClient = async (id: string) => {
    const client = clients.find(c => c.id === id);
    const name = clientName(client) || "this client";
    const linkedTimesheets = (timesheets || []).filter(t => t.clientId === id);
    const linkedInvoices = (invoices || []).filter(i => i.clientId === id);
    if (linkedTimesheets.length || linkedInvoices.length) {
      alert(`This client is used by ${linkedTimesheets.length} timesheet${linkedTimesheets.length !== 1 ? "s" : ""} and ${linkedInvoices.length} invoice${linkedInvoices.length !== 1 ? "s" : ""} and cannot be deleted. Archive support can be added later.`);
      return;
    }
    if (!confirm(`Delete client "${name}"? This cannot be undone.`)) return;
    setBusy(true);
    try {
      await onSave(clients.filter(c => c.id !== id));
      onShowToast("Client deleted", "info");
    } catch (err) {
      onShowToast(err instanceof Error ? err.message : "CrewQuote could not delete this client from your account.", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Clients"
        description="Saved bill-to companies and people for invoices."
        actions={<Btn onClick={startAdd} disabled={loading || saving || busy}><Plus size={14}/> Add Client</Btn>}
      />
      {loading && <AlertBox type="info">Loading clients from your CrewQuote account...</AlertBox>}
      {loadError && (
        <AlertBox type="error">
          <span>{loadError}</span>
          {onRetry && <button type="button" onClick={onRetry} className="ml-2 font-semibold underline">Retry</button>}
        </AlertBox>
      )}

      {draft && (
        <Card className="p-5 sm:p-6 max-w-5xl">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-5">
            <div>
              <p className="text-base font-bold text-slate-950">{clients.some(c => c.id === draft.id) ? "Edit Client" : "Add Client"}</p>
              <p className="text-sm text-slate-500 mt-0.5">Client records are for invoice recipients only.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Btn variant="secondary" size="sm" onClick={cancel} disabled={busy || saving}>{"\u2190"} Back to Clients</Btn>
              <Btn size="sm" onClick={saveClient} disabled={busy || saving}><Save size={13}/> {busy || saving ? "Saving..." : "Save Client"}</Btn>
            </div>
          </div>
          <ClientFields client={draft} onChange={setDraft} errors={clientErrors} fieldPrefix="client" />
        </Card>
      )}

      <Card>
        {clients.length === 0 ? (
          <div className="py-16 text-center">
            <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4"><Building2 size={24} className="text-gray-300"/></div>
            <h3 className="text-base font-semibold text-gray-900 mb-1">No clients yet</h3>
            <p className="text-sm text-gray-400 mb-5 max-w-sm mx-auto">Add the company or production business you invoice.</p>
            <Btn onClick={startAdd}><Plus size={14}/> Add Client</Btn>
          </div>
        ) : (
          <div className={UI.tableWrap}>
            <table className={UI.table}>
              <thead><tr>{["Client","Contact","Email","Billing",""].map((h,i) => <th key={i} className={`${UI.th} ${i === 4 ? "text-right" : "text-left"}`}>{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-slate-100">
                {[...clients].sort((a,b) => clientName(a).localeCompare(clientName(b))).map(client => {
                  const complete = clientBillingComplete(client);
                  return (
                    <tr key={client.id} role="button" tabIndex={0} className={UI.rowClickable} onClick={() => startEdit(client)} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); startEdit(client); } }}>
                      <td className={UI.td}>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-blue-700 group-hover:text-blue-800">{client.companyName || "Unnamed client"}</span>
                          {!complete && <Badge color="amber">Incomplete</Badge>}
                        </div>
                        {client.vatNumber && <p className="text-xs text-gray-400 mt-0.5">VAT: {client.vatNumber}</p>}
                      </td>
                      <td className={`${UI.td} text-slate-600`}>{client.contactPerson || "—"}{client.phone && <p className="text-xs text-slate-400 mt-0.5">{client.phone}</p>}</td>
                      <td className={`${UI.td} text-slate-500`}>{client.email || "—"}</td>
                      <td className={`${UI.td} max-w-xs truncate text-slate-500`}>{client.billingAddress || "Not set"}</td>
                      <td className={`${UI.td} text-right`}>
                         <IconButton label={`Edit ${client.companyName || "client"}`} variant="primary" onClick={e => { e.stopPropagation(); if (!busy && !saving) startEdit(client); }}><Pencil size={14}/></IconButton>
                         <IconButton label={`Delete ${client.companyName || "client"}`} variant="danger" onClick={e => { e.stopPropagation(); if (!busy && !saving) void deleteClient(client.id); }}><Trash2 size={14}/></IconButton>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// LIVE CALC PANEL
// ═══════════════════════════════════════════════════════════════════════════

function LiveCalcPanel({ entry, profile, turnaround }: { entry: Partial<TimesheetEntry>; profile: Profile; turnaround: number | null }) {
  const cur    = profile.defaultCurrency || "ZAR";
  const c      = calcDay(entry, profile);
  const trMin  = num(entry.turnaroundMinimumHoursUsed, profile.defaultMinTurnaround || 10);
  const trMode = (entry.turnaroundRuleUsed || profile.defaultTurnaroundMode || "warning") as TurnaroundMode;
  const trMult = num(entry.turnaroundPenaltyMultUsed, profile.defaultTurnaroundPenMult || 1.5);
  const trWarn = turnaround !== null && turnaround < trMin;
  const trShort = turnaround !== null ? trMin - turnaround : 0;
  const turnaroundPenalty = trWarn && trMode === "penalty" ? Math.max(trShort, 0) * (c.baseHourly || 0) * trMult : 0;
  const estimatedTotal = c.total + turnaroundPenalty;
  const expenseLabel = entry.expenseDescription ? `Expenses (${entry.expenseDescription})` : "Expenses";
  const dayRateOverridden = num(entry.dayRateUsed ?? entry.dayRate, profile.defaultDayRate) !== num(profile.defaultDayRate);

  return (
    <div className="rounded-xl border-2 border-blue-200 p-5 sticky top-5" style={{ background: "#F0F7FF" }}>
      <div className="flex items-center gap-2 mb-4"><Zap size={14} className="text-blue-600" /><span className="text-xs font-bold text-blue-700 uppercase tracking-wider">Estimated Day Total</span></div>

      {/* Hours */}
      <div className="space-y-1 mb-3 text-sm">
        <div className="flex justify-between"><span className="text-gray-500">On-set</span>
          <span className="font-medium tabular-nums flex items-center gap-1.5">{hoursToHM(c.onSetH)}{c.overnight && <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full flex items-center gap-1"><Moon size={9}/>overnight</span>}</span>
        </div>
        {c.mealH > 0 && <div className="flex justify-between"><span className="text-gray-400">Meal break</span><span className="tabular-nums text-gray-400">− {hoursToHM(c.mealH)}</span></div>}
        {c.travH > 0 && <div className="flex justify-between"><span className="text-gray-500">Travel</span><span className="tabular-nums text-emerald-600 font-medium">+ {hoursToHM(c.travH)}</span></div>}
        <div className="flex justify-between font-semibold text-gray-900 pt-1 border-t border-blue-100"><span>Paid hours</span><span className="tabular-nums">{hoursToHM(c.paidH)}</span></div>
      </div>

      {/* Base rate display */}
      <div className="text-xs text-blue-600 mb-2 font-medium">
        Day rate used: {fmtMoney(c.dayRate, cur)}{dayRateOverridden ? " override" : ""} · Base hourly: {fmtMoney(c.baseHourly, cur)}/hr ({c.incH}h included)
      </div>

      {/* OT breakdown */}
      {c.totalOtH > 0 ? (
        <div className="rounded-lg p-2.5 mb-3 space-y-1" style={{ background: "#FEF3C7", border: "1px solid #FDE68A" }}>
          <div className="text-xs font-bold text-amber-800">{hoursToHM(c.totalOtH)} overtime</div>
          {c.b1H > 0 && <div className="text-xs text-amber-700">Band 1: {hoursToHM(c.b1H)} × {fmtMoney(c.baseHourly, cur)} × {c.bands.band1Mult}× = {fmtMoney(c.b1Cost, cur)}</div>}
          {c.b2H > 0 && <div className="text-xs text-amber-700">Band 2: {hoursToHM(c.b2H)} × {fmtMoney(c.baseHourly, cur)} × {c.bands.band2Mult}× = {fmtMoney(c.b2Cost, cur)}</div>}
        </div>
      ) : (
        <p className="text-xs text-gray-400 mb-3 italic">No overtime ({hoursToHM(c.incH)} included in day rate)</p>
      )}

      {/* Cost breakdown */}
      <div className="space-y-0.5 border-t border-blue-100 pt-3 mb-3 text-sm">
        <SRow label="Day rate"   value={fmtMoney(c.dayRate,        cur)} />
        <SRow label="Paid hours" value={hoursToHM(c.paidH)} />
        <SRow label="Overtime hours" value={c.totalOtH > 0 ? hoursToHM(c.totalOtH) : "0h"} amber={c.totalOtH > 0} />
        <SRow label="Estimated OT cost" value={fmtMoney(c.totalOtCost, cur)} amber={c.totalOtCost > 0} />
        <SRow label="Equipment rental" value={fmtMoney(c.equip,       cur)} />
        {c.perDiem > 0 && <SRow label="Per diem"    value={fmtMoney(c.perDiem,     cur)} />}
        <SRow label={expenseLabel} value={fmtMoney(c.expenses,    cur)} />
        {turnaroundPenalty > 0 && <SRow label="Turnaround penalty" value={fmtMoney(turnaroundPenalty, cur)} amber />}
      </div>

      <div className="border-t-2 border-blue-700 pt-3 flex justify-between items-baseline">
        <span className="font-bold text-gray-900">Estimated Total</span>
        <span className="text-xl font-bold text-gray-900 tabular-nums">{fmtMoney(estimatedTotal, cur)}</span>
      </div>

      {/* Turnaround */}
      {turnaround !== null && (
        <div className={`mt-3 rounded-lg p-2.5 text-xs flex items-start gap-2 ${trWarn ? "bg-amber-50 border border-amber-200 text-amber-800" : "bg-green-50 border border-green-200 text-green-700"}`}>
          {trWarn ? <AlertTriangle size={12} className="mt-0.5 flex-shrink-0"/> : <CheckCircle size={12} className="mt-0.5 flex-shrink-0"/>}
          <span>{trWarn ? `Short turnaround: ${hoursToHM(turnaround)} — ${hoursToHM(trShort)} below ${trMin}h minimum` : `Turnaround: ${hoursToHM(turnaround)} ✓`}</span>
        </div>
      )}
    </div>
  );
}

function CalculationBreakdown({ entry, profile, turnaround, title = "Calculation breakdown" }: {
  entry: Partial<TimesheetEntry>;
  profile: Profile;
  turnaround?: number | null;
  title?: string;
}) {
  const cur = profile.defaultCurrency || "ZAR";
  const c = calcDay(entry, profile);
  const trMin = num(entry.turnaroundMinimumHoursUsed, profile.defaultMinTurnaround || 10);
  const trMode = (entry.turnaroundRuleUsed || profile.defaultTurnaroundMode || "warning") as TurnaroundMode;
  const trMult = num(entry.turnaroundPenaltyMultUsed, profile.defaultTurnaroundPenMult || 1.5);
  const trShort = turnaround !== undefined && turnaround !== null ? Math.max(trMin - turnaround, 0) : 0;
  const turnaroundPenalty = trMode === "penalty" && trShort > 0 ? trShort * (c.baseHourly || 0) * trMult : 0;
  const travelTimesEntered = Boolean(entry.travelStartTime && entry.travelEndTime);
  const rows: { label: string; detail?: string; value: React.ReactNode; strong?: boolean }[] = [];
  const add = (label: string, value: React.ReactNode, detail?: string, strong?: boolean) => rows.push({ label, value, detail, strong });

  add("Day rate used", fmtMoney(c.dayRate, cur));
  add("Included hours", hoursToHM(c.incH));
  add("Base hourly rate", fmtMoney(c.baseHourly, cur), `${fmtMoney(c.dayRate, cur)} / ${hoursToHM(c.incH)}`);
  add("On-set duration", hoursToHM(c.onSetH), `${entry.callTime || "08:00"} to ${entry.wrapTime || "18:00"}${c.overnight ? " overnight" : ""}`);
  if (c.mealH > 0) add("Meal deduction", `-${hoursToHM(c.mealH)}`, entry.mealDeductedUsed ?? entry.mealDeducted ? "Deducted" : "Not deducted");
  if (travelTimesEntered) add("Paid travel", c.travH > 0 ? hoursToHM(c.travH) : "Not paid", entry.travelDistance ? `${entry.travelDistance} km` : undefined);
  add("Paid hours", hoursToHM(c.paidH), "On-set less meal plus paid travel");
  if (c.totalOtH > 0) add("Overtime hours", hoursToHM(c.totalOtH));
  if (c.b1H > 0) add("OT band 1 total", fmtMoney(c.b1Cost, cur), `${hoursToHM(c.b1H)} x ${fmtMoney(c.baseHourly, cur)} x ${c.bands.band1Mult}`);
  if (c.b2H > 0) add("OT band 2 total", fmtMoney(c.b2Cost, cur), `${hoursToHM(c.b2H)} x ${fmtMoney(c.baseHourly, cur)} x ${c.bands.band2Mult}`);
  if (c.equip > 0) add("Equipment rental", fmtMoney(c.equip, cur));
  if (c.perDiem > 0) add("Per diem", fmtMoney(c.perDiem, cur));
  if (c.expenses > 0) add(entry.expenseDescription ? `${entry.expenseDescription} expense` : "Expenses", fmtMoney(c.expenses, cur));
  if (turnaroundPenalty > 0) add("Turnaround penalty", fmtMoney(turnaroundPenalty, cur), `${hoursToHM(trShort)} shortfall x ${fmtMoney(c.baseHourly, cur)} x ${trMult}`);
  add("Day total", fmtMoney(c.total + turnaroundPenalty, cur), undefined, true);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-xs font-bold uppercase tracking-wider text-slate-400">{title}</p>
      <div className="mt-3 divide-y divide-slate-100">
        {rows.map((row, index) => (
          <div key={`${row.label}-${index}`} className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 py-2 text-sm">
            <div className="min-w-0">
              <p className={row.strong ? "font-bold text-slate-950" : "font-medium text-slate-700"}>{row.label}</p>
              {row.detail && <p className="mt-0.5 text-xs text-slate-400">{row.detail}</p>}
            </div>
            <div className={`text-right tabular-nums ${row.strong ? "font-bold text-slate-950" : "font-semibold text-slate-800"}`}>{row.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ADD DAY FORM  — no manual OT rate, auto-filled from profile
// ═══════════════════════════════════════════════════════════════════════════

function AddDayForm({ timesheet, profile, onAdd, onShowToast }: { timesheet: Timesheet; profile: Profile; onAdd: (e: TimesheetEntry) => void; onShowToast: (msg: string, type?: ToastType) => void }) {
  const defaultPrev = latestEntryForDefaults(timesheet.entries || []);
  const [form, setForm] = useState<Omit<TimesheetEntry, "id">>(() => entryDefaults(profile, defaultPrev, timesheet.productionName));
  const [showRates, setShowRates] = useState(false);
  const [includePreviousExpenses, setIncludePreviousExpenses] = useState(false);
  const usedKey: Record<string, string> = { dayRate: "dayRateUsed", includedHours: "includedHoursUsed", overtimeRule: "overtimeRuleUsed", otBand1Hours: "otBand1HoursUsed", otBand1Mult: "otBand1MultUsed", otBand2Mult: "otBand2MultUsed", equipmentRental: "equipmentRentalUsed", perDiem: "perDiemUsed", travelPaid: "travelPaidUsed", mealDeducted: "mealDeductedUsed" };
  const upd    = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const v = e.target.value;
    setForm(p => ({ ...p, [k]: v, ...(usedKey[k] ? { [usedKey[k]]: v } : {}) }));
  };
  const updNum = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = num(e.target.value);
    setForm(p => ({ ...p, [k]: v, ...(usedKey[k] ? { [usedKey[k]]: v } : {}) }));
  };
  const updBool= (k: string) => (v: boolean) => setForm(p => ({ ...p, [k]: v, ...(usedKey[k] ? { [usedKey[k]]: v } : {}) }));
  const updVat = (e: React.ChangeEvent<HTMLInputElement>) => setForm(p => ({ ...p, vatRateUsed: num(e.target.value) }));
  const updTurnaroundMin = (e: React.ChangeEvent<HTMLInputElement>) => setForm(p => ({ ...p, turnaroundMinimumHoursUsed: num(e.target.value) }));
  const updTurnaroundMult = (e: React.ChangeEvent<HTMLInputElement>) => setForm(p => ({ ...p, turnaroundPenaltyMultUsed: num(e.target.value) }));
  const updTurnaroundRule = (e: React.ChangeEvent<HTMLSelectElement>) => setForm(p => ({ ...p, turnaroundRuleUsed: e.target.value as TurnaroundMode }));
  const prev = findPreviousEntryForTurnaround(timesheet.entries || [], form);
  const turnaround = prev ? calcTurnaround(prev, form) : null;
  const cur = profile.defaultCurrency || "ZAR";
  const sym = { ZAR: "R", USD: "$", GBP: "£", EUR: "€" }[cur] || "R";
  const isCustom = form.overtimeRule === "custom";
  const trMin = profile.defaultMinTurnaround || 10;
  const trWarn = turnaround !== null && turnaround < trMin;
  const previousHasExpenses = Boolean(defaultPrev && (num(defaultPrev.expenses) > 0 || defaultPrev.expenseDescription));

  const handleDuplicate = () => {
    if (!defaultPrev) return;
    const nextDate = nextDayStr(defaultPrev.date || form.date);
    setForm({ ...duplicateEntry(defaultPrev, nextDate, includePreviousExpenses) });
    setShowRates(true);
    onShowToast(includePreviousExpenses ? "Previous day duplicated with expenses — review before saving" : "Previous day duplicated without one-off expenses", "info");
  };

  const handleAdd = () => {
    if (!form.date)     { onShowToast("Please enter a date", "error"); return; }
    if (!form.callTime) { onShowToast("Please enter a call time", "error"); return; }
    if (!form.wrapTime) { onShowToast("Please enter a wrap time", "error"); return; }
    const entry: TimesheetEntry = withEntrySnapshots({ id: uid(), ...form }, profile);
    const c = calcDay(entry, profile);
    onAdd(entry);
    const nextDate = nextDayStr(form.date);
    setForm(p => ({ ...entryDefaults(profile, entry, timesheet.productionName), date: nextDate }));
    onShowToast(`Day added successfully — ${fmtDate(entry.date)} | ${fmtMoney(c.total, cur)}${c.totalOtH > 0 ? ` | ${hoursToHM(c.totalOtH)} OT` : ""}`);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
      <div className="lg:col-span-2 space-y-4">
        {/* Turnaround warning */}
        {prev && trWarn && (
          <AlertBox type="warning">Short turnaround: {hoursToHM(turnaround!)} from previous wrap ({hoursToHM(trMin - turnaround!)} below your {trMin}h minimum)</AlertBox>
        )}

        <Card className="p-5">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">Day Details</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <Inp label="Date" type="date" value={form.date} onChange={upd("date")} />
            <Inp label="Location" value={form.location} onChange={upd("location")} placeholder="Set / studio / location" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <TInp label="Call Time (24h)" value={form.callTime} onChange={upd("callTime")} />
            <TInp label="Wrap Time (24h)" value={form.wrapTime} onChange={upd("wrapTime")} />
          </div>
          <div className="w-full sm:w-48">
            <Inp label="Meal Break (minutes)" type="number" min="0" value={form.mealBreakMinutes} onChange={updNum("mealBreakMinutes")}
              hint={form.mealDeducted ? "Deducted from working hours" : "Not deducted (see Timesheet settings)"} />
          </div>
        </Card>

        <Card className="p-5">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Travel <span className="normal-case font-normal text-gray-300 ml-1">(optional)</span></p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <TInp label="Travel Start" value={form.travelStartTime} onChange={upd("travelStartTime")} />
            <TInp label="Travel End"   value={form.travelEndTime}   onChange={upd("travelEndTime")} />
            <Inp  label="Distance (km)" type="number" min="0" value={form.travelDistance} onChange={upd("travelDistance")} placeholder="0" />
          </div>
        </Card>

        <TxInp label="Notes" rows={2} value={form.notes} onChange={upd("notes")} placeholder="Shoot notes, special conditions…" />

        {/* Rate and expense override — hidden by default */}
        <div>
          <button type="button" onClick={() => setShowRates(!showRates)} className="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-600 transition-colors py-1">
            {showRates ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
            Override rates / expenses for this day
            <span className="text-gray-300 text-xs">({fmtMoney(profile.defaultDayRate, cur)}/day · {OT_PRESETS[profile.defaultOvertimeRule]?.name} from your profile)</span>
          </button>

          {showRates && (
            <Card className="p-4 mt-2 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Inp label={`Day Rate Used (${sym})`} type="number" min="0" value={form.dayRate}       onChange={updNum("dayRate")} />
                <Inp label="Included Hours"         type="number" min="1" value={form.includedHours} onChange={updNum("includedHours")} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <SInp label="Overtime Rule" value={form.overtimeRule} onChange={upd("overtimeRule") as any}>
                  {(Object.entries(OT_PRESETS) as [OTRuleId, {name:string}][]).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}
                </SInp>
                <Inp label="VAT Rate %" type="number" min="0" max="100" value={form.vatRateUsed ?? profile.defaultVat} onChange={updVat} />
              </div>
              {isCustom && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <Inp label="Band 1 hrs"  type="number" min="0" value={form.otBand1Hours} onChange={updNum("otBand1Hours")} />
                  <Inp label="Band 1 mult" type="number" min="0" step="0.1" value={form.otBand1Mult} onChange={updNum("otBand1Mult")} />
                  <Inp label="Band 2 mult" type="number" min="0" step="0.1" value={form.otBand2Mult} onChange={updNum("otBand2Mult")} />
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Inp label={`Equipment Rental for This Day (${sym})`} type="number" min="0" value={form.equipmentRental} onChange={updNum("equipmentRental")} />
                <Inp label={`Per Diem for This Day (${sym})`}  type="number" min="0" value={form.perDiem}         onChange={updNum("perDiem")} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Inp label="Expense Description" value={form.expenseDescription} onChange={upd("expenseDescription")} placeholder="Parking" />
                <Inp label={`Expense Amount (${sym})`} type="number" min="0" value={form.expenses} onChange={updNum("expenses")} placeholder="0.00" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Inp label="Turnaround Min Hrs" type="number" min="0" value={form.turnaroundMinimumHoursUsed ?? profile.defaultMinTurnaround} onChange={updTurnaroundMin} />
                <SInp label="Turnaround Rule" value={form.turnaroundRuleUsed || profile.defaultTurnaroundMode} onChange={updTurnaroundRule}>
                  <option value="warning">Show warning only</option>
                  <option value="penalty">Charge penalty automatically</option>
                  <option value="manual">Manual approval required</option>
                </SInp>
                <Inp label="Penalty Multiplier" type="number" min="0" step="0.1" value={form.turnaroundPenaltyMultUsed ?? profile.defaultTurnaroundPenMult} onChange={updTurnaroundMult} />
              </div>
              <div className="divide-y divide-gray-100">
                <Tog checked={form.travelPaid}   onChange={updBool("travelPaid")}   label="Travel paid for this day" />
                <Tog checked={form.mealDeducted} onChange={updBool("mealDeducted")} label="Meal deducted for this day" />
              </div>
            </Card>
          )}
        </div>

        {defaultPrev && previousHasExpenses && (
          <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
            <input type="checkbox" checked={includePreviousExpenses} onChange={e => setIncludePreviousExpenses(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
            Include previous expenses
          </label>
        )}

        <div className="flex flex-col gap-3 sm:flex-row">
          <button onClick={handleAdd}
            className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm flex items-center justify-center gap-2">
            <Plus size={16}/> Add This Day
          </button>
          {defaultPrev && (
            <Btn variant="secondary" onClick={handleDuplicate} title="Prefill a new day from the latest saved day">
              <Copy size={14}/> Duplicate Previous Day
            </Btn>
          )}
        </div>
      </div>

      <LiveCalcPanel entry={form} profile={profile} turnaround={turnaround} />
    </div>
  );
}

function TimesheetDayEditor({ entry, profile, mode, onSave, onCancel }: {
  entry: TimesheetEntry;
  profile: Profile;
  mode: "edit" | "duplicate";
  onSave: (entry: TimesheetEntry) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<TimesheetEntry>(() => normalizeEntry(entry));
  const [showRates, setShowRates] = useState(false);
  const cur = profile.defaultCurrency || "ZAR";
  const sym = { ZAR: "R", USD: "$", GBP: "£", EUR: "€" }[cur] || "R";
  const usedKey: Record<string, string> = { dayRate: "dayRateUsed", includedHours: "includedHoursUsed", overtimeRule: "overtimeRuleUsed", otBand1Hours: "otBand1HoursUsed", otBand1Mult: "otBand1MultUsed", otBand2Mult: "otBand2MultUsed", equipmentRental: "equipmentRentalUsed", perDiem: "perDiemUsed", travelPaid: "travelPaidUsed", mealDeducted: "mealDeductedUsed" };
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const v = e.target.value;
    setForm(p => ({ ...p, [k]: v, ...(usedKey[k] ? { [usedKey[k]]: v } : {}) }));
  };
  const setN = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = num(e.target.value);
    setForm(p => ({ ...p, [k]: v, ...(usedKey[k] ? { [usedKey[k]]: v } : {}) }));
  };
  const setB = (k: string) => (v: boolean) => setForm(p => ({ ...p, [k]: v, ...(usedKey[k] ? { [usedKey[k]]: v } : {}) }));
  const setVat = (e: React.ChangeEvent<HTMLInputElement>) => setForm(p => ({ ...p, vatRateUsed: num(e.target.value) }));
  const c = calcDay(form, profile);

  const save = () => {
    if (!form.date || !form.callTime || !form.wrapTime) return;
    onSave(withEntrySnapshots(form, profile));
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-3xl shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <h2 className="text-base font-bold text-gray-900">{mode === "duplicate" ? "Duplicate Timesheet Day" : "Edit Timesheet Day"}</h2>
            <p className="text-sm text-gray-400 mt-0.5">{fmtDate(form.date)} · {hoursToHM(c.paidH)} paid · {fmtMoney(c.total, cur)}</p>
          </div>
          <div className="flex gap-2">
            <Btn variant="secondary" size="sm" onClick={onCancel}>Cancel</Btn>
            <Btn size="sm" onClick={save}><Save size={13}/> {mode === "duplicate" ? "Add Duplicate" : "Save Day"}</Btn>
          </div>
        </div>

        <div className="space-y-4">
          <Card className="p-4">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">Day Details</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <Inp label="Date" type="date" value={form.date} onChange={set("date")} />
              <Inp label="Location" value={form.location} onChange={set("location")} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <TInp label="Call Time" value={form.callTime} onChange={set("callTime")} />
              <TInp label="Wrap Time" value={form.wrapTime} onChange={set("wrapTime")} />
            </div>
            <Inp label="Meal Break (minutes)" type="number" min="0" value={form.mealBreakMinutes} onChange={setN("mealBreakMinutes")} />
          </Card>

          <Card className="p-4">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">Travel</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <TInp label="Travel Start" value={form.travelStartTime} onChange={set("travelStartTime")} />
              <TInp label="Travel End" value={form.travelEndTime} onChange={set("travelEndTime")} />
              <Inp label="Distance (km)" type="number" min="0" value={form.travelDistance} onChange={set("travelDistance")} />
            </div>
          </Card>

          <TxInp label="Notes" rows={2} value={form.notes} onChange={set("notes")} />

          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <button type="button" onClick={() => setShowRates(v => !v)} className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-gray-800 hover:bg-gray-50">
              <span>Rates and rules for this day</span>
              {showRates ? <ChevronUp size={15}/> : <ChevronDown size={15}/>}
            </button>
            {showRates && (
              <div className="p-4 border-t border-gray-100 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Inp label={`Day Rate (${sym})`} type="number" min="0" value={form.dayRate} onChange={setN("dayRate")} />
                  <Inp label="Included Hours" type="number" min="1" value={form.includedHours} onChange={setN("includedHours")} />
                </div>
                <SInp label="Overtime Rule" value={form.overtimeRule} onChange={set("overtimeRule") as any}>
                  {(Object.entries(OT_PRESETS) as [OTRuleId, { name: string }][]).map(([id, preset]) => <option key={id} value={id}>{preset.name}</option>)}
                </SInp>
                {form.overtimeRule === "custom" && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <Inp label="Band 1 hrs" type="number" min="0" value={form.otBand1Hours} onChange={setN("otBand1Hours")} />
                    <Inp label="Band 1 mult" type="number" min="0" step="0.1" value={form.otBand1Mult} onChange={setN("otBand1Mult")} />
                    <Inp label="Band 2 mult" type="number" min="0" step="0.1" value={form.otBand2Mult} onChange={setN("otBand2Mult")} />
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Inp label={`Equipment (${sym})`} type="number" min="0" value={form.equipmentRental} onChange={setN("equipmentRental")} />
                  <Inp label={`Per Diem (${sym})`} type="number" min="0" value={form.perDiem} onChange={setN("perDiem")} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Inp label="Expense Description" value={form.expenseDescription} onChange={set("expenseDescription")} placeholder="Parking" />
                  <Inp label={`Expense Amount (${sym})`} type="number" min="0" value={form.expenses} onChange={setN("expenses")} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Inp label="VAT %" type="number" min="0" max="100" value={form.vatRateUsed ?? profile.defaultVat} onChange={setVat} />
                  <Inp label="Turnaround min hrs" type="number" min="0" value={form.turnaroundMinimumHoursUsed ?? profile.defaultMinTurnaround} onChange={e => setForm(p => ({ ...p, turnaroundMinimumHoursUsed: num(e.target.value) }))} />
                  <SInp label="Turnaround Rule" value={form.turnaroundRuleUsed || profile.defaultTurnaroundMode} onChange={e => setForm(p => ({ ...p, turnaroundRuleUsed: e.target.value as TurnaroundMode }))}>
                    <option value="warning">Show warning only</option>
                    <option value="penalty">Charge penalty automatically</option>
                    <option value="manual">Manual approval required</option>
                  </SInp>
                </div>
                <div className="divide-y divide-gray-100">
                  <Tog checked={form.mealDeducted} onChange={setB("mealDeducted")} label="Meal break deducted for this day" />
                  <Tog checked={form.travelPaid} onChange={setB("travelPaid")} label="Travel time paid for this day" />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// WEEKLY VIEW  — crash-safe defensive rendering
// ═══════════════════════════════════════════════════════════════════════════

function WeeklyView({ timesheet, profile, onEditEntry, onDuplicateEntry, onDeleteEntry }: {
  timesheet: Timesheet;
  profile: Profile;
  onEditEntry: (entry: TimesheetEntry) => void;
  onDuplicateEntry: (entry: TimesheetEntry) => void;
  onDeleteEntry: (id: string) => void;
}) {
  const entries = sortEntriesForTurnaround(timesheet?.entries || []);
  const cur     = profile?.defaultCurrency || "ZAR";
  const minTR   = profile?.defaultMinTurnaround || 10;
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (entries.length === 0)
    return <Card className="py-16 text-center"><p className="text-gray-400 text-sm">No days yet — use the "Add Day" tab to enter your first shoot day.</p></Card>;

  // Pre-compute all calcs safely
  const rows = entries.map((e, i) => {
    let c;
    try { c = calcDay(e, profile); }
    catch { c = { onSetH: 0, overnight: false, mealH: 0, travH: 0, paidH: 0, incH: 10, baseHourly: 0, totalOtH: 0, b1H: 0, b1Cost: 0, b2H: 0, b2Cost: 0, totalOtCost: 0, equip: 0, perDiem: 0, expenses: 0, dayRate: 0, total: 0, ruleId: "sa-film" as OTRuleId, bands: { band1Hours: 4, band1Mult: 1.5, band2Mult: 2.0 } }; }
    const prevEntry = i > 0 ? entries[i - 1] : undefined;
    let tr: number | null = null;
    try { tr = prevEntry ? calcTurnaround(prevEntry, e) : null; } catch { tr = null; }
    const trWarn = tr !== null && tr < minTR;
    return { e, c, tr, trWarn };
  });

  // Column totals
  const totPaidH  = rows.reduce((s, r) => s + (r.c.paidH    || 0), 0);
  const totOtH    = rows.reduce((s, r) => s + (r.c.totalOtH  || 0), 0);
  const totOtCost = rows.reduce((s, r) => s + (r.c.totalOtCost || 0), 0);
  const totEquip  = rows.reduce((s, r) => s + (r.c.equip     || 0), 0);
  const totTravH  = rows.reduce((s, r) => s + (r.c.travH     || 0), 0);
  const totExp    = rows.reduce((s, r) => s + (r.c.expenses  || 0), 0);
  const totDay    = rows.reduce((s, r) => s + (r.c.total     || 0), 0);

  const thCls = "px-2 py-2.5 text-[11px] font-semibold text-slate-500 uppercase whitespace-nowrap text-left bg-slate-50/80 border-b border-slate-200";
  const thR   = `${thCls} text-right`;
  const tdCls = "px-2 py-3 text-sm";
  const tdR   = `${tdCls} text-right tabular-nums`;

  return (
    <Card>
      <div className={UI.tableWrap}>
        <table className="w-full min-w-[1080px]">
          <thead>
            <tr className="border-b border-gray-200">
              <th className={thCls}>Date</th>
              <th className={thCls}>Production</th>
              <th className={thCls}>Location</th>
              <th className={thCls}>Call</th>
              <th className={thCls}>Wrap</th>
              <th className={thR}>On-set</th>
              <th className={thR}>Meal</th>
              <th className={thR}>Travel</th>
              <th className={thR}>Paid Hrs</th>
              <th className={thR}>OT Hrs</th>
              <th className={thR}>OT Cost</th>
              <th className={thR}>Turnaround</th>
              <th className={thR}>Day Total</th>
              <th className={thCls}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ e, c, tr, trWarn }, i) => (
              <Fragment key={e.id || `row-${i}`}>
                {/* Turnaround warning row */}
                {tr !== null && (
                  <tr className={trWarn ? "bg-amber-50" : "bg-green-50"}>
                    <td colSpan={14} className="px-3 py-1">
                      <span className={`text-xs flex items-center gap-1.5 ${trWarn ? "text-amber-700" : "text-green-700"}`}>
                        {trWarn ? <AlertTriangle size={11}/> : <CheckCircle size={11}/>}
                        {trWarn
                          ? `Short turnaround: ${hoursToHM(tr)} — ${hoursToHM((profile.defaultMinTurnaround || 10) - tr)} below ${profile.defaultMinTurnaround || 10}h minimum`
                          : `Turnaround: ${hoursToHM(tr)} ✓`}
                      </span>
                    </td>
                  </tr>
                )}
                <tr className={`${UI.row} border-b border-slate-100`}>
                  <td className={`${tdCls} font-medium whitespace-nowrap`}>{fmtDate(e.date || "")}</td>
                  <td className={`${tdCls} text-gray-500 max-w-[100px] truncate`}>{e.productionName || "—"}</td>
                  <td className={`${tdCls} text-gray-500 max-w-[100px] truncate`}>{e.location || "—"}</td>
                  <td className={`${tdCls} font-mono`}>{e.callTime || "—"}</td>
                  <td className={`${tdCls} font-mono`}>{e.wrapTime || "—"}{c.overnight && <Moon size={10} className="inline ml-1 text-purple-500"/>}</td>
                  <td className={tdR}>{hoursToHM(c.onSetH  || 0)}</td>
                  <td className={`${tdR} text-gray-400`}>{c.mealH  > 0 ? hoursToHM(c.mealH)  : "—"}</td>
                  <td className={`${tdR} ${c.travH > 0 ? "text-emerald-600" : "text-gray-300"}`}>{c.travH > 0 ? hoursToHM(c.travH) : "—"}</td>
                  <td className={`${tdR} font-semibold`}>{hoursToHM(c.paidH || 0)}</td>
                  <td className={`${tdR} ${c.totalOtH > 0 ? "text-amber-600 font-semibold" : "text-gray-300"}`}>{c.totalOtH > 0 ? hoursToHM(c.totalOtH) : "—"}</td>
                  <td className={`${tdR} ${c.totalOtCost > 0 ? "text-amber-600" : "text-gray-300"}`}>{c.totalOtCost > 0 ? fmtMoney(c.totalOtCost, cur) : "—"}</td>
                  <td className={`${tdR} text-gray-400`}>{tr !== null ? hoursToHM(tr) : "—"}</td>
                  <td className={`${tdR} font-semibold text-gray-900`}>{fmtMoney(c.total || 0, cur)}</td>
                  <td className={tdCls}>
                    <div className="flex justify-end gap-1">
                      <IconButton label={`${expandedId === e.id ? "Hide" : "Show"} calculation for ${fmtDate(e.date || "")}`} variant="primary" onClick={() => setExpandedId(p => p === e.id ? null : e.id)}><Info size={14}/></IconButton>
                      <IconButton label={`Edit day ${fmtDate(e.date || "")}`} variant="primary" onClick={() => onEditEntry(e)}><Pencil size={14}/></IconButton>
                      <IconButton label={`Duplicate day ${fmtDate(e.date || "")}`} onClick={() => onDuplicateEntry(e)}><Copy size={14}/></IconButton>
                      <IconButton label={`Delete day ${fmtDate(e.date || "")}`} variant="danger" onClick={() => { if (confirm(`Delete timesheet day ${fmtDate(e.date || "")}? This cannot be undone.`)) onDeleteEntry(e.id); }}><Trash2 size={14}/></IconButton>
                    </div>
                  </td>
                </tr>
                {expandedId === e.id && (
                  <tr className="border-b border-slate-100 bg-slate-50/70">
                    <td colSpan={14} className="p-4">
                      <CalculationBreakdown entry={e} profile={profile} turnaround={tr} title={`Calculation for ${fmtDate(e.date || "")}`} />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-gray-900">
            <tr className="bg-gray-50">
              <td colSpan={5} className="px-2 py-2.5 text-sm font-bold text-gray-700">{entries.length} day{entries.length !== 1 ? "s" : ""} total</td>
              <td className={`${tdR} font-semibold`}></td>
              <td className={`${tdR} text-gray-400`}></td>
              <td className={`${tdR} text-emerald-600 font-semibold`}>{totTravH > 0 ? hoursToHM(totTravH) : "—"}</td>
              <td className={`${tdR} font-bold`}>{hoursToHM(totPaidH)}</td>
              <td className={`${tdR} font-bold text-amber-600`}>{totOtH > 0 ? hoursToHM(totOtH) : "—"}</td>
              <td className={`${tdR} font-bold text-amber-600`}>{totOtCost > 0 ? fmtMoney(totOtCost, cur) : "—"}</td>
              <td className={tdR}></td>
              <td className={`${tdR} font-bold text-gray-900`}>{fmtMoney(totDay, cur)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SUMMARY VIEW
// ═══════════════════════════════════════════════════════════════════════════

function SummaryView({ timesheet, profile, onStartInvoice }: { timesheet: Timesheet; profile: Profile; onStartInvoice: () => void }) {
  const cur = profile.defaultCurrency || "ZAR";
  const sum = useMemo(() => calcSummary(timesheet.entries || [], profile), [timesheet.entries, profile]);

  if ((timesheet.entries || []).length === 0)
    return <Card className="py-16 text-center"><p className="text-gray-400 text-sm">Add some shoot days first.</p></Card>;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card className="p-5">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Hours</p>
          <div className="space-y-0.5">
            <SRow label="Total days"        value={sum.totalDays} />
            <SRow label="Total paid hours"  value={hoursToHM(sum.totalPaidH)} />
            <SRow label="Normal hours"      value={hoursToHM(sum.totalPaidH - sum.totalOtH)} />
            {sum.totalOtH   > 0 && <div className="flex justify-between text-sm py-0.5"><span className="text-amber-600 font-medium">Overtime hours</span><span className="text-amber-600 font-semibold tabular-nums">{hoursToHM(sum.totalOtH)}</span></div>}
            {sum.totalTravH > 0 && <SRow label="Travel hours" value={hoursToHM(sum.totalTravH)} />}
          </div>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Costs</p>
          <div className="space-y-0.5">
            <SRow label="Day rates"        value={fmtMoney(sum.totalDayRates, cur)} />
            {sum.totalOtCost  > 0 && <SRow label="Overtime" value={fmtMoney(sum.totalOtCost,  cur)} amber />}
            {sum.totalEquip   > 0 && <SRow label="Equipment rental" value={fmtMoney(sum.totalEquip,   cur)} />}
            {sum.totalPerDiem > 0 && <SRow label="Per diem"         value={fmtMoney(sum.totalPerDiem, cur)} />}
            {sum.totalExp     > 0 && <SRow label="Expenses"         value={fmtMoney(sum.totalExp,     cur)} />}
            {sum.totalTurnaroundPenalty > 0 && <SRow label="Turnaround penalties" value={fmtMoney(sum.totalTurnaroundPenalty, cur)} amber />}
            <div className="border-t border-gray-200 pt-2 mt-1"><SRow label="Subtotal" value={fmtMoney(sum.subtotal, cur)} /></div>
            {sum.vatAmt > 0 && <SRow label={sum.mixedVat ? "VAT" : `VAT (${sum.vatPct}%)`} value={fmtMoney(sum.vatAmt, cur)} />}
            <div className="border-t-2 border-gray-900 pt-2 mt-1 flex justify-between">
              <span className="font-bold text-gray-900 text-base">Total Due</span>
              <span className="font-bold text-gray-900 text-lg tabular-nums">{fmtMoney(sum.grandTotal, cur)}</span>
            </div>
          </div>
        </Card>
      </div>
      {timesheet.status === "invoiced"
        ? <AlertBox type="success">Invoice already created for this timesheet.</AlertBox>
        : <Btn variant="success" size="lg" onClick={onStartInvoice}><Receipt size={16}/> Create Invoice from Timesheet</Btn>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// INVOICE REVIEW SCREEN
// ═══════════════════════════════════════════════════════════════════════════

function buildSummaryTimesheetLines(sum: ReturnType<typeof calcSummary>): InvoiceLine[] {
  const lines: InvoiceLine[] = [];
  if (sum.totalDayRates > 0) lines.push({ id: uid(), description: `Day Rates — ${sum.totalDays} day${sum.totalDays !== 1 ? "s" : ""}`, quantity: sum.totalDays, unitPrice: sum.totalDayRates / Math.max(sum.totalDays, 1), amount: sum.totalDayRates, taxable: true, category: "day-rate" });
  if (sum.totalOtCost  > 0) lines.push({ id: uid(), description: `Overtime — ${hoursToHM(sum.totalOtH)}`, quantity: 1, unitPrice: sum.totalOtCost, amount: sum.totalOtCost, taxable: true, category: "overtime" });
  if (sum.totalEquip   > 0) lines.push({ id: uid(), description: `Equipment Rental — ${sum.totalDays} day${sum.totalDays !== 1 ? "s" : ""}`, quantity: sum.totalDays, unitPrice: sum.totalEquip / Math.max(sum.totalDays, 1), amount: sum.totalEquip, taxable: true, category: "equipment" });
  if (sum.totalTravH   > 0) lines.push({ id: uid(), description: `Travel — ${hoursToHM(sum.totalTravH)}`, quantity: 1, unitPrice: 0, amount: 0, taxable: false, category: "travel" });
  if (sum.totalPerDiem + sum.totalExp > 0) lines.push({ id: uid(), description: "Expenses", quantity: 1, unitPrice: sum.totalPerDiem + sum.totalExp, amount: sum.totalPerDiem + sum.totalExp, taxable: true, category: "expenses" });
  if (sum.totalTurnaroundPenalty > 0) lines.push({ id: uid(), description: "Turnaround Penalties", quantity: 1, unitPrice: sum.totalTurnaroundPenalty, amount: sum.totalTurnaroundPenalty, taxable: true, category: "turnaround" });
  return lines;
}

function buildDetailedTimesheetLines(sum: ReturnType<typeof calcSummary>): InvoiceLine[] {
  const lines: InvoiceLine[] = [];
  sum.calcs.forEach(({ entry, c }) => {
    const d = fmtDate(entry.date || "");
    if (c.dayRate > 0) lines.push({ id: uid(), description: `${d} — Day Rate`, quantity: 1, unitPrice: c.dayRate, amount: c.dayRate, taxable: true, category: "day-rate" });
    if (c.b1H > 0) lines.push({ id: uid(), description: `${d} — Overtime band 1 (${hoursToHM(c.b1H)} @ ${c.bands.band1Mult}x)`, quantity: c.b1H, unitPrice: c.b1Cost / Math.max(c.b1H, 1), amount: c.b1Cost, taxable: true, category: "overtime" });
    if (c.b2H > 0) lines.push({ id: uid(), description: `${d} — Overtime band 2 (${hoursToHM(c.b2H)} @ ${c.bands.band2Mult}x)`, quantity: c.b2H, unitPrice: c.b2Cost / Math.max(c.b2H, 1), amount: c.b2Cost, taxable: true, category: "overtime" });
    if (c.equip > 0) lines.push({ id: uid(), description: `${d} — Equipment Rental`, quantity: 1, unitPrice: c.equip, amount: c.equip, taxable: true, category: "equipment" });
    if (c.travH > 0) lines.push({ id: uid(), description: `${d} — Travel (${hoursToHM(c.travH)}${entry.travelDistance ? `, ${entry.travelDistance} km` : ""})`, quantity: 1, unitPrice: 0, amount: 0, taxable: false, category: "travel" });
    if (c.perDiem + c.expenses > 0) {
      const expenseBits = [c.perDiem > 0 ? "per diem" : "", c.expenses > 0 ? (entry.expenseDescription || "expenses") : ""].filter(Boolean).join(" + ");
      lines.push({ id: uid(), description: `${d} — Expenses${expenseBits ? ` (${expenseBits})` : ""}`, quantity: 1, unitPrice: c.perDiem + c.expenses, amount: c.perDiem + c.expenses, taxable: true, category: "expenses" });
    }
    if (c.turnaroundPenalty > 0) lines.push({ id: uid(), description: `${d} — Turnaround penalty`, quantity: 1, unitPrice: c.turnaroundPenalty, amount: c.turnaroundPenalty, taxable: true, category: "turnaround" });
  });
  return lines;
}

const buildTimesheetLines = (sum: ReturnType<typeof calcSummary>, mode: InvoiceDetailMode) =>
  mode === "detailed" ? buildDetailedTimesheetLines(sum) : buildSummaryTimesheetLines(sum);

function rebuildDraftInvoiceFromTimesheet(inv: Invoice, timesheet: Timesheet, profile: Profile): Invoice {
  const effectiveProfile = profileForTimesheet(profile, timesheet);
  const sum = calcSummary(timesheet.entries || [], effectiveProfile);
  const detailMode = inv.detailMode || "summary";
  const baseLines = buildTimesheetLines(sum, detailMode);
  const extraLines = (inv.lineItems || []).filter(l => l.isExtra || l.category === "additional");
  const lineItems = [...baseLines, ...extraLines];
  const extraSubtotal = extraLines.reduce((s, l) => s + (l.amount || 0), 0);
  const extraTaxable = extraLines.reduce((s, l) => s + (l.taxable === false ? 0 : (l.amount || 0)), 0);
  const extraVat = profile.vatRegistered ? extraTaxable * ((sum.vatPct || effectiveProfile.defaultVat || 0) / 100) : 0;
  const subtotal = sum.subtotal + extraSubtotal;
  const vatAmount = sum.vatAmt + extraVat;
  const total = subtotal + vatAmount;
  const paidAmount = Math.min(safe(inv.paidAmount, 0), total);
  return normalizeInvoice({
    ...inv,
    productionName: timesheet.productionName,
    timesheetNumber: timesheet.timesheetNumber,
    timesheetDates: timesheetDateRange(timesheet),
    detailMode,
    lineItems,
    timesheetBreakdown: detailMode === "summary_timesheet" ? buildDetailedTimesheetLines(sum) : inv.timesheetBreakdown || [],
    subtotal,
    vat: sum.vatPct,
    vatAmount,
    total,
    paidAmount,
    balanceDue: Math.max(total - paidAmount, 0),
  });
}

function InvoiceReviewScreen({ timesheet, profile, clients, onSaveClients, invoices, onSave, onUpdateTimesheet, onBack, onShowToast }: {
  timesheet: Timesheet; profile: Profile; clients: Client[]; onSaveClients: (clients: Client[]) => void | Promise<void>; invoices: Invoice[];
  onSave: (inv: Invoice) => void; onUpdateTimesheet: (ts: Timesheet) => void; onBack: () => void; onShowToast: (msg: string, type?: ToastType) => void;
}) {
  const effectiveProfile = useMemo(() => profileForTimesheet(profile, timesheet), [profile, timesheet]);
  const cur = timesheet.currency || effectiveProfile.defaultCurrency || "ZAR";
  const sym = { ZAR: "R", USD: "$", GBP: "£", EUR: "€" }[cur] || "R";
  const sum = useMemo(() => calcSummary(timesheet.entries || [], effectiveProfile), [timesheet.entries, effectiveProfile]);
  const savedClient = getTimesheetClient(timesheet, clients);

  const [invoiceNumber, setInvoiceNumber] = useState(() => genINVNum(invoices, profile));
  const [poNumber, setPoNumber] = useState("");
  const [issueDate, setIssueDate] = useState(todayStr());
  const [dueDate, setDueDate] = useState("");
  const [status, setStatus] = useState<InvoiceStatus>("draft");
  const [detailMode, setDetailMode] = useState<InvoiceDetailMode>(DEFAULT_INVOICE_DETAIL_MODE);
  const [clientDraft, setClientDraft] = useState<Client>(() => savedClient ? { ...savedClient } : blankClient({ companyName: timesheet.clientName === "Unknown / add later" ? "" : timesheet.clientName || "" }));
  const [clientErrors, setClientErrors] = useState<Partial<Record<keyof Client, string>>>({});
  const [extras, setExtras] = useState<InvoiceLine[]>([]);
  const [newItem, setNewItem] = useState({ description: "", quantity: "1", unitPrice: "", taxable: true });
  const [paymentTerms, setPaymentTerms] = useState(timesheet.paymentTerms || savedClient?.paymentTerms || savedClient?.defaultPaymentTerms || profile.paymentTerms || "");
  const [paidAmountStr, setPaidAmountStr] = useState("");
  const [paidDate, setPaidDate] = useState("");
  const [notes, setNotes] = useState(timesheet.notes || "");
  const [showDayBreakdowns, setShowDayBreakdowns] = useState(false);

  const baseLines = useMemo(() => buildTimesheetLines(sum, detailMode), [sum, detailMode]);
  const timesheetBreakdown = useMemo(() => detailMode === "summary_timesheet" ? buildDetailedTimesheetLines(sum) : [], [sum, detailMode]);
  const allLines = [...baseLines, ...extras];
  const subtotal = allLines.reduce((s, l) => s + (l.amount || 0), 0);
  const taxableSubtotal = allLines.reduce((s, l) => s + (l.taxable === false ? 0 : (l.amount || 0)), 0);
  const vatPct = profile.vatRegistered ? sum.vatPct : 0;
  const extraTaxableSubtotal = extras.reduce((s, l) => s + (l.taxable === false ? 0 : (l.amount || 0)), 0);
  const vatAmt = profile.vatRegistered ? sum.vatAmt + extraTaxableSubtotal * (vatPct / 100) : 0;
  const total = subtotal + vatAmt;
  const paidAmount = Math.min(safe(paidAmountStr, 0), total);
  const balanceDue = Math.max(total - paidAmount, 0);
  const clientIncomplete = !clientBillingComplete(clientDraft);
  const duplicateInvoice = invoices.some(inv => inv.invoiceNumber === invoiceNumber);
  const poMissing = clientDraft.poRequired && !poNumber.trim();

  const focusClientBilling = (errors = clientBillingErrors(clientDraft)) => {
    setClientErrors(errors);
    document.getElementById("invoice-client-billing-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
    const first = firstClientBillingErrorField(errors);
    setTimeout(() => first && document.getElementById(`invoice-client-${first}`)?.focus(), 120);
  };

  const persistClientDetails = async (notify = true) => {
    const errors = clientBillingErrors(clientDraft);
    if (Object.keys(errors).length) {
      focusClientBilling(errors);
      if (notify) onShowToast("Complete the highlighted client billing fields.", "error");
      return null;
    }
    const client = normalizeClient(clientDraft);
    const exists = clients.some(c => c.id === client.id);
    try {
      await onSaveClients(exists ? clients.map(c => c.id === client.id ? client : c) : [...clients, client]);
    } catch (err) {
      onShowToast(err instanceof Error ? err.message : "CrewQuote could not save this client to your account.", "error");
      return null;
    }
    const updatedTS = {
      ...timesheet,
      clientId: client.id,
      clientName: clientName(client),
      clientIncomplete: !clientBillingComplete(client),
      paymentTerms: client.paymentTerms || client.defaultPaymentTerms || timesheet.paymentTerms || profile.paymentTerms,
    };
    onUpdateTimesheet(updatedTS);
    setClientDraft(client);
    setClientErrors({});
    if (client.paymentTerms || client.defaultPaymentTerms) setPaymentTerms(client.paymentTerms || client.defaultPaymentTerms);
    if (notify) onShowToast("Client billing details saved");
    return client;
  };

  const saveClientDetails = () => { void persistClientDetails(true); };

  const addExtra = () => {
    const qty = parseFloat(newItem.quantity) || 1;
    const up  = parseFloat(newItem.unitPrice) || 0;
    const desc = newItem.description.trim();
    if (!desc) { onShowToast("Expense description is required.", "error"); return; }
    if (qty <= 0) { onShowToast("Expense quantity must be greater than zero.", "error"); return; }
    if (up <= 0) { onShowToast("Expense amount must be greater than zero.", "error"); return; }
    const normalizedDesc = desc.toLowerCase();
    const duplicateGeneratedExpense = baseLines.some(l => l.category === "expenses" && l.description.toLowerCase().includes(normalizedDesc));
    const duplicateManualExpense = extras.some(l => l.description.trim().toLowerCase() === normalizedDesc);
    if (duplicateGeneratedExpense || duplicateManualExpense) {
      onShowToast(`${desc} already appears on this invoice. Add a different invoice-level expense to avoid double-counting.`, "error");
      return;
    }
    setExtras(p => [...p, withInvoiceLineAmount({ id: uid(), description: desc, quantity: qty, unitPrice: up, amount: qty * up, isExtra: true, taxable: newItem.taxable, category: "additional" })]);
    setNewItem({ description: "", quantity: "1", unitPrice: "", taxable: true });
  };

  const updateExtra = (id: string, patch: Partial<InvoiceLine>) =>
    setExtras(p => p.map(e => e.id === id ? withInvoiceLineAmount({ ...e, ...patch }) : e));
  const removeExtra = (id: string) => setExtras(p => p.filter(e => e.id !== id));

  const changeReviewStatus = (nextStatus: InvoiceStatus) => {
    setStatus(nextStatus);
    if (nextStatus === "paid") {
      setPaidAmountStr(String(total));
      if (!paidDate) setPaidDate(todayStr());
    }
  };

  const makeInvoice = (): Invoice => ({
    id: uid(),
    invoiceNumber,
    poNumber,
    issueDate,
    dueDate,
    clientId: clientDraft.id,
    clientName: clientName(clientDraft),
    client: clientDraft,
    crewName: profile.fullName || "",
    role: timesheet.role || profile.role || "",
    companyName: profile.companyName || profile.fullName || "",
    sellerLogoDataUrl: profile.businessLogoDataUrl || "",
    sellerSnapshot: status === "draft" ? undefined : sellerSnapshotFromProfile(profile),
    productionName: timesheet.productionName || "",
    timesheetNumber: timesheet.timesheetNumber || "",
    timesheetDates: timesheetDateRange(timesheet),
    detailMode,
    lineItems: allLines.map(withInvoiceLineAmount),
    timesheetBreakdown,
    subtotal,
    vat: vatPct,
    vatAmount: vatAmt,
    total,
    paidAmount,
    paidDate,
    balanceDue,
    currency: cur,
    status,
    banking: { accountName: profile.bankAccountName, bankName: profile.bankName, accountNumber: profile.bankAccountNumber, branchCode: profile.bankBranchCode, swift: profile.bankSwift, iban: profile.bankIban, reference: profile.bankReference || invoiceNumber },
    paymentTerms,
    paymentNotes: paymentTerms,
    notes,
    fromTimesheetId: timesheet.id,
    createdAt: new Date().toISOString(),
  });

  const ensureClientReady = () => {
    const errors = clientBillingErrors(clientDraft);
    if (!Object.keys(errors).length) return true;
    focusClientBilling(errors);
    onShowToast(`${clientName(clientDraft) || "This client"} is missing required billing details.`, "error");
    return false;
  };

  const ensureInvoiceReady = () => {
    if (!ensureClientReady()) return false;
    if (poMissing) {
      document.getElementById("invoice-details-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
      setTimeout(() => document.getElementById("invoice-po-number")?.focus(), 120);
      onShowToast("This client requires a purchase order number before the invoice can be finalised.", "error");
      return false;
    }
    if (!allLines.length) {
      onShowToast("This invoice has no billable items.", "error");
      return false;
    }
    if (duplicateInvoice && !confirm(`Invoice number ${invoiceNumber} already exists. Continue anyway?`)) return false;
    return true;
  };

  const handleSave = async () => {
    if (!ensureInvoiceReady()) return;
    const client = await persistClientDetails(false);
    if (!client) return;
    const inv = makeInvoice();
    onSave(inv);
    onShowToast(`Invoice ${inv.invoiceNumber} saved`);
  };

  const downloadPdf = async () => {
    if (!ensureInvoiceReady()) return;
    const client = await persistClientDetails(false);
    if (!client) return;
    try {
      await downloadInvoicePdf(makeInvoice(), profile);
      onShowToast("Invoice PDF downloaded");
    } catch {
      onShowToast("Invoice PDF could not be generated. Please try again.", "error");
    }
  };

  const printCurrentInvoice = async () => {
    if (!ensureInvoiceReady()) return;
    const client = await persistClientDetails(false);
    if (!client) return;
    printInvoice(makeInvoice(), profile);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Invoice Review"
        description={`${timesheet.productionName || "Not set"} · ${timesheet.timesheetNumber || "Not set"}`}
        secondaryActions={<Btn variant="secondary" size="sm" onClick={onBack}>{"\u2190"} Back to Timesheets</Btn>}
        actions={<>
          <Btn variant="secondary" onClick={downloadPdf}><FileText size={14}/> Download PDF</Btn>
          <Btn variant="secondary" onClick={printCurrentInvoice}><FileText size={14}/> Print Invoice</Btn>
          <Btn variant="success" onClick={handleSave}><Save size={14}/> Save Invoice</Btn>
        </>}
      />

      {clientIncomplete && (
        <Card className="border-amber-200 bg-amber-50 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="font-bold text-amber-950">Invoice cannot be finalised</p>
              <p className="mt-1 text-sm text-amber-900">The following billing details are missing for {clientName(clientDraft) || "this client"}:</p>
              <ul className="mt-2 list-disc pl-5 text-sm text-amber-900">
                {clientBillingMissingLabels(Object.keys(clientErrors).length ? clientErrors : clientBillingErrors(clientDraft)).map(label => <li key={label}>{label}</li>)}
              </ul>
            </div>
            <div className="flex flex-wrap gap-2 sm:justify-end">
              <Btn variant="secondary" onClick={() => focusClientBilling()}>Edit Client Billing Details</Btn>
            </div>
          </div>
        </Card>
      )}
      {duplicateInvoice && (
        <AlertBox type="warning">Invoice number {invoiceNumber || "Not set"} already exists. You can override it, but double-check before saving or exporting.</AlertBox>
      )}
      {poMissing && (
        <AlertBox type="warning">This client requires a PO number before finalising or exporting this invoice.</AlertBox>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          <Card id="invoice-client-billing-panel" className="p-5 sm:p-6">
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <div>
                <p className="text-xs font-bold text-gray-300 uppercase tracking-wider mb-2">From</p>
                {profile.businessLogoDataUrl && (
                  <img src={profile.businessLogoDataUrl} alt="Business logo" className="mb-4 max-h-20 max-w-[220px] object-contain" />
                )}
                <p className="font-semibold">{profile.companyName || profile.fullName || "Not set"}</p>
                <p className="text-sm text-gray-500">{profile.fullName || "Not set"}</p>
                <p className="text-sm text-gray-500">{profile.role || "Not set"}</p>
                <p className="text-sm text-gray-500">{profile.email || "Not set"}</p>
                <p className="text-sm text-gray-500 whitespace-pre-line">{profile.address || "Not set"}</p>
                {profile.vatRegistered && profile.vatNumber && <p className="text-sm text-gray-500">VAT / Tax: {profile.vatNumber}</p>}
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-bold text-gray-300 uppercase tracking-wider">Bill To</p>
                  <Btn variant="secondary" size="xs" onClick={saveClientDetails}><Save size={12}/> Save Client Details</Btn>
                </div>
                <ClientFields client={clientDraft} onChange={setClientDraft} errors={Object.keys(clientErrors).length ? clientErrors : (clientIncomplete ? clientBillingErrors(clientDraft) : {})} fieldPrefix="invoice-client" />
              </div>
            </div>
          </Card>

          <Card id="invoice-details-panel" className="p-5 sm:p-6">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">Invoice Details</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Inp label="Invoice Number" value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} />
              <Inp id="invoice-po-number" label="PO Number" value={poNumber} onChange={e => setPoNumber(e.target.value)} placeholder={clientDraft.poRequired ? "Required by client" : "Optional"} required={clientDraft.poRequired} error={poMissing ? "This client requires a purchase order number before the invoice can be finalised." : undefined} />
              <Inp label="Issue Date" type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)} />
              <Inp label="Due Date" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
              <SInp label="Status" value={status} onChange={e => changeReviewStatus(e.target.value as InvoiceStatus)}>
                {(Object.entries(INVOICE_STATUS) as [InvoiceStatus, { label: string; color: string }][]).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </SInp>
              <Inp label="Production / Project" value={timesheet.productionName || "Not set"} readOnly />
              <Inp label="Timesheet Reference" value={timesheet.timesheetNumber || "Not set"} readOnly />
              <Inp label="Timesheet Dates" value={timesheetDateRange(timesheet)} readOnly />
              <Inp label="Paid Amount" type="number" min="0" value={paidAmountStr} onChange={e => setPaidAmountStr(e.target.value)} placeholder="0.00" />
              <Inp label="Paid Date" type="date" value={paidDate} onChange={e => setPaidDate(e.target.value)} />
            </div>
            <div className="mt-3 text-sm text-gray-500">Balance due: <strong className="text-gray-900">{fmtMoney(balanceDue, cur)}</strong></div>
          </Card>

          <Card className="p-5 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Timesheet Items</p>
                <p className="text-xs text-gray-400">From {timesheet.timesheetNumber || "Not set"}</p>
              </div>
              <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden">
                {([
                  ["summary", "Summary"],
                  ["detailed", "Detailed"],
                  ["summary_timesheet", "Summary + Timesheet"],
                ] as [InvoiceDetailMode, string][]).map(([mode, label]) => (
                  <button key={mode} onClick={() => setDetailMode(mode)} className={`px-3 py-1.5 text-xs font-semibold ${detailMode === mode ? "bg-blue-600 text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}>{label}</button>
                ))}
              </div>
            </div>
            <div className="space-y-0">
              {baseLines.map(l => (
                <div key={l.id} className="grid grid-cols-12 gap-2 py-2.5 border-b border-gray-100">
                  <div className="col-span-7 text-sm text-gray-700">{l.description}</div>
                  <div className="col-span-2 text-sm text-right text-gray-400 tabular-nums">{l.quantity > 1 ? `${Number(l.quantity).toFixed(l.quantity % 1 ? 2 : 0)} ×` : ""}</div>
                  <div className="col-span-3 text-sm text-right font-medium tabular-nums">{fmtMoney(l.amount, cur)}</div>
                </div>
              ))}
            </div>
            {sum.calcs.length > 0 && (
              <div className="mt-4 border-t border-slate-100 pt-4">
                <button type="button" onClick={() => setShowDayBreakdowns(v => !v)} className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50 ${UI.focus}`}>
                  {showDayBreakdowns ? <ChevronUp size={15}/> : <ChevronDown size={15}/>}
                  {showDayBreakdowns ? "Hide day calculations" : "Inspect day calculations"}
                </button>
                {showDayBreakdowns && (
                  <div className="mt-3 space-y-3">
                    {sum.calcs.map(({ entry, c }) => (
                      <CalculationBreakdown key={entry.id} entry={entry} profile={effectiveProfile} turnaround={c.turnaround} title={`${fmtDate(entry.date)} · ${fmtMoney(c.totalWithPenalty, cur)}`} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </Card>

          {detailMode === "summary_timesheet" && (
            <Card className="p-5 sm:p-6">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Attached Timesheet Breakdown</p>
              <p className="text-xs text-gray-400 mb-4">This will be included after the invoice summary in the PDF.</p>
              <div className="space-y-0">
                {timesheetBreakdown.map(l => (
                  <div key={l.id} className="grid grid-cols-12 gap-2 py-2.5 border-b border-gray-100">
                    <div className="col-span-7 text-sm text-gray-700">{l.description}</div>
                    <div className="col-span-2 text-sm text-right text-gray-400 tabular-nums">{l.quantity > 1 ? `${Number(l.quantity).toFixed(l.quantity % 1 ? 2 : 0)} ×` : ""}</div>
                    <div className="col-span-3 text-sm text-right font-medium tabular-nums">{fmtMoney(l.amount, cur)}</div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <Card className="p-5 sm:p-6">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">Additional Items</p>
            {extras.length > 0 && (
              <div className="mb-4 space-y-0">
                {extras.map(l => (
                  <div key={l.id} className="grid grid-cols-12 gap-2 py-2.5 border-b border-gray-100 items-end">
                    <div className="col-span-12 sm:col-span-4"><Inp label="Description" value={l.description} onChange={e => updateExtra(l.id, { description: e.target.value })} /></div>
                    <div className="col-span-4 sm:col-span-2"><Inp label="Qty" type="number" min="0" value={l.quantity} onChange={e => updateExtra(l.id, { quantity: num(e.target.value, 1) })} /></div>
                    <div className="col-span-4 sm:col-span-2"><Inp label={`Unit (${sym})`} type="number" min="0" value={l.unitPrice} onChange={e => updateExtra(l.id, { unitPrice: num(e.target.value, 0) })} /></div>
                    <label className="col-span-4 sm:col-span-1 flex items-center gap-2 text-sm text-gray-600 pb-2">
                      <input type="checkbox" checked={l.taxable !== false} onChange={e => updateExtra(l.id, { taxable: e.target.checked })} className="w-4 h-4 rounded border-gray-300 text-blue-600" />
                      VAT
                    </label>
                    <div className="col-span-10 sm:col-span-2 text-sm text-right font-medium tabular-nums pb-2">{fmtMoney(l.amount, cur)}</div>
                    <div className="col-span-1 flex justify-end"><IconButton label={`Remove ${l.description}`} variant="danger" onClick={() => removeExtra(l.id)}><Trash2 size={14}/></IconButton></div>
                  </div>
                ))}
              </div>
            )}
            <div className="grid grid-cols-12 gap-2 items-end border-t border-gray-100 pt-4">
              <div className="col-span-4"><Inp placeholder="Description (parking, prep day, mileage)" value={newItem.description} onChange={e => setNewItem(p => ({ ...p, description: e.target.value }))} onKeyDown={(e: React.KeyboardEvent) => e.key === "Enter" && addExtra()} /></div>
              <div className="col-span-2"><Inp placeholder="Qty" type="number" value={newItem.quantity} onChange={e => setNewItem(p => ({ ...p, quantity: e.target.value }))} /></div>
              <div className="col-span-2"><Inp placeholder={`Unit price (${sym})`} type="number" value={newItem.unitPrice} onChange={e => setNewItem(p => ({ ...p, unitPrice: e.target.value }))} onKeyDown={(e: React.KeyboardEvent) => e.key === "Enter" && addExtra()} /></div>
              <label className="col-span-2 flex items-center gap-2 text-sm text-gray-600 pb-2">
                <input type="checkbox" checked={newItem.taxable} onChange={e => setNewItem(p => ({ ...p, taxable: e.target.checked }))} className="w-4 h-4 rounded border-gray-300 text-blue-600" />
                VAT
              </label>
              <div className="col-span-2"><Btn variant="primary" className="w-full justify-center" onClick={addExtra}><Plus size={14}/> Add</Btn></div>
            </div>
          </Card>

          <Card className="p-5 space-y-4">
            <TxInp label="Payment Terms" rows={2} value={paymentTerms} onChange={e => setPaymentTerms(e.target.value)} placeholder="e.g. Payment due within 30 days" />
            <TxInp label="Invoice Notes" rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional note for the client" />
          </Card>
        </div>

        <div>
          <Card className="p-5 sticky top-5">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Invoice Total</p>
            <div className="space-y-0.5">
              {allLines.map(l => <SRow key={l.id} label={l.description.length > 28 ? l.description.slice(0, 28) + "…" : l.description} value={fmtMoney(l.amount, cur)} indent={l.isExtra} />)}
              <div className="border-t border-gray-200 pt-2 mt-1"><SRow label="Subtotal" value={fmtMoney(subtotal, cur)} /></div>
              {vatPct > 0 && taxableSubtotal !== subtotal && <SRow label="VAT-able subtotal" value={fmtMoney(taxableSubtotal, cur)} />}
              {vatPct > 0 && <SRow label={`VAT (${vatPct}%)`} value={fmtMoney(vatAmt, cur)} />}
              <div className="border-t-2 border-gray-900 pt-2.5 mt-1 flex justify-between">
                <span className="font-bold text-gray-900">TOTAL DUE</span>
                <span className="font-bold text-lg tabular-nums">{fmtMoney(total, cur)}</span>
              </div>
              {paidAmount > 0 && <SRow label="Paid" value={fmtMoney(paidAmount, cur)} />}
              {paidAmount > 0 && <SRow label="Balance Due" value={fmtMoney(balanceDue, cur)} bold />}
            </div>
            <div className="mt-5 space-y-2">
              <Btn variant="success" className="w-full justify-center" onClick={handleSave}><Save size={14}/> Save Invoice</Btn>
              <Btn variant="secondary" className="w-full justify-center" onClick={downloadPdf}><FileText size={14}/> Download PDF</Btn>
              <Btn variant="secondary" className="w-full justify-center" onClick={printCurrentInvoice}><FileText size={14}/> Print Invoice</Btn>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function InvoiceEditScreen({ invoice, sourceTimesheet, profile, clients, invoices, onSaveClients, onSave, onCancel, onShowToast }: {
  invoice: Invoice;
  sourceTimesheet?: Timesheet | null;
  profile: Profile;
  clients: Client[];
  invoices: Invoice[];
  onSaveClients: (clients: Client[]) => void | Promise<void>;
  onSave: (invoice: Invoice) => void;
  onCancel: () => void;
  onShowToast: (msg: string, type?: ToastType) => void;
}) {
  const sourceProfile = useMemo(() => sourceTimesheet ? profileForTimesheet(profile, sourceTimesheet) : profile, [profile, sourceTimesheet]);
  const sourceSummary = useMemo(() => sourceTimesheet ? calcSummary(sourceTimesheet.entries || [], sourceProfile) : null, [sourceTimesheet, sourceProfile]);
  const initialDetailMode = (invoice.detailMode || "summary") as InvoiceDetailMode;
  const initialClient = clients.find(c => c.id === invoice.clientId) || invoice.client || blankClient({ id: invoice.clientId || uid(), companyName: invoice.clientName || "" });
  const initialGenerated = () => {
    const storedGenerated = invoiceGeneratedLines(invoice.lineItems || []).map(withInvoiceLineAmount);
    return storedGenerated.length ? storedGenerated : sourceSummary ? buildTimesheetLines(sourceSummary, initialDetailMode).map(withInvoiceLineAmount) : [];
  };
  const buildGeneratedForMode = (mode: InvoiceDetailMode) => sourceSummary ? buildTimesheetLines(sourceSummary, mode).map(withInvoiceLineAmount) : invoiceGeneratedLines(invoice.lineItems || []).map(withInvoiceLineAmount);

  const [invoiceNumber, setInvoiceNumber] = useState(invoice.invoiceNumber || "");
  const [poNumber, setPoNumber] = useState(invoice.poNumber || "");
  const [issueDate, setIssueDate] = useState(invoice.issueDate || todayStr());
  const [dueDate, setDueDate] = useState(invoice.dueDate || "");
  const [status, setStatus] = useState<InvoiceStatus>(normalizeInvoiceStatus(invoice.status));
  const [detailMode, setDetailMode] = useState<InvoiceDetailMode>(initialDetailMode);
  const [clientDraft, setClientDraft] = useState<Client>(() => normalizeClient(initialClient));
  const [clientErrors, setClientErrors] = useState<Partial<Record<keyof Client, string>>>({});
  const [generatedLines, setGeneratedLines] = useState<InvoiceLine[]>(initialGenerated);
  const [extras, setExtras] = useState<InvoiceLine[]>(() => invoiceManualLines(invoice.lineItems || []).map(withInvoiceLineAmount));
  const [newItem, setNewItem] = useState({ description: "", quantity: "1", unitPrice: "", taxable: true });
  const [paymentTerms, setPaymentTerms] = useState(invoice.paymentTerms || invoice.paymentNotes || profile.paymentTerms || "");
  const [notes, setNotes] = useState(invoice.notes || "");
  const [paidAmountStr, setPaidAmountStr] = useState(String(invoice.paidAmount || ""));
  const [paidDate, setPaidDate] = useState(invoice.paidDate || "");

  const cur = invoice.currency || sourceTimesheet?.currency || sourceProfile.defaultCurrency || profile.defaultCurrency || "ZAR";
  const sym = { ZAR: "R", USD: "$", GBP: "£", EUR: "€" }[cur] || "R";
  const vatPct = profile.vatRegistered ? (sourceSummary ? sourceSummary.vatPct : invoice.vat) : 0;
  const normalizedGeneratedLines = generatedLines.map(withInvoiceLineAmount);
  const normalizedExtras = extras.map(withInvoiceLineAmount);
  const generatedMatchesSource = Boolean(sourceSummary) && JSON.stringify(comparableInvoiceLines(normalizedGeneratedLines)) === JSON.stringify(comparableInvoiceLines(buildGeneratedForMode(detailMode).map(withInvoiceLineAmount)));
  const allLines = [...normalizedGeneratedLines, ...normalizedExtras];
  const generatedSubtotal = normalizedGeneratedLines.reduce((s, l) => s + safe(l.amount, 0), 0);
  const generatedTaxableSubtotal = normalizedGeneratedLines.reduce((s, l) => s + (l.taxable === false ? 0 : safe(l.amount, 0)), 0);
  const extrasSubtotal = normalizedExtras.reduce((s, l) => s + safe(l.amount, 0), 0);
  const extrasTaxableSubtotal = normalizedExtras.reduce((s, l) => s + (l.taxable === false ? 0 : safe(l.amount, 0)), 0);
  const generatedVatAmount = profile.vatRegistered ? (sourceSummary && generatedMatchesSource ? sourceSummary.vatAmt : generatedTaxableSubtotal * (vatPct / 100)) : 0;
  const extrasVatAmount = profile.vatRegistered ? extrasTaxableSubtotal * (vatPct / 100) : 0;
  const subtotal = generatedSubtotal + extrasSubtotal;
  const vatAmount = generatedVatAmount + extrasVatAmount;
  const total = subtotal + vatAmount;
  const paidAmount = Math.min(safe(paidAmountStr, 0), total);
  const totals = { lines: allLines, subtotal, taxableSubtotal: generatedTaxableSubtotal + extrasTaxableSubtotal, vatAmount, total, paidAmount, balanceDue: Math.max(total - paidAmount, 0) };
  const poMissing = clientDraft.poRequired && !poNumber.trim();
  const clientIncomplete = !clientBillingComplete(clientDraft);
  const protectedStatus = normalizeInvoiceStatus(invoice.status) !== "draft";

  const focusClientBilling = (errors = clientBillingErrors(clientDraft)) => {
    setClientErrors(errors);
    document.getElementById("edit-invoice-client-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
    const first = firstClientBillingErrorField(errors);
    setTimeout(() => first && document.getElementById(`edit-invoice-client-${first}`)?.focus(), 120);
  };

  const generatedLinesWereEdited = () => !generatedMatchesSource;

  const changeDetailMode = (mode: InvoiceDetailMode) => {
    if (mode === detailMode) return;
    if (!sourceSummary) {
      onShowToast("The source timesheet is not available, so generated invoice lines cannot be rebuilt.", "error");
      return;
    }
    if (generatedLinesWereEdited() && !confirm("Changing the invoice detail level will rebuild the timesheet-generated line items. Your manually added invoice extras will be preserved.")) return;
    setDetailMode(mode);
    setGeneratedLines(buildGeneratedForMode(mode));
  };

  const updateGeneratedLine = (id: string, patch: Partial<InvoiceLine>) =>
    setGeneratedLines(p => p.map(line => line.id === id ? withInvoiceLineAmount({ ...line, ...patch }) : line));

  const updateExtra = (id: string, patch: Partial<InvoiceLine>) =>
    setExtras(p => p.map(line => line.id === id ? withInvoiceLineAmount({ ...line, ...patch }) : line));

  const removeExtra = (id: string) => setExtras(p => p.filter(line => line.id !== id));

  const addExtra = () => {
    const desc = newItem.description.trim();
    const qty = num(newItem.quantity, 1);
    const unitPrice = num(newItem.unitPrice, 0);
    if (!desc) { onShowToast("Expense description is required.", "error"); return; }
    if (qty <= 0) { onShowToast("Expense quantity must be greater than zero.", "error"); return; }
    if (unitPrice <= 0) { onShowToast("Expense amount must be greater than zero.", "error"); return; }
    const normalizedDesc = desc.toLowerCase();
    const duplicateGeneratedExpense = generatedLines.some(l => l.category === "expenses" && l.description.toLowerCase().includes(normalizedDesc));
    const duplicateManualExpense = extras.some(l => l.description.trim().toLowerCase() === normalizedDesc);
    if (duplicateGeneratedExpense || duplicateManualExpense) {
      onShowToast(`${desc} already appears on this invoice. Add a different invoice-level expense to avoid double-counting.`, "error");
      return;
    }
    setExtras(p => [...p, withInvoiceLineAmount({ id: uid(), description: desc, quantity: qty, unitPrice, amount: qty * unitPrice, isExtra: true, taxable: newItem.taxable, category: "additional" })]);
    setNewItem({ description: "", quantity: "1", unitPrice: "", taxable: true });
  };

  const persistClientDetails = async () => {
    const errors = clientBillingErrors(clientDraft);
    if (Object.keys(errors).length) {
      focusClientBilling(errors);
      onShowToast("Complete the highlighted client billing fields.", "error");
      return null;
    }
    const client = normalizeClient(clientDraft);
    const exists = clients.some(c => c.id === client.id);
    try {
      await onSaveClients(exists ? clients.map(c => c.id === client.id ? client : c) : [...clients, client]);
    } catch (err) {
      onShowToast(err instanceof Error ? err.message : "CrewQuote could not save this client to your account.", "error");
      return null;
    }
    setClientDraft(client);
    setClientErrors({});
    if (client.paymentTerms || client.defaultPaymentTerms) setPaymentTerms(client.paymentTerms || client.defaultPaymentTerms);
    onShowToast("Client billing details saved");
    return client;
  };

  const makeEditedInvoice = (): Invoice => {
    const nextStatus = normalizeInvoiceStatus(status);
    return normalizeInvoice({
      ...invoice,
      invoiceNumber,
      poNumber,
      issueDate,
      dueDate,
      clientId: clientDraft.id,
      clientName: clientName(clientDraft),
      client: clientDraft,
      crewName: invoice.crewName || profile.fullName || "",
      role: invoice.role || sourceTimesheet?.role || profile.role || "",
      companyName: invoice.companyName || profile.companyName || profile.fullName || "",
      sellerLogoDataUrl: nextStatus === "draft" ? (invoice.sellerLogoDataUrl || profile.businessLogoDataUrl || "") : (profile.businessLogoDataUrl || invoice.sellerLogoDataUrl || ""),
      sellerSnapshot: nextStatus === "draft" ? invoice.sellerSnapshot : sellerSnapshotFromProfile(profile),
      productionName: invoice.productionName || sourceTimesheet?.productionName || "",
      timesheetNumber: invoice.timesheetNumber || sourceTimesheet?.timesheetNumber || "",
      timesheetDates: sourceTimesheet ? timesheetDateRange(sourceTimesheet) : invoice.timesheetDates,
      detailMode,
      lineItems: totals.lines,
      timesheetBreakdown: detailMode === "summary_timesheet" && sourceSummary ? buildDetailedTimesheetLines(sourceSummary) : invoice.timesheetBreakdown || [],
      subtotal: totals.subtotal,
      vat: vatPct,
      vatAmount: totals.vatAmount,
      total: totals.total,
      paidAmount: totals.paidAmount,
      paidDate,
      balanceDue: totals.balanceDue,
      currency: cur,
      status: nextStatus,
      banking: invoice.banking && Object.keys(invoice.banking).length ? invoice.banking : { accountName: profile.bankAccountName, bankName: profile.bankName, accountNumber: profile.bankAccountNumber, branchCode: profile.bankBranchCode, swift: profile.bankSwift, iban: profile.bankIban, reference: profile.bankReference || invoiceNumber },
      paymentTerms,
      paymentNotes: paymentTerms,
      notes,
    });
  };

  const validateBeforeSave = () => {
    const errors = clientBillingErrors(clientDraft);
    if (Object.keys(errors).length) {
      focusClientBilling(errors);
      onShowToast(`${clientName(clientDraft) || "This client"} is missing required billing details.`, "error");
      return false;
    }
    if (poMissing) {
      document.getElementById("edit-invoice-po-number")?.focus();
      onShowToast("This client requires a PO number. Add it before finalising the invoice.", "error");
      return false;
    }
    if (!allLines.length) {
      onShowToast("This invoice has no billable items.", "error");
      return false;
    }
    if (invoices.some(i => i.id !== invoice.id && i.invoiceNumber === invoiceNumber) && !confirm(`Invoice number ${invoiceNumber || "not set"} already exists. Use it anyway?`)) {
      return false;
    }
    const invalidExtra = extras.find(l => !l.description.trim() || num(l.quantity, 0) <= 0 || num(l.unitPrice, 0) <= 0);
    if (invalidExtra) {
      onShowToast("Expense amount must be greater than zero.", "error");
      return false;
    }
    return true;
  };

  const saveChanges = async () => {
    if (!validateBeforeSave()) return;
    const client = await persistClientDetails();
    if (!client) return;
    const next = makeEditedInvoice();
    onSave(next);
    onShowToast(`Invoice ${next.invoiceNumber} saved`);
  };

  const downloadDraftPdf = async () => {
    if (!validateBeforeSave()) return;
    try {
      await downloadInvoicePdf(makeEditedInvoice(), profile);
      onShowToast("Invoice PDF downloaded");
    } catch {
      onShowToast("Invoice PDF could not be generated. Please try again.", "error");
    }
  };

  const printDraftInvoice = () => {
    if (!validateBeforeSave()) return;
    printInvoice(makeEditedInvoice(), profile);
  };

  const changeEditStatus = (next: InvoiceStatus) => {
    setStatus(next);
    if (next === "paid") {
      setPaidAmountStr(String(totals.total));
      if (!paidDate) setPaidDate(todayStr());
    }
  };

  const currentComparable = JSON.stringify({
    invoiceNumber, poNumber, issueDate, dueDate, status, detailMode, clientDraft,
    generatedLines: comparableInvoiceLines(generatedLines.map(withInvoiceLineAmount)), extras: comparableInvoiceLines(extras.map(withInvoiceLineAmount)),
    paymentTerms, notes, paidAmountStr, paidDate,
  });
  const originalComparable = JSON.stringify({
    invoiceNumber: invoice.invoiceNumber || "", poNumber: invoice.poNumber || "", issueDate: invoice.issueDate || todayStr(), dueDate: invoice.dueDate || "",
    status: normalizeInvoiceStatus(invoice.status), detailMode: initialDetailMode, clientDraft: normalizeClient(initialClient),
    generatedLines: comparableInvoiceLines(initialGenerated()), extras: comparableInvoiceLines(invoiceManualLines(invoice.lineItems || []).map(withInvoiceLineAmount)),
    paymentTerms: invoice.paymentTerms || invoice.paymentNotes || profile.paymentTerms || "", notes: invoice.notes || "", paidAmountStr: String(invoice.paidAmount || ""), paidDate: invoice.paidDate || "",
  });
  const hasUnsaved = currentComparable !== originalComparable;

  if (protectedStatus) {
    const label = INVOICE_STATUS[normalizeInvoiceStatus(invoice.status)].label;
    return (
      <div className="space-y-5">
        <PageHeader title="Edit Invoice" description={`${invoice.invoiceNumber || "Not numbered"} · ${label}`} secondaryActions={<Btn variant="secondary" size="sm" onClick={onCancel}>{"\u2190"} Back to Invoice</Btn>} />
        <AlertBox type="warning">Invoice {invoice.invoiceNumber || "not numbered"} is protected because its status is {label}. Change it back to Draft before editing.</AlertBox>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Edit Invoice"
        description={`${invoice.invoiceNumber || "Not numbered"} · Draft${hasUnsaved ? " · Unsaved changes" : ""}`}
        badge={<Badge color="gray">Draft</Badge>}
        secondaryActions={<Btn variant="secondary" size="sm" onClick={() => { if (!hasUnsaved || confirm("Discard unsaved invoice edits?")) onCancel(); }}>Cancel</Btn>}
        actions={<>
          {hasUnsaved && <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800 ring-1 ring-amber-200">Unsaved changes</span>}
          <Btn variant="secondary" onClick={downloadDraftPdf}><FileText size={14}/> Download PDF</Btn>
          <Btn variant="secondary" onClick={printDraftInvoice}><FileText size={14}/> Print Invoice</Btn>
          <Btn variant="success" onClick={saveChanges}><Save size={14}/> Save Changes</Btn>
        </>}
      />

      {clientIncomplete && (
        <Card className="border-amber-200 bg-amber-50 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="font-bold text-amber-950">Invoice cannot be finalised</p>
              <p className="mt-1 text-sm text-amber-900">The following billing details are missing for {clientName(clientDraft) || "this client"}:</p>
              <ul className="mt-2 list-disc pl-5 text-sm text-amber-900">
                {clientBillingMissingLabels(Object.keys(clientErrors).length ? clientErrors : clientBillingErrors(clientDraft)).map(label => <li key={label}>{label}</li>)}
              </ul>
            </div>
            <Btn variant="secondary" onClick={() => focusClientBilling()}>Edit Client Billing Details</Btn>
          </div>
        </Card>
      )}
      {poMissing && <AlertBox type="warning">This client requires a purchase order number before the invoice can be finalised.</AlertBox>}
      {!sourceSummary && <AlertBox type="warning">The source timesheet is not available. Existing invoice lines can still be edited, but Summary/Detailed regeneration is disabled.</AlertBox>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          <Card id="edit-invoice-client-panel" className="p-5 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Client Billing Details</p>
                <p className="text-xs text-gray-400">Required for invoice finalisation and PDF billing details.</p>
              </div>
              <Btn variant="secondary" size="xs" onClick={persistClientDetails}><Save size={12}/> Save Client Details</Btn>
            </div>
            <ClientFields client={clientDraft} onChange={setClientDraft} errors={Object.keys(clientErrors).length ? clientErrors : (clientIncomplete ? clientBillingErrors(clientDraft) : {})} fieldPrefix="edit-invoice-client" />
          </Card>

          <Card className="p-5 sm:p-6">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">Invoice Details</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Inp label="Invoice Reference" value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} />
              <Inp id="edit-invoice-po-number" label="PO Number" value={poNumber} onChange={e => setPoNumber(e.target.value)} required={clientDraft.poRequired} error={poMissing ? "This client requires a PO number." : undefined} />
              <Inp label="Invoice Date" type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)} />
              <Inp label="Due Date" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
              <SInp label="Status" value={status} onChange={e => changeEditStatus(e.target.value as InvoiceStatus)}>
                {(Object.entries(INVOICE_STATUS) as [InvoiceStatus, { label: string; color: string }][]).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </SInp>
              <SInp label="Invoice Detail Level" value={detailMode} onChange={e => changeDetailMode(e.target.value as InvoiceDetailMode)}>
                <option value="summary">Summary</option>
                <option value="detailed">Detailed</option>
                <option value="summary_timesheet">Summary + Attached Timesheet</option>
              </SInp>
              <Inp label="Paid Amount" type="number" min="0" value={paidAmountStr} onChange={e => setPaidAmountStr(e.target.value)} />
              <Inp label="Paid Date" type="date" value={paidDate} onChange={e => setPaidDate(e.target.value)} />
            </div>
          </Card>

          <Card className="p-5 sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Timesheet-generated items</p>
                <p className="text-xs text-gray-400">These come from the source timesheet. Switching detail level rebuilds only these rows.</p>
              </div>
              <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden">
                {(["summary", "detailed"] as InvoiceDetailMode[]).map(mode => (
                  <button key={mode} type="button" onClick={() => changeDetailMode(mode)} className={`px-3 py-1.5 text-xs font-semibold ${detailMode === mode ? "bg-blue-600 text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}>{mode === "summary" ? "Summary" : "Detailed"}</button>
                ))}
              </div>
            </div>
            <div className="space-y-0">
              {generatedLines.length === 0 ? (
                <p className="py-6 text-sm text-slate-400">No timesheet-generated line items.</p>
              ) : generatedLines.map(line => (
                <div key={line.id} className="grid grid-cols-12 gap-2 py-2.5 border-b border-gray-100 items-end">
                  <div className="col-span-12 sm:col-span-5"><Inp label="Description" value={line.description} onChange={e => updateGeneratedLine(line.id, { description: e.target.value })} /></div>
                  <div className="col-span-4 sm:col-span-2"><Inp label="Qty" type="number" min="0" value={line.quantity} onChange={e => updateGeneratedLine(line.id, { quantity: num(e.target.value, 1) })} /></div>
                  <div className="col-span-4 sm:col-span-2"><Inp label={`Unit (${sym})`} type="number" min="0" value={line.unitPrice} onChange={e => updateGeneratedLine(line.id, { unitPrice: num(e.target.value, 0) })} /></div>
                  <label className="col-span-4 sm:col-span-1 flex items-center gap-2 text-sm text-gray-600 pb-2">
                    <input type="checkbox" checked={line.taxable !== false} onChange={e => updateGeneratedLine(line.id, { taxable: e.target.checked })} className="w-4 h-4 rounded border-gray-300 text-blue-600" />
                    VAT
                  </label>
                  <div className="col-span-12 sm:col-span-2 text-sm text-right font-medium tabular-nums pb-2">{fmtMoney(line.amount, cur)}</div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-5 sm:p-6">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">Manual invoice expenses</p>
            {extras.length > 0 && (
              <div className="mb-4 space-y-0">
                {extras.map(line => (
                  <div key={line.id} className="grid grid-cols-12 gap-2 py-2.5 border-b border-gray-100 items-end">
                    <div className="col-span-12 sm:col-span-4"><Inp label="Description" value={line.description} onChange={e => updateExtra(line.id, { description: e.target.value })} /></div>
                    <div className="col-span-4 sm:col-span-2"><Inp label="Qty" type="number" min="0" value={line.quantity} onChange={e => updateExtra(line.id, { quantity: num(e.target.value, 1) })} /></div>
                    <div className="col-span-4 sm:col-span-2"><Inp label={`Unit (${sym})`} type="number" min="0" value={line.unitPrice} onChange={e => updateExtra(line.id, { unitPrice: num(e.target.value, 0) })} /></div>
                    <label className="col-span-4 sm:col-span-1 flex items-center gap-2 text-sm text-gray-600 pb-2">
                      <input type="checkbox" checked={line.taxable !== false} onChange={e => updateExtra(line.id, { taxable: e.target.checked })} className="w-4 h-4 rounded border-gray-300 text-blue-600" />
                      VAT
                    </label>
                    <div className="col-span-10 sm:col-span-2 text-sm text-right font-medium tabular-nums pb-2">{fmtMoney(line.amount, cur)}</div>
                    <div className="col-span-1 flex justify-end"><IconButton label={`Remove ${line.description}`} variant="danger" onClick={() => removeExtra(line.id)}><Trash2 size={14}/></IconButton></div>
                  </div>
                ))}
              </div>
            )}
            <div className="grid grid-cols-12 gap-2 items-end border-t border-gray-100 pt-4">
              <div className="col-span-12 sm:col-span-4"><Inp label="Description" placeholder="Tolls, mileage, accommodation" value={newItem.description} onChange={e => setNewItem(p => ({ ...p, description: e.target.value }))} /></div>
              <div className="col-span-4 sm:col-span-2"><Inp label="Qty" type="number" min="0" value={newItem.quantity} onChange={e => setNewItem(p => ({ ...p, quantity: e.target.value }))} /></div>
              <div className="col-span-4 sm:col-span-2"><Inp label={`Unit (${sym})`} type="number" min="0" value={newItem.unitPrice} onChange={e => setNewItem(p => ({ ...p, unitPrice: e.target.value }))} /></div>
              <label className="col-span-4 sm:col-span-2 flex items-center gap-2 text-sm text-gray-600 pb-2">
                <input type="checkbox" checked={newItem.taxable} onChange={e => setNewItem(p => ({ ...p, taxable: e.target.checked }))} className="w-4 h-4 rounded border-gray-300 text-blue-600" />
                VAT
              </label>
              <div className="col-span-12 sm:col-span-2"><Btn className="w-full justify-center" onClick={addExtra}><Plus size={14}/> Add</Btn></div>
            </div>
          </Card>

          <Card className="p-5 space-y-4">
            <TxInp label="Payment Terms" rows={2} value={paymentTerms} onChange={e => setPaymentTerms(e.target.value)} />
            <TxInp label="Notes" rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
          </Card>
        </div>

        <div>
          <Card className="p-5 sticky top-5">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Live invoice total</p>
            <div className="space-y-0.5">
              <SRow label="Timesheet-generated" value={fmtMoney(generatedSubtotal, cur)} />
              {extras.length > 0 && <SRow label="Manual invoice expenses" value={fmtMoney(extrasSubtotal, cur)} />}
              <div className="border-t border-gray-200 pt-2 mt-1"><SRow label="Subtotal" value={fmtMoney(totals.subtotal, cur)} /></div>
              {vatPct > 0 && totals.taxableSubtotal !== totals.subtotal && <SRow label="VAT-able subtotal" value={fmtMoney(totals.taxableSubtotal, cur)} />}
              {vatPct > 0 && <SRow label={`VAT (${vatPct}%)`} value={fmtMoney(totals.vatAmount, cur)} />}
              <div className="border-t-2 border-gray-900 pt-2.5 mt-1 flex justify-between">
                <span className="font-bold text-gray-900">TOTAL DUE</span>
                <span className="font-bold text-lg tabular-nums">{fmtMoney(totals.total, cur)}</span>
              </div>
              {totals.paidAmount > 0 && <SRow label="Paid" value={fmtMoney(totals.paidAmount, cur)} />}
              {totals.paidAmount > 0 && <SRow label="Balance Due" value={fmtMoney(totals.balanceDue, cur)} bold />}
            </div>
            <div className="mt-5 space-y-2">
              <Btn variant="success" className="w-full justify-center" onClick={saveChanges}><Save size={14}/> Save Changes</Btn>
              <Btn variant="secondary" className="w-full justify-center" onClick={downloadDraftPdf}><FileText size={14}/> Download PDF</Btn>
              <Btn variant="secondary" className="w-full justify-center" onClick={printDraftInvoice}><FileText size={14}/> Print Invoice</Btn>
              <Btn variant="ghost" className="w-full justify-center" onClick={() => { if (!hasUnsaved || confirm("Discard unsaved invoice edits?")) onCancel(); }}>Cancel</Btn>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// PDF DOWNLOAD / PRINT
// ═══════════════════════════════════════════════════════════════════════════

type InvoicePdfLogo = { data: string; width: number; height: number };

const PDF_PAGE_WIDTH = 595.28;
const PDF_PAGE_HEIGHT = 841.89;
const PDF_MARGIN = 42;

const filenamePart = (value: unknown) => {
  const cleaned = String(value || "")
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._ -]+/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[.-]+|[.-]+$/g, "")
    .slice(0, 90);
  return cleaned;
};

const invoicePdfFilename = (inv: Invoice) => {
  const number = filenamePart(inv.invoiceNumber || "Invoice");
  const name = filenamePart(inv.clientName || inv.productionName || "CrewQuote");
  return ["CrewQuote", number, name].filter(Boolean).join("-") + ".pdf";
};

const base64ToBinary = (base64: string) => atob(base64.replace(/\s/g, ""));

async function logoDataUrlToJpeg(dataUrl: string): Promise<InvoicePdfLogo | null> {
  if (!dataUrl || !/^data:image\//.test(dataUrl)) return null;
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      try {
        const maxW = 240;
        const maxH = 92;
        const naturalW = img.naturalWidth || img.width;
        const naturalH = img.naturalHeight || img.height;
        if (!naturalW || !naturalH) { resolve(null); return; }
        const scale = Math.min(1, maxW / naturalW, maxH / naturalH);
        const width = Math.max(1, Math.round(naturalW * scale));
        const height = Math.max(1, Math.round(naturalH * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) { resolve(null); return; }
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        const jpeg = canvas.toDataURL("image/jpeg", 0.88);
        resolve({ data: base64ToBinary(jpeg.split(",")[1] || ""), width, height });
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

function pdfCharBytes(value: unknown): number[] {
  const replacements: Record<string, string> = {
    "\u2013": "-",
    "\u2014": "-",
    "\u2018": "'",
    "\u2019": "'",
    "\u201c": '"',
    "\u201d": '"',
    "\u2022": "-",
    "\u00a0": " ",
    "\u2122": "TM",
    "\u00d7": "x",
  };
  const bytes: number[] = [];
  const pushChar = (ch: string) => {
    if (ch === "\u20ac") { bytes.push(128); return; }
    const code = ch.charCodeAt(0);
    if (code >= 32 && code <= 126) { bytes.push(code); return; }
    if (code >= 160 && code <= 255) { bytes.push(code); return; }
    const folded = ch.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
    if (folded && folded !== ch) {
      for (const f of folded) pushChar(f);
      return;
    }
    bytes.push(63);
  };
  for (const ch of String(value ?? "")) {
    const replacement = replacements[ch];
    if (replacement) {
      for (const r of replacement) pushChar(r);
    } else {
      pushChar(ch);
    }
  }
  return bytes;
}

function pdfEscapeText(value: unknown) {
  return pdfCharBytes(value).map(byte => {
    if (byte === 40 || byte === 41 || byte === 92) return "\\" + String.fromCharCode(byte);
    if (byte < 32 || byte > 126) return "\\" + byte.toString(8).padStart(3, "0");
    return String.fromCharCode(byte);
  }).join("");
}

const pdfTextWidth = (value: unknown, size: number) => pdfCharBytes(value).length * size * 0.48;

function wrapPdfText(value: unknown, maxWidth: number, size: number) {
  const lines: string[] = [];
  String(value ?? "").split(/\r?\n/).forEach(part => {
    const words = part.split(/\s+/).filter(Boolean);
    if (!words.length) { lines.push(""); return; }
    let line = "";
    words.forEach(word => {
      const candidate = line ? `${line} ${word}` : word;
      if (pdfTextWidth(candidate, size) <= maxWidth || !line) {
        line = candidate;
      } else {
        lines.push(line);
        line = word;
      }
    });
    if (line) lines.push(line);
  });
  return lines;
}

function pdfBlobFromPages(pages: string[], logo: InvoicePdfLogo | null) {
  const objects: string[] = [];
  const catalogId = 1;
  const pagesId = 2;
  const fontId = 3;
  const boldFontId = 4;
  const logoId = logo ? 5 : 0;
  let nextId = logo ? 6 : 5;
  const pageRefs: number[] = [];
  const contentRefs: number[] = [];

  pages.forEach(() => {
    pageRefs.push(nextId++);
    contentRefs.push(nextId++);
  });

  objects[catalogId] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objects[fontId] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
  objects[boldFontId] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";
  if (logo && logoId) {
    objects[logoId] = `<< /Type /XObject /Subtype /Image /Width ${logo.width} /Height ${logo.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${logo.data.length} >>\nstream\n${logo.data}\nendstream`;
  }

  pages.forEach((stream, index) => {
    const resources = `/Font << /F1 ${fontId} 0 R /F2 ${boldFontId} 0 R >>${logo ? ` /XObject << /Im1 ${logoId} 0 R >>` : ""}`;
    objects[pageRefs[index]] = `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PDF_PAGE_WIDTH} ${PDF_PAGE_HEIGHT}] /Resources << ${resources} >> /Contents ${contentRefs[index]} 0 R >>`;
    objects[contentRefs[index]] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  });

  objects[pagesId] = `<< /Type /Pages /Kids [${pageRefs.map(id => `${id} 0 R`).join(" ")}] /Count ${pageRefs.length} >>`;

  let pdf = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
  const offsets: number[] = [0];
  for (let id = 1; id < objects.length; id++) {
    offsets[id] = pdf.length;
    pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id++) {
    pdf += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length} /Root ${catalogId} 0 R >>\nstartxref\n${xref}\n%%EOF`;

  const bytes = new Uint8Array(pdf.length);
  for (let i = 0; i < pdf.length; i++) bytes[i] = pdf.charCodeAt(i) & 0xff;
  return new Blob([bytes], { type: "application/pdf" });
}

function buildInvoicePdfBlob(inv: Invoice, profile: Profile, logo: InvoicePdfLogo | null) {
  const sellerProfile = sellerProfileForInvoice(inv, profile);
  const client = invoiceClient(inv);
  const bd = inv.banking || {};
  const bankRows: [string, string][] = [
    ["Account Holder", bd.accountName || ""],
    ["Bank", bd.bankName || ""],
    ["Account No.", bd.accountNumber || ""],
    ["Branch", bd.branchCode || ""],
  ].filter(([, v]) => Boolean(v)) as [string, string][];
  if (bd.swift) bankRows.push(["SWIFT", bd.swift]);
  if (bd.iban) bankRows.push(["IBAN", bd.iban]);
  if (bd.reference) bankRows.push(["Reference", bd.reference]);

  const sellerRows = ([sellerProfile.fullName, sellerProfile.role, sellerProfile.email, sellerProfile.phone, sellerProfile.address, sellerProfile.vatRegistered && sellerProfile.vatNumber && `VAT / Tax: ${sellerProfile.vatNumber}`] as string[]).filter(Boolean);
  const clientRows = ([client?.contactPerson, client?.accountsEmail || client?.email, client?.phone, client?.billingAddress, client?.vendorNumber && `Vendor: ${client.vendorNumber}`, client?.vatNumber && `VAT: ${client.vatNumber}`] as string[]).filter(Boolean);
  const paymentTerms = inv.paymentTerms || inv.paymentNotes || sellerProfile.paymentTerms || "";
  const paidAmount = safe(inv.paidAmount, 0);
  const balanceDue = invoiceBalance(inv);
  const invoiceLabel = sellerProfile.vatRegistered ? (sellerProfile.invoiceLabel || "Tax Invoice") : (sellerProfile.invoiceLabel || "Invoice");
  const m = (n: unknown) => fmtMoney(n, inv.currency);
  const qty = (n: unknown) => {
    const value = safe(n, 0);
    return value ? value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : "";
  };

  const pages: string[] = [];
  let ops: string[] = [];
  let y = PDF_PAGE_HEIGHT - PDF_MARGIN;
  const left = PDF_MARGIN;
  const right = PDF_PAGE_WIDTH - PDF_MARGIN;

  const push = (cmd: string) => ops.push(cmd);
  const startPage = (continued = false) => {
    if (ops.length) pages.push(ops.join("\n"));
    ops = [];
    y = PDF_PAGE_HEIGHT - PDF_MARGIN;
    if (continued) {
      text(inv.invoiceNumber || "Invoice", left, y, 9, true, "left", "0.35 0.39 0.45");
      text("continued", right, y, 9, false, "right", "0.45 0.49 0.56");
      y -= 24;
    }
  };
  const ensureSpace = (height: number, continued = true) => {
    if (y - height < PDF_MARGIN) startPage(continued);
  };
  const text = (value: unknown, x: number, yy: number, size = 10, bold = false, align: "left" | "right" = "left", color = "0.07 0.09 0.13") => {
    const tx = align === "right" ? x - pdfTextWidth(value, size) : x;
    push(`BT ${color} rg /${bold ? "F2" : "F1"} ${size} Tf 1 0 0 1 ${tx.toFixed(2)} ${yy.toFixed(2)} Tm (${pdfEscapeText(value)}) Tj ET`);
  };
  const drawWrapped = (value: unknown, x: number, startY: number, maxWidth: number, size = 10, bold = false, color = "0.25 0.29 0.35") => {
    let yy = startY;
    wrapPdfText(value, maxWidth, size).forEach(line => {
      text(line, x, yy, size, bold, "left", color);
      yy -= size + 3;
    });
    return yy;
  };
  const line = (x1: number, yy: number, x2: number) => push(`0.84 0.87 0.91 RG 0.6 w ${x1.toFixed(2)} ${yy.toFixed(2)} m ${x2.toFixed(2)} ${yy.toFixed(2)} l S`);
  const fillRect = (x: number, yy: number, w: number, h: number, color = "0.96 0.97 0.98") => push(`q ${color} rg ${x.toFixed(2)} ${yy.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f Q`);

  startPage();

  if (logo) {
    const renderW = Math.min(132, logo.width);
    const renderH = Math.min(54, logo.height * (renderW / logo.width));
    push(`q ${renderW.toFixed(2)} 0 0 ${renderH.toFixed(2)} ${left.toFixed(2)} ${(y - renderH).toFixed(2)} cm /Im1 Do Q`);
    y -= renderH + 16;
  }

  const titleTop = PDF_PAGE_HEIGHT - PDF_MARGIN;
  text(invoiceLabel.toUpperCase(), right, titleTop, 26, true, "right");
  text(inv.invoiceNumber || "Not set", right, titleTop - 19, 11, false, "right", "0.38 0.42 0.48");
  if (inv.poNumber) text(`PO: ${inv.poNumber}`, right, titleTop - 35, 9.5, false, "right", "0.38 0.42 0.48");
  text("Invoice Date", right, titleTop - 58, 8, true, "right", "0.55 0.60 0.67");
  text(fmtDate(inv.issueDate), right, titleTop - 71, 11, true, "right");
  if (inv.dueDate) {
    text("Due Date", right, titleTop - 92, 8, true, "right", "0.55 0.60 0.67");
    text(fmtDate(inv.dueDate), right, titleTop - 105, 11, true, "right");
  }

  text(inv.companyName || sellerProfile.companyName || sellerProfile.fullName || "Not set", left, y, 14, true);
  y = drawWrapped(sellerRows.join("\n"), left, y - 15, 250, 9.5);
  y = Math.min(y, titleTop - 128);

  ensureSpace(118);
  const partyTop = y - 6;
  text("Bill To", left, partyTop, 8, true, "left", "0.55 0.60 0.67");
  text(inv.clientName || "Not set", left, partyTop - 16, 13, true);
  drawWrapped(clientRows.length ? clientRows.join("\n") : "Not set", left, partyTop - 31, 225, 9.5);
  text("Production / Project", 338, partyTop, 8, true, "left", "0.55 0.60 0.67");
  drawWrapped(inv.productionName || "Not set", 338, partyTop - 16, 205, 11, true);
  text("Timesheet", 338, partyTop - 51, 8, true, "left", "0.55 0.60 0.67");
  drawWrapped(inv.timesheetNumber || "Not set", 338, partyTop - 65, 205, 10);
  text("Detail", 338, partyTop - 91, 8, true, "left", "0.55 0.60 0.67");
  text(invoiceDetailModeLabel(inv.detailMode), 338, partyTop - 105, 10);
  y = partyTop - 130;

  ensureSpace(42);
  fillRect(left, y - 30, right - left, 38);
  const metaItems = [
    ["PO Number", inv.poNumber || "Not set"],
    ["Date Range", inv.timesheetDates || "Not set"],
    ["Status", INVOICE_STATUS[normalizeInvoiceStatus(inv.status)].label],
  ];
  metaItems.forEach(([label, value], index) => {
    const x = left + 16 + index * 170;
    text(label, x, y - 4, 7.5, true, "left", "0.48 0.53 0.60");
    drawWrapped(value, x, y - 18, 145, 9, true);
  });
  y -= 52;

  const drawTableHeader = (title = "Invoice Items") => {
    ensureSpace(42);
    text(title, left, y, 8.5, true, "left", "0.48 0.53 0.60");
    y -= 14;
    line(left, y, right);
    y -= 14;
    text("Description", left, y, 8, true, "left", "0.38 0.42 0.48");
    text("Qty", 365, y, 8, true, "right", "0.38 0.42 0.48");
    text("Unit", 430, y, 8, true, "right", "0.38 0.42 0.48");
    text("VAT", 480, y, 8, true, "right", "0.38 0.42 0.48");
    text("Amount", right, y, 8, true, "right", "0.38 0.42 0.48");
    y -= 10;
    line(left, y, right);
    y -= 12;
  };

  const drawRows = (rows: InvoiceLine[], title: string) => {
    drawTableHeader(title);
    if (!rows.length) {
      text("No line items", left, y, 9.5, false, "left", "0.45 0.49 0.56");
      y -= 24;
      return;
    }
    rows.forEach(row => {
      const desc = `${row.description || "Line item"}${row.isExtra ? " (Additional)" : ""}`;
      const descLines = wrapPdfText(desc, 290, 9.5);
      const rowH = Math.max(24, descLines.length * 12 + 8);
      ensureSpace(rowH + 10);
      descLines.forEach((descLine, index) => text(descLine, left, y - index * 12, 9.5));
      text(qty(row.quantity), 365, y, 9.5, false, "right", "0.25 0.29 0.35");
      text(m(row.unitPrice || 0), 430, y, 9.5, false, "right", "0.25 0.29 0.35");
      text(row.taxable === false ? "No" : inv.vat > 0 ? "Yes" : "-", 480, y, 9.5, false, "right", "0.45 0.49 0.56");
      text(m(row.amount), right, y, 9.5, true, "right");
      y -= rowH;
      line(left, y + 4, right);
    });
  };

  drawRows(inv.lineItems || [], "Invoice Items");

  ensureSpace(92);
  y -= 8;
  const totalsX = 335;
  const totalsValueX = right;
  const totalRow = (label: string, value: string, bold = false) => {
    text(label, totalsX, y, bold ? 11 : 10, bold, "left", bold ? "0.07 0.09 0.13" : "0.38 0.42 0.48");
    text(value, totalsValueX, y, bold ? 11 : 10, bold, "right", bold ? "0.07 0.09 0.13" : "0.25 0.29 0.35");
    y -= bold ? 17 : 15;
  };
  totalRow(sellerProfile.vatRegistered ? "Subtotal excl. VAT" : "Subtotal", m(inv.subtotal));
  if (inv.vat > 0) totalRow(`VAT (${inv.vat}%)`, m(inv.vatAmount));
  line(totalsX, y + 5, right);
  totalRow(sellerProfile.vatRegistered ? "Total incl. VAT" : "Total Due", m(inv.total), true);
  if (paidAmount > 0) {
    totalRow("Paid", m(paidAmount));
    totalRow("Balance Due", m(balanceDue), true);
  }

  if ((inv.timesheetBreakdown || []).length) {
    ensureSpace(58);
    y -= 12;
    drawRows(inv.timesheetBreakdown || [], "Attached Timesheet Breakdown");
  }

  const drawSection = (title: string, body: unknown) => {
    ensureSpace(58);
    y -= 10;
    line(left, y, right);
    y -= 18;
    text(title, left, y, 8.5, true, "left", "0.48 0.53 0.60");
    y = drawWrapped(body, left, y - 15, right - left, 9.5);
  };

  if (bankRows.length) {
    ensureSpace(78);
    y -= 10;
    line(left, y, right);
    y -= 18;
    text("Banking Details", left, y, 8.5, true, "left", "0.48 0.53 0.60");
    y -= 16;
    bankRows.forEach(([label, value], index) => {
      const x = left + (index % 2) * 265;
      if (index > 0 && index % 2 === 0) y -= 34;
      text(label, x, y, 7.5, true, "left", "0.55 0.60 0.67");
      drawWrapped(value, x, y - 13, 230, 9.5, true);
    });
    y -= 42;
  }
  if (paymentTerms) drawSection("Payment Terms", paymentTerms);
  if (inv.notes) drawSection("Notes", inv.notes);

  if (ops.length) pages.push(ops.join("\n"));
  return pdfBlobFromPages(pages, logo);
}

async function downloadInvoicePdf(inv: Invoice, profile: Profile) {
  const sellerProfile = sellerProfileForInvoice(inv, profile);
  const logoDataUrl = invoiceLogoForDisplay(inv, sellerProfile);
  const logo = await logoDataUrlToJpeg(logoDataUrl).catch(() => null);
  const blob = buildInvoicePdfBlob(inv, profile, logo);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = invoicePdfFilename(inv);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function printInvoice(inv: Invoice, profile: Profile) {
  const esc = (s: unknown) => String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  const block = (s: unknown) => esc(s).replace(/\n/g, "<br/>");
  const sellerProfile = sellerProfileForInvoice(inv, profile);
  const m = (n: unknown) => fmtMoney(n, inv.currency);
  const client = invoiceClient(inv);
  const bd = inv.banking || {};
  const bankRows = ([["Account Holder", bd.accountName],["Bank", bd.bankName],["Account No.", bd.accountNumber],["Branch", bd.branchCode],bd.swift&&["SWIFT", bd.swift],bd.iban&&["IBAN", bd.iban],bd.reference&&["Reference", bd.reference]] as [string,string][]).filter(r=>r&&r[1]);
  const sellerRows = ([sellerProfile.fullName, sellerProfile.role, sellerProfile.email, sellerProfile.phone, sellerProfile.address, sellerProfile.vatRegistered && sellerProfile.vatNumber && `VAT / Tax: ${sellerProfile.vatNumber}`] as string[]).filter(Boolean);
  const clientRows = ([client?.contactPerson, client?.accountsEmail || client?.email, client?.phone, client?.billingAddress, client?.vendorNumber && `Vendor: ${client.vendorNumber}`, client?.vatNumber && `VAT: ${client.vatNumber}`] as string[]).filter(Boolean);
  const lineRows = (inv.lineItems||[]).map(l=>`<tr><td>${esc(l.description)}${l.isExtra?`<span class="pill">Additional</span>`:""}</td><td class="num">${l.quantity || ""}</td><td class="num">${m(l.unitPrice || 0)}</td><td class="num muted">${l.taxable === false ? "No" : inv.vat > 0 ? "Yes" : "—"}</td><td class="num strong">${m(l.amount)}</td></tr>`).join("") || `<tr><td colspan="5" class="muted">No line items</td></tr>`;
  const attachedRows = (inv.timesheetBreakdown || []).map(l=>`<tr><td>${esc(l.description)}</td><td class="num">${l.quantity || ""}</td><td class="num">${m(l.unitPrice || 0)}</td><td class="num"></td><td class="num strong">${m(l.amount)}</td></tr>`).join("");
  const paymentTerms = inv.paymentTerms || inv.paymentNotes || sellerProfile.paymentTerms || "";
  const balanceDue = invoiceBalance(inv);
  const paidAmount = safe(inv.paidAmount, 0);
  const invoiceLabel = sellerProfile.vatRegistered ? (sellerProfile.invoiceLabel || "Tax Invoice") : (sellerProfile.invoiceLabel || "Invoice");
  const logoDataUrl = invoiceLogoForDisplay(inv, sellerProfile);
  const logoHtml = logoDataUrl ? `<img class="sellerLogo" src="${esc(logoDataUrl)}" alt="Business logo">` : "";
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(inv.invoiceNumber)}</title><style>
*{margin:0;padding:0;box-sizing:border-box}body{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#111827;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}.page{max-width:820px;margin:0 auto;padding:46px}.top{display:flex;justify-content:space-between;gap:32px;margin-bottom:30px}.sellerHead{max-width:430px}.sellerLogo{display:block;max-width:55mm;max-height:25mm;object-fit:contain;margin-bottom:14px}.title{font-size:30px;font-weight:750;letter-spacing:.02em;text-transform:uppercase}.muted{color:#6B7280}.tiny{font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:.08em}.strong{font-weight:700}.boxgrid{display:grid;grid-template-columns:1fr 1fr;gap:28px;margin-bottom:24px}.meta{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;border:1px solid #E5E7EB;border-radius:10px;padding:14px;margin-bottom:24px}.meta div{min-width:0}.meta p:last-child{font-size:12px;margin-top:4px;font-weight:600}.party{line-height:1.5;font-size:12px}.party h2{font-size:15px;margin:6px 0 4px}table{width:100%;border-collapse:collapse;margin-top:8px}th{padding:9px 0;border-top:2px solid #111827;border-bottom:1px solid #E5E7EB;font-size:10px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:.06em;text-align:left}td{padding:10px 0;border-bottom:1px solid #F3F4F6;font-size:12px;vertical-align:top}.num{text-align:right;white-space:nowrap}.pill{display:inline-block;margin-left:8px;padding:2px 6px;border-radius:999px;background:#F3F4F6;color:#6B7280;font-size:9px;font-weight:700;text-transform:uppercase}.totals{display:flex;justify-content:flex-end;margin-top:18px}.totals>div{width:280px}.row{display:flex;justify-content:space-between;padding:4px 0;font-size:13px;color:#6B7280}.due{font-size:17px;font-weight:750;color:#111827;border-top:2px solid #111827;margin-top:6px;padding-top:10px}.section{margin-top:24px;padding-top:18px;border-top:1px solid #E5E7EB}.bank{display:grid;grid-template-columns:1fr 1fr;gap:10px 22px;margin-top:10px}.bank div p:last-child{font-size:12px;font-weight:600;margin-top:2px}.notes{font-size:12px;color:#374151;line-height:1.55;margin-top:8px}@media print{.page{padding:30px}.meta{break-inside:avoid}.section{break-inside:avoid}}
</style></head><body><div class="page">
<div class="top"><div class="sellerHead">${logoHtml}<div style="font-size:17px;font-weight:750">${esc(inv.companyName || sellerProfile.companyName || sellerProfile.fullName || "Not set")}</div>${sellerRows.map(r=>`<div class="muted" style="font-size:12px">${block(r)}</div>`).join("")}</div><div style="text-align:right"><div class="title">${esc(invoiceLabel)}</div><div class="muted" style="font-size:13px;margin-top:4px">${esc(inv.invoiceNumber || "Not set")}</div>${inv.poNumber?`<div class="muted" style="font-size:12px;margin-top:2px">PO: ${esc(inv.poNumber)}</div>`:""}<div class="tiny" style="margin-top:14px">Invoice Date</div><div style="font-size:13px;font-weight:700">${esc(fmtDate(inv.issueDate))}</div>${inv.dueDate?`<div class="tiny" style="margin-top:8px">Due Date</div><div style="font-size:13px;font-weight:700">${esc(fmtDate(inv.dueDate))}</div>`:""}</div></div>
<div class="boxgrid"><div class="party"><div class="tiny">Bill To</div><h2>${esc(inv.clientName || "Not set")}</h2>${clientRows.length ? clientRows.map(r=>`<div class="muted">${block(r)}</div>`).join("") : `<div class="muted">Not set</div>`}</div><div class="party" style="text-align:right"><div class="tiny">Invoice Date</div><h2>${esc(fmtDate(inv.issueDate))}</h2>${inv.dueDate?`<div class="tiny" style="margin-top:10px">Due Date</div><div style="font-weight:700">${esc(fmtDate(inv.dueDate))}</div>`:""}</div></div>
<div class="meta"><div><p class="tiny">Production</p><p>${esc(inv.productionName || "Not set")}</p></div><div><p class="tiny">PO Number</p><p>${esc(inv.poNumber || "Not set")}</p></div><div><p class="tiny">Timesheet</p><p>${esc(inv.timesheetNumber || "Not set")}</p></div><div><p class="tiny">Detail</p><p>${esc(invoiceDetailModeLabel(inv.detailMode))}</p></div><div><p class="tiny">Status</p><p>${esc(INVOICE_STATUS[normalizeInvoiceStatus(inv.status)].label)}</p></div></div>
<table><thead><tr><th>Description</th><th class="num">Qty</th><th class="num">Unit</th><th class="num">VAT</th><th class="num">Amount</th></tr></thead><tbody>${lineRows}</tbody></table>
<div class="totals"><div><div class="row"><span>${sellerProfile.vatRegistered ? "Subtotal excl. VAT" : "Subtotal"}</span><span>${m(inv.subtotal)}</span></div>${inv.vat>0?`<div class="row"><span>VAT (${inv.vat}%)</span><span>${m(inv.vatAmount)}</span></div>`:""}<div class="row due"><span>${sellerProfile.vatRegistered ? "Total incl. VAT" : "Total Due"}</span><span>${m(inv.total)}</span></div>${paidAmount>0?`<div class="row"><span>Paid</span><span>${m(paidAmount)}</span></div><div class="row strong"><span>Balance Due</span><span>${m(balanceDue)}</span></div>`:""}</div></div>
${attachedRows?`<div class="section"><div class="tiny">Attached Timesheet Breakdown</div><table><thead><tr><th>Description</th><th class="num">Qty</th><th class="num">Unit</th><th></th><th class="num">Amount</th></tr></thead><tbody>${attachedRows}</tbody></table></div>`:""}
${bankRows.length?`<div class="section"><div class="tiny">Banking Details</div><div class="bank">${bankRows.map(([k,v])=>`<div><p class="tiny">${esc(k)}</p><p>${esc(v)}</p></div>`).join("")}</div></div>`:""}
${paymentTerms?`<div class="section"><div class="tiny">Payment Terms</div><div class="notes">${block(paymentTerms)}</div></div>`:""}
${inv.notes?`<div class="section"><div class="tiny">Notes</div><div class="notes">${block(inv.notes)}</div></div>`:""}
</div><script>window.addEventListener('load',function(){setTimeout(function(){window.print()},500)})<\/script></body></html>`;
  const w = window.open("", "_blank", "width=960,height=720");
  if (!w) { alert("Allow pop-ups to export PDF"); return; }
  w.document.write(html); w.document.close();
}

function printTimesheet(ts: Timesheet, profile: Profile) {
  const entries = ts.entries || [];
  if (!entries.length) { alert("Add at least one day before exporting a timesheet."); return; }

  const esc = (s: unknown) => String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  const block = (s: unknown) => esc(s).replace(/\n/g, "<br/>");
  const cur = ts.currency || profile.defaultCurrency || "ZAR";
  const m = (n: unknown) => fmtMoney(n, cur);
  const sum = calcSummary(entries, profile);
  const sellerRows = ([["Name", profile.fullName],["Trading / Company", profile.companyName],["Email", profile.email],["Phone", profile.phone],profile.vatRegistered && profile.vatNumber && ["VAT / Tax", profile.vatNumber]] as [string,string][]).filter(r=>r&&r[1]);
  const entryRows = sum.calcs.map(({ entry, c }) => {
    const minTR = num(entry.turnaroundMinimumHoursUsed, profile.defaultMinTurnaround || 10);
    const trMode = (entry.turnaroundRuleUsed || profile.defaultTurnaroundMode || "warning") as TurnaroundMode;
    const trShort = c.turnaround !== null ? Math.max(minTR - c.turnaround, 0) : 0;
    const turnaroundText = c.turnaround === null
      ? "—"
      : c.turnaroundPenalty > 0
        ? `Penalty ${m(c.turnaroundPenalty)} (${hoursToHM(c.turnaround)})`
        : trShort > 0
          ? `${trMode === "manual" ? "Manual approval" : "Warning"} (${hoursToHM(c.turnaround)})`
          : `OK (${hoursToHM(c.turnaround)})`;
    const expenseNote = c.expenses > 0 ? `Expense: ${entry.expenseDescription || "Additional expenses"} ${m(c.expenses)}` : "";
    const notes = [entry.notes, expenseNote].filter(Boolean).join("\n");
    return `<tr>
      <td>${esc(fmtDate(entry.date || ""))}</td>
      <td>${esc(entry.location || "—")}</td>
      <td class="mono">${esc(entry.callTime || "—")}</td>
      <td class="mono">${esc(entry.wrapTime || "—")}</td>
      <td class="num">${c.mealH > 0 ? esc(hoursToHM(c.mealH)) : "—"}</td>
      <td class="num">${c.travH > 0 ? esc(hoursToHM(c.travH)) : "—"}</td>
      <td class="num strong">${esc(hoursToHM(c.paidH || 0))}</td>
      <td class="num">${c.totalOtH > 0 ? esc(hoursToHM(c.totalOtH)) : "—"}</td>
      <td>${esc(turnaroundText)}</td>
      <td>${notes ? block(notes) : "—"}</td>
      <td class="num strong">${m(c.totalWithPenalty)}</td>
    </tr>`;
  }).join("");
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(ts.timesheetNumber || "Timesheet")}</title><style>
*{margin:0;padding:0;box-sizing:border-box}body{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#111827;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}.page{max-width:1120px;margin:0 auto;padding:28px}.top{display:flex;justify-content:space-between;gap:28px;margin-bottom:22px}.title{font-size:26px;font-weight:800;letter-spacing:0;text-transform:uppercase}.brand{font-size:11px;font-weight:800;color:#6B7280;letter-spacing:0;text-transform:uppercase;margin-bottom:3px}.muted{color:#6B7280}.tiny{font-size:9.5px;font-weight:800;color:#6B7280;text-transform:uppercase;letter-spacing:0}.strong{font-weight:750}.mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}.meta{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;border:1px solid #D1D5DB;border-radius:8px;padding:12px;margin-bottom:18px}.meta div{min-width:0}.meta p:last-child{font-size:12px;font-weight:650;margin-top:3px}.parties{display:grid;grid-template-columns:1fr 1fr;gap:22px;margin-bottom:18px}.party{font-size:12px;line-height:1.45}.party h2{font-size:15px;margin:4px 0 5px}.seller{display:grid;grid-template-columns:repeat(2,1fr);gap:7px 18px;margin-top:7px}.seller p:last-child{font-size:12px;font-weight:650;margin-top:2px}table{width:100%;border-collapse:collapse;table-layout:fixed}thead{display:table-header-group}th{padding:8px 5px;border-top:2px solid #111827;border-bottom:1px solid #D1D5DB;font-size:9.5px;font-weight:800;color:#4B5563;text-transform:uppercase;letter-spacing:0;text-align:left}td{padding:8px 5px;border-bottom:1px solid #E5E7EB;font-size:10.5px;line-height:1.35;vertical-align:top;overflow-wrap:anywhere}tr{break-inside:avoid}.num{text-align:right;white-space:nowrap}.totals{display:flex;justify-content:flex-end;margin-top:18px;break-inside:avoid}.totals>div{width:330px}.row{display:flex;justify-content:space-between;gap:16px;padding:4px 0;font-size:12.5px;color:#4B5563}.grand{font-size:16px;font-weight:800;color:#111827;border-top:2px solid #111827;margin-top:6px;padding-top:9px}.signoff{margin-top:30px;padding-top:18px;border-top:1px solid #D1D5DB;break-inside:avoid;page-break-inside:avoid}.siggrid{display:grid;grid-template-columns:1fr 1fr;gap:28px;margin-top:12px}.sigbox{border:1px solid #D1D5DB;border-radius:8px;padding:14px;min-height:155px}.line{border-bottom:1px solid #9CA3AF;height:28px;margin-top:12px}.comments{border:1px solid #D1D5DB;border-radius:8px;min-height:80px;margin-top:12px;padding:10px}.notes{font-size:12px;line-height:1.5;color:#374151}.w-date{width:10%}.w-place{width:11%}.w-time{width:6.5%}.w-small{width:7%}.w-turn{width:13%}.w-notes{width:17%}.w-total{width:9%}@page{size:A4 landscape;margin:12mm}@media print{.page{padding:0}.meta,.totals,.signoff{break-inside:avoid;page-break-inside:avoid}}
</style></head><body><div class="page">
<div class="top"><div><div class="brand">CrewQuote Pro / Timesheet</div><div class="title">Timesheet</div><div class="muted" style="font-size:13px;margin-top:4px">${esc(ts.timesheetNumber || "Not set")}</div></div><div style="text-align:right"><div style="font-size:17px;font-weight:800">${esc(profile.companyName || profile.fullName || "Not set")}</div><div class="muted" style="font-size:12px;margin-top:4px">Generated ${esc(fmtDate(todayStr()))}</div></div></div>
<div class="meta"><div><p class="tiny">Production / Project</p><p>${esc(ts.productionName || "Not set")}</p></div><div><p class="tiny">Client / Bill To</p><p>${esc(ts.clientName || "Not set")}</p></div><div><p class="tiny">Crew Member</p><p>${esc(ts.crewName || profile.fullName || "Not set")}</p></div><div><p class="tiny">Role</p><p>${esc(ts.role || profile.role || "Not set")}</p></div><div><p class="tiny">Week / Date Range</p><p>${esc(timesheetDateRange(ts))}</p></div><div><p class="tiny">Reference</p><p>${esc(ts.timesheetNumber || "Not set")}</p></div><div><p class="tiny">Currency</p><p>${esc(cur)}</p></div><div><p class="tiny">Status</p><p>${esc(ts.status || "open")}</p></div></div>
<div class="parties"><div class="party"><div class="tiny">Business / Freelancer Details</div><div class="seller">${sellerRows.length ? sellerRows.map(([k,v])=>`<div><p class="tiny">${esc(k)}</p><p>${block(v)}</p></div>`).join("") : `<div class="muted">Not set</div>`}</div></div><div class="party"><div class="tiny">Optional Timesheet Notes</div><div class="notes" style="margin-top:7px">${ts.notes ? block(ts.notes) : `<span class="muted">No notes</span>`}</div></div></div>
<table><thead><tr><th class="w-date">Date</th><th class="w-place">Location</th><th class="w-time">Call</th><th class="w-time">Wrap</th><th class="num w-small">Meal</th><th class="num w-small">Travel</th><th class="num w-small">Paid</th><th class="num w-small">OT</th><th class="w-turn">Turnaround</th><th class="w-notes">Notes</th><th class="num w-total">Day Total</th></tr></thead><tbody>${entryRows}</tbody></table>
<div class="totals"><div><div class="row"><span>Total days</span><span>${sum.totalDays}</span></div><div class="row"><span>Total paid hours</span><span>${esc(hoursToHM(sum.totalPaidH))}</span></div><div class="row"><span>Total overtime hours</span><span>${esc(hoursToHM(sum.totalOtH))}</span></div><div class="row"><span>Total equipment rental</span><span>${m(sum.totalEquip)}</span></div>${sum.totalPerDiem>0?`<div class="row"><span>Total per diem</span><span>${m(sum.totalPerDiem)}</span></div>`:""}<div class="row"><span>Total expenses</span><span>${m(sum.totalExp)}</span></div><div class="row"><span>Turnaround penalties</span><span>${m(sum.totalTurnaroundPenalty)}</span></div>${sum.vatAmt>0?`<div class="row"><span>${sum.mixedVat ? "VAT" : `VAT (${sum.vatPct}%)`}</span><span>${m(sum.vatAmt)}</span></div>`:""}<div class="row grand"><span>Grand total</span><span>${m(sum.grandTotal)}</span></div></div></div>
<div class="signoff"><div class="tiny">Sign-off</div><div class="siggrid"><div class="sigbox"><h2 style="font-size:14px;margin-bottom:8px">Crew member signature</h2><p class="tiny">Name</p><div class="line"></div><p class="tiny" style="margin-top:10px">Signature</p><div class="line"></div><p class="tiny" style="margin-top:10px">Date</p><div class="line"></div></div><div class="sigbox"><h2 style="font-size:14px;margin-bottom:8px">Production / HOD sign-off</h2><p class="tiny">Name</p><div class="line"></div><p class="tiny" style="margin-top:10px">Position</p><div class="line"></div><p class="tiny" style="margin-top:10px">Signature</p><div class="line"></div><p class="tiny" style="margin-top:10px">Date</p><div class="line"></div></div></div><div class="comments"><p class="tiny">Optional notes / approval comments</p></div></div>
</div><script>window.addEventListener('load',function(){setTimeout(function(){window.print()},500)})<\/script></body></html>`;
  const w = window.open("", "_blank", "width=1120,height=760");
  if (!w) { alert("Allow pop-ups to print timesheet"); return; }
  w.document.write(html); w.document.close();
}

// ═══════════════════════════════════════════════════════════════════════════
// TIMESHEET DETAIL
// ═══════════════════════════════════════════════════════════════════════════

function TimesheetDetail({ timesheet, profile, linkedInvoice, onUpdate, onBack, onCreateInvoice, onShowToast }: {
  timesheet: Timesheet; profile: Profile; onUpdate: (ts: Timesheet) => void;
  linkedInvoice?: Invoice | null; onBack: () => void; onCreateInvoice: (ts: Timesheet) => void; onShowToast: (msg: string, type?: ToastType) => void;
}) {
  const [tab, setTab]     = useState("add");
  const [editingDay, setEditingDay] = useState<{ mode: "edit" | "duplicate"; entry: TimesheetEntry } | null>(null);
  const [showProductionRates, setShowProductionRates] = useState(false);
  const [productionRates, setProductionRates] = useState<RateDraft>(() => rateDraftFromTimesheet(timesheet, profile));
  const effectiveProfile  = useMemo(() => profileForTimesheet(profile, timesheet), [profile, timesheet]);
  const sum               = useMemo(() => calcSummary(timesheet.entries || [], effectiveProfile), [timesheet.entries, effectiveProfile]);
  const cur               = timesheet.currency || effectiveProfile.defaultCurrency || "ZAR";
  const hasEntries        = (timesheet.entries || []).length > 0;
  const linkedStatus      = linkedInvoice ? normalizeInvoiceStatus(linkedInvoice.status) : null;
  const linkedFinalised   = Boolean(linkedStatus && linkedStatus !== "draft");
  const addEntry          = (e: TimesheetEntry) => {
    onUpdate({ ...timesheet, entries: [...(timesheet.entries || []), withEntrySnapshots(e, effectiveProfile)] });
  };
  const updateEntry       = (entry: TimesheetEntry) => {
    onUpdate({ ...timesheet, entries: (timesheet.entries || []).map(e => e.id === entry.id ? withEntrySnapshots(entry, effectiveProfile) : e) });
    onShowToast("Timesheet day updated.");
  };
  const duplicateEntryFromWeekly = (entry: TimesheetEntry) => {
    setEditingDay({ mode: "duplicate", entry: withEntrySnapshots({ ...entry, id: uid(), date: nextDayStr(entry.date), callTime: "08:00", wrapTime: "18:00" }, effectiveProfile) });
  };
  const deleteEntry       = (id: string) => {
    onUpdate({ ...timesheet, entries: (timesheet.entries || []).filter(e => e.id !== id) });
    onShowToast("Timesheet day deleted", "info");
  };
  const saveDayEditor     = (entry: TimesheetEntry) => {
    if (!editingDay) return;
    const snapshot = withEntrySnapshots(entry, effectiveProfile);
    if (editingDay.mode === "duplicate") {
      onUpdate({ ...timesheet, entries: [...(timesheet.entries || []), snapshot] });
      onShowToast("Timesheet day duplicated.");
    } else {
      updateEntry(snapshot);
    }
    setEditingDay(null);
  };
  const openProductionRates = () => {
    setProductionRates(rateDraftFromTimesheet(timesheet, profile));
    setShowProductionRates(v => !v);
  };
  const saveProductionRates = () => {
    const choice = prompt("How should these changes apply?\n\n1. Apply to future days only\n2. Recalculate existing days that have not been invoiced\n3. Recalculate all days in this timesheet", "1") || "1";
    if (!["1", "2", "3"].includes(choice)) return;
    if (linkedFinalised && choice === "3" && !confirm("This timesheet is linked to an invoice. Editing it may require updating or recreating the invoice. Recalculate all days anyway?")) return;
    let next = applyRateDraftToTimesheet(timesheet, productionRates);
    const nextProfile = profileForTimesheet(profile, next);
    const canRecalculateExisting = choice === "3" || (choice === "2" && !linkedFinalised);
    if (canRecalculateExisting) {
      next = { ...next, entries: (next.entries || []).map(e => applyRateDraftToEntry(e, productionRates, nextProfile)) };
    }
    onUpdate(next);
    setShowProductionRates(false);
    onShowToast(choice === "1" ? "Production rates saved for future days." : "Production rates saved and matching days recalculated.");
  };
  const statusColor       = ({ open: "gray", submitted: "blue", invoiced: "teal" } as Record<string, string>)[timesheet.status] || "gray";
  const statusLabel       = ({ open: "Open", submitted: "Submitted", invoiced: "Invoiced" } as Record<string, string>)[timesheet.status] || "Open";
  const TABS = [{ id: "add", label: "Add Day" }, { id: "weekly", label: `Weekly (${(timesheet.entries||[]).length})` }, { id: "summary", label: "Summary" }];

  return (
    <div className="space-y-5">
      <PageHeader
        title={timesheet.productionName || "Untitled"}
        description={`${timesheet.timesheetNumber} · Bill to ${timesheet.clientName || "Unknown / add later"} · ${(timesheet.entries||[]).length} day${(timesheet.entries||[]).length !== 1 ? "s" : ""} · ${fmtMoney(sum.grandTotal, cur)}`}
        badge={<Badge color={statusColor}>{statusLabel}</Badge>}
        secondaryActions={<Btn variant="secondary" size="sm" onClick={onBack}>{"\u2190"} Back to Timesheets</Btn>}
        actions={<>
          <Btn variant="secondary" size="sm" onClick={openProductionRates}><Pencil size={13}/> Edit production rates</Btn>
          {timesheet.status !== "invoiced" && sum.grandTotal > 0 && <Btn variant="success" size="sm" onClick={() => onCreateInvoice(timesheet)}><Receipt size={13}/> Create Invoice</Btn>}
          <Btn variant="secondary" size="sm" disabled={!hasEntries} title={!hasEntries ? "Add at least one day before exporting a timesheet." : "Print or save this timesheet as PDF"} className={!hasEntries ? "opacity-50 cursor-not-allowed" : ""} onClick={() => hasEntries && printTimesheet(timesheet, effectiveProfile)}><FileText size={13}/> Print Timesheet</Btn>
        </>}
      />
      {!hasEntries && <AlertBox type="info">Add at least one day before exporting a timesheet.</AlertBox>}
      {linkedInvoice && linkedFinalised && (
        <AlertBox type="warning">This timesheet is linked to an invoice. Editing it may require updating or recreating the invoice.</AlertBox>
      )}
      {linkedInvoice && !linkedFinalised && (
        <AlertBox type="info">Draft invoice {linkedInvoice.invoiceNumber} will use the latest timesheet totals when you update or save timesheet changes.</AlertBox>
      )}
      {showProductionRates && (
        <Card className="p-5">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <p className="text-sm font-bold text-gray-900">Production rates</p>
              <p className="text-xs text-gray-400 mt-0.5">These rates fill future days unless you choose to recalculate existing entries.</p>
            </div>
            <div className="flex gap-2">
              <Btn variant="secondary" size="sm" onClick={() => setShowProductionRates(false)}>Cancel</Btn>
              <Btn size="sm" onClick={saveProductionRates}><Save size={13}/> Save Rates</Btn>
            </div>
          </div>
          <ProductionRateFields rates={productionRates} onChange={setProductionRates} currency={cur} />
        </Card>
      )}
      <div className="flex flex-wrap gap-1 border-b border-slate-200">
        {TABS.map(t => <button key={t.id} type="button" onClick={() => setTab(t.id)} className={`rounded-t-lg px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${UI.focus} ${tab === t.id ? "border-blue-600 bg-white text-blue-700" : "border-transparent text-slate-500 hover:bg-white hover:text-slate-900"}`}>{t.label}</button>)}
      </div>
      {tab === "add"    && <AddDayForm  timesheet={timesheet} profile={effectiveProfile} onAdd={addEntry} onShowToast={onShowToast} />}
      {tab === "weekly" && <WeeklyView  timesheet={timesheet} profile={effectiveProfile} onEditEntry={entry => setEditingDay({ mode: "edit", entry })} onDuplicateEntry={duplicateEntryFromWeekly} onDeleteEntry={deleteEntry} />}
      {tab === "summary"&& <SummaryView timesheet={timesheet} profile={effectiveProfile} onStartInvoice={() => onCreateInvoice(timesheet)} />}
      {editingDay && <TimesheetDayEditor entry={editingDay.entry} profile={effectiveProfile} mode={editingDay.mode} onSave={saveDayEditor} onCancel={() => setEditingDay(null)} />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TIMESHEETS PAGE
// ═══════════════════════════════════════════════════════════════════════════

function FirstRunOnboarding({ onSettings, onClients, onDismiss }: { onSettings: () => void; onClients: () => void; onDismiss: () => void }) {
  return (
    <Card className="p-5 sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-bold text-slate-950">Welcome to CrewQuote Pro Beta</h2>
            <Badge color="blue">Version {APP_VERSION}</Badge>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            Complete your business details, add a client, create a timesheet, add your work days, then generate an invoice.
          </p>
          <p className="mt-2 text-sm leading-relaxed text-amber-800">
            CrewQuote currently stores data only in this browser on this device. It does not sync between devices. Clearing browser data may remove your records. Export regular backups.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 lg:justify-end">
          <Btn onClick={onSettings}><Settings size={14}/> Set Up Business Details</Btn>
          <Btn variant="secondary" onClick={onClients}><Users size={14}/> Add First Client</Btn>
          <Btn variant="ghost" onClick={onDismiss}>Dismiss</Btn>
        </div>
      </div>
    </Card>
  );
}

function TimesheetsPage({ timesheets, profile, clients, onSave, onSaveClients, invoices, onAddInvoice, onSaveInvoices, onShowToast, showOnboarding, onDismissOnboarding, onNavigate }: {
  timesheets: Timesheet[]; profile: Profile; clients: Client[]; onSave: (t: Timesheet[]) => void; onSaveClients: (clients: Client[]) => void | Promise<void>;
  invoices: Invoice[]; onAddInvoice: (i: Invoice) => void; onSaveInvoices: (invoices: Invoice[]) => void; onShowToast: (msg: string, type?: ToastType) => void;
  showOnboarding: boolean; onDismissOnboarding: () => void; onNavigate: (page: string) => void;
}) {
  const [view, setView]           = useState<"list" | "detail" | "invoice-review">("list");
  const [selected, setSelected]   = useState<Timesheet | null>(null);
  const [showNew, setShowNew]     = useState(false);
  const [showNewRates, setShowNewRates] = useState(false);
  const [newTs, setNewTs] = useState({
    productionName: "",
    clientChoice: "unknown",
    role: profile.role || "",
    startDate: todayStr(),
    currency: profile.defaultCurrency || "ZAR",
    notes: "",
    rates: rateDraftFromProfile(profile),
  });
  const [newClient, setNewClient] = useState<Client>(() => blankClient());
  const cur = profile.defaultCurrency || "ZAR";
  const selectedClientForNew = newTs.clientChoice !== "unknown" && newTs.clientChoice !== "new"
    ? clients.find(c => c.id === newTs.clientChoice) || null
    : null;
  const useLastClientRate = () => {
    const memory = selectedClientForNew?.rateMemory;
    if (!memory) return;
    setNewTs(p => ({ ...p, rates: rateDraftFromMemory(memory) }));
    onShowToast("Last client rate loaded", "info");
  };

  const resetNewTimesheet = () => {
    setNewTs({
      productionName: "",
      clientChoice: "unknown",
      role: profile.role || "",
      startDate: todayStr(),
      currency: profile.defaultCurrency || "ZAR",
      notes: "",
      rates: rateDraftFromProfile(profile),
    });
    setNewClient(blankClient());
    setShowNewRates(false);
  };

  const createTS = async () => {
    if (!newTs.productionName.trim()) return;

    let chosenClient: Client | null = null;
    let nextClients = clients;
    let clientsChanged = false;

    if (newTs.clientChoice === "new") {
      if (!newClient.companyName.trim()) { onShowToast("Enter the new client company name or choose Unknown / add later", "error"); return; }
      chosenClient = normalizeClient({ ...newClient, rateMemory: memoryFromRateDraft(newTs.rates, newTs.productionName.trim()) });
      nextClients = [...clients, chosenClient];
      clientsChanged = true;
    } else if (newTs.clientChoice !== "unknown") {
      chosenClient = clients.find(c => c.id === newTs.clientChoice) || null;
      if (chosenClient) {
        const remembered = normalizeClient({ ...chosenClient, rateMemory: memoryFromRateDraft(newTs.rates, newTs.productionName.trim()) });
        nextClients = clients.map(c => c.id === remembered.id ? remembered : c);
        chosenClient = remembered;
        clientsChanged = true;
      }
    }

    if (clientsChanged) {
      try {
        await onSaveClients(nextClients);
      } catch (err) {
        onShowToast(err instanceof Error ? err.message : "CrewQuote could not save this client to your account.", "error");
        return;
      }
    }

    const ts: Timesheet = {
      id: uid(),
      timesheetNumber: genTSNum(timesheets),
      productionName: newTs.productionName.trim(),
      clientId: chosenClient?.id,
      clientName: chosenClient ? clientName(chosenClient) : "Unknown / add later",
      clientIncomplete: !chosenClient || !clientBillingComplete(chosenClient),
      crewName: profile.fullName,
      role: newTs.role || profile.role,
      startDate: newTs.startDate || todayStr(),
      notes: newTs.notes,
      currency: newTs.currency,
      vat: newTs.rates.vat,
      status: "open",
      entries: [],
      paymentTerms: chosenClient?.paymentTerms || chosenClient?.defaultPaymentTerms || profile.paymentTerms,
      defaultDayRate: newTs.rates.dayRate,
      defaultIncludedHours: newTs.rates.includedHours,
      defaultEquipmentRental: newTs.rates.equipmentRental,
      defaultPerDiem: newTs.rates.perDiem,
      defaultOvertimeRule: newTs.rates.overtimeRule,
      defaultOtBand1Hours: newTs.rates.otBand1Hours,
      defaultOtBand1Mult: newTs.rates.otBand1Mult,
      defaultOtBand2Mult: newTs.rates.otBand2Mult,
      defaultMinTurnaround: newTs.rates.minTurnaround,
      defaultTurnaroundMode: newTs.rates.turnaroundMode,
      defaultTurnaroundPenMult: newTs.rates.turnaroundPenMult,
      mealBreaksDeducted: newTs.rates.mealDeducted,
      travelTimePaid: newTs.rates.travelPaid,
      equipmentRentalDaily: true,
      createdAt: new Date().toISOString(),
    };
    onSave([...timesheets, ts]); setSelected(ts); setView("detail"); setShowNew(false); resetNewTimesheet();
  };

  const updateTS = useCallback((ts: Timesheet) => {
    onSave((timesheets || []).map(x => x.id === ts.id ? ts : x));
    const linked = (invoices || []).find(i => i.id === ts.invoiceId || i.fromTimesheetId === ts.id);
    if (linked && normalizeInvoiceStatus(linked.status) === "draft") {
      onSaveInvoices((invoices || []).map(i => i.id === linked.id ? rebuildDraftInvoiceFromTimesheet(i, ts, profile) : i));
    }
    if (ts.clientId) {
      const client = clients.find(c => c.id === ts.clientId);
      if (client) {
        const remembered = normalizeClient({ ...client, rateMemory: memoryFromRateDraft(rateDraftFromTimesheet(ts, profile), ts.productionName) });
        void Promise.resolve(onSaveClients(clients.map(c => c.id === remembered.id ? remembered : c))).catch(err => {
          onShowToast(err instanceof Error ? err.message : "CrewQuote could not update the client rate memory.", "error");
        });
      }
    }
    setSelected(ts);
  }, [timesheets, invoices, clients, profile, onSave, onSaveInvoices, onSaveClients]);

  const deleteTS = (id: string) => {
    const ts = (timesheets || []).find(t => t.id === id);
    const linked = (invoices || []).find(i => i.id === ts?.invoiceId || i.fromTimesheetId === id);
    if (linked) {
      alert(`This timesheet is linked to invoice ${linked.invoiceNumber || "not numbered"} and cannot be deleted while that invoice exists.`);
      return;
    }
    const name = `${ts?.productionName || "Untitled timesheet"}${ts?.timesheetNumber ? ` - ${ts.timesheetNumber}` : ""}`;
    if (!confirm(`Delete timesheet "${name}"? This cannot be undone.`)) return;
    onSave((timesheets||[]).filter(t => t.id !== id));
    if (selected?.id === id) { setView("list"); setSelected(null); }
  };

  const startInvoice = useCallback((ts: Timesheet) => {
    updateTS(ts);
    setSelected(ts);
    setView("invoice-review");
  }, [updateTS]);

  const saveInvoice = useCallback((inv: Invoice) => {
    onAddInvoice(inv);
    const source = (timesheets || []).find(t => t.id === inv.fromTimesheetId) || selected!;
    const updated = {
      ...source,
      status: "invoiced" as const,
      invoiceId: inv.id,
      clientId: inv.clientId || source.clientId,
      clientName: inv.clientName || source.clientName,
      clientIncomplete: false,
      paymentTerms: inv.paymentTerms || source.paymentTerms,
    };
    onSave((timesheets || []).map(x => x.id === updated.id ? updated : x));
    setSelected(updated);
    setView("list"); setSelected(null);
  }, [selected, timesheets, onAddInvoice, onSave]);

  const currentTS = selected ? ((timesheets||[]).find(t => t.id === selected.id) || selected) : null;

  if (view === "invoice-review" && currentTS)
    return <InvoiceReviewScreen timesheet={currentTS} profile={profile} clients={clients} onSaveClients={onSaveClients} invoices={invoices} onSave={saveInvoice} onUpdateTimesheet={updateTS} onBack={() => setView("detail")} onShowToast={onShowToast} />;

  if (view === "detail" && currentTS)
    return <TimesheetDetail timesheet={currentTS} profile={profile} linkedInvoice={(invoices || []).find(i => i.id === currentTS.invoiceId || i.fromTimesheetId === currentTS.id) || null} onUpdate={updateTS} onBack={() => { setView("list"); setSelected(null); }} onCreateInvoice={startInvoice} onShowToast={onShowToast} />;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Timesheets"
        description={`${(timesheets||[]).length} timesheet${(timesheets||[]).length !== 1 ? "s" : ""}`}
        actions={<Btn onClick={() => setShowNew(true)}><Plus size={14}/> New Timesheet</Btn>}
      />

      {showOnboarding && (
        <FirstRunOnboarding
          onSettings={() => onNavigate("settings")}
          onClients={() => onNavigate("clients")}
          onDismiss={onDismissOnboarding}
        />
      )}

      {!profile.defaultDayRate && (
        <AlertBox type="warning">Your day rate is not set. <strong>Go to Settings → Default Rates</strong> to set your day rate and included hours — overtime will be calculated automatically.</AlertBox>
      )}

      {showNew && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) { setShowNew(false); resetNewTimesheet(); } }}>
          <div className="bg-white rounded-xl p-5 sm:p-6 w-full max-w-4xl shadow-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-base font-bold text-gray-900 mb-1">New Timesheet</h2>
            <p className="text-sm text-gray-400 mb-4">Production and bill-to client can be different. Rates and rules fill from your business profile.</p>
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Inp label="Production / Project Name" value={newTs.productionName} onChange={e => setNewTs(p => ({ ...p, productionName: e.target.value }))} placeholder="e.g. Kokkedoor S4" autoFocus required />
                <Inp label="Role" value={newTs.role} onChange={e => setNewTs(p => ({ ...p, role: e.target.value }))} placeholder="e.g. Sound Mixer" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Inp label="Start Date" type="date" value={newTs.startDate} onChange={e => setNewTs(p => ({ ...p, startDate: e.target.value }))} />
                <SInp label="Currency" value={newTs.currency} onChange={e => setNewTs(p => ({ ...p, currency: e.target.value }))}>
                  {["ZAR","USD","GBP","EUR"].map(c => <option key={c} value={c}>{c}</option>)}
                </SInp>
              </div>
              <SInp label="Bill-to Client" value={newTs.clientChoice} onChange={e => setNewTs(p => ({ ...p, clientChoice: e.target.value }))}>
                <option value="unknown">Unknown / add later</option>
                {clients.map(c => <option key={c.id} value={c.id}>{clientName(c) || "Unnamed client"}{!clientBillingComplete(c) ? " (incomplete)" : ""}</option>)}
                <option value="new">Add new client</option>
              </SInp>
              {selectedClientForNew?.rateMemory && (
                <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 flex items-center justify-between gap-3">
                  <div className="text-sm text-blue-800">
                    <p className="font-semibold">Last used for {clientName(selectedClientForNew)}:</p>
                    <p className="text-xs mt-0.5">{fmtMoney(selectedClientForNew.rateMemory.dayRate, newTs.currency)}/day · {fmtMoney(selectedClientForNew.rateMemory.equipmentRental, newTs.currency)} kit · {OT_PRESETS[selectedClientForNew.rateMemory.overtimeRule]?.name}</p>
                  </div>
                  <Btn size="sm" variant="secondary" onClick={useLastClientRate}>Use last client rate</Btn>
                </div>
              )}
              {newTs.clientChoice === "unknown" && (
                <AlertBox type="warning">This timesheet can be created now, but the client will be marked incomplete until billing details are added.</AlertBox>
              )}
              {newTs.clientChoice === "new" && (
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">New Client</p>
                  <ClientFields client={newClient} onChange={setNewClient} />
                </div>
              )}
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <button type="button" onClick={() => setShowNewRates(v => !v)} className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-gray-800 hover:bg-gray-50">
                  <span>Rates for this production</span>
                  {showNewRates ? <ChevronUp size={15}/> : <ChevronDown size={15}/>}
                </button>
                {showNewRates && (
                  <div className="p-4 border-t border-gray-100 bg-gray-50/50">
                    <ProductionRateFields rates={newTs.rates} onChange={rates => setNewTs(p => ({ ...p, rates }))} currency={newTs.currency} />
                  </div>
                )}
              </div>
              <TxInp label="Notes" rows={2} value={newTs.notes} onChange={e => setNewTs(p => ({ ...p, notes: e.target.value }))} placeholder="Optional production or billing notes" />
            </div>
            <div className="flex gap-2 mt-4">
              <Btn className="flex-1 justify-center" onClick={createTS} disabled={!newTs.productionName.trim()}>Create Timesheet →</Btn>
              <Btn variant="secondary" onClick={() => { setShowNew(false); resetNewTimesheet(); }}>Cancel</Btn>
            </div>
          </div>
        </div>
      )}

      <Card>
        {(timesheets||[]).length === 0 ? (
          <div className="py-16 text-center">
            <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4"><Clock size={24} className="text-gray-300"/></div>
            <h3 className="text-base font-semibold text-gray-900 mb-1">No timesheets yet</h3>
            <p className="text-sm text-gray-400 mb-5 max-w-sm mx-auto">Create a timesheet to start tracking your work days and overtime.</p>
            <Btn onClick={() => setShowNew(true)}><Plus size={14}/> New Timesheet</Btn>
          </div>
        ) : (
          <div className={UI.tableWrap}>
            <table className={UI.table}>
              <thead><tr>{["Timesheet","Production","Bill To","Days","Status","Total",""].map((h,i) => <th key={i} className={`${UI.th} ${i >= 5 ? "text-right" : "text-left"}`}>{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-slate-100">
                {[...(timesheets||[])].sort((a,b) => new Date(b.createdAt).getTime()-new Date(a.createdAt).getTime()).map(ts => {
                  const effectiveProfile = profileForTimesheet(profile, ts);
                  const s = calcSummary(ts.entries||[], effectiveProfile);
                  const billTo = getTimesheetClient(ts, clients);
                  const col = ({ open:"gray", submitted:"blue", invoiced:"teal" } as Record<string,string>)[ts.status]||"gray";
                  const lbl = ({ open:"Open", submitted:"Submitted", invoiced:"Invoiced" } as Record<string,string>)[ts.status]||"Open";
                  const openTimesheet = () => { setSelected(ts); setView("detail"); };
                  return (
                    <tr key={ts.id} role="button" tabIndex={0} className={UI.rowClickable} onClick={openTimesheet} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openTimesheet(); } }}>
                      <td className={UI.td}><span className="text-sm font-semibold text-blue-700 group-hover:text-blue-800">{ts.timesheetNumber}</span></td>
                      <td className={`${UI.td} max-w-xs truncate font-medium text-slate-950`}>{ts.productionName||"—"}</td>
                      <td className={`${UI.td} text-slate-500`}>
                        <div className="flex items-center gap-2">
                          <span className="max-w-[220px] truncate">{clientName(billTo) || ts.clientName || "Unknown / add later"}</span>
                          {(!billTo || !clientBillingComplete(billTo)) && <Badge color="amber">Incomplete</Badge>}
                        </div>
                      </td>
                      <td className={`${UI.td} text-slate-500`}>{(ts.entries||[]).length}</td>
                      <td className={UI.td}><Badge color={col}>{lbl}</Badge></td>
                      <td className={`${UI.td} text-right font-semibold text-slate-950 tabular-nums`}>{fmtMoney(s.grandTotal, ts.currency||cur)}</td>
                      <td className={`${UI.td} text-right`}><IconButton label={`Delete ${ts.timesheetNumber}`} variant="danger" onClick={e => { e.stopPropagation(); deleteTS(ts.id); }}><Trash2 size={14}/></IconButton></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// INVOICES PAGE
// ═══════════════════════════════════════════════════════════════════════════

function InvoicesPage({ invoices, timesheets, clients, profile, onSave, onSaveTimesheets, onSaveClients, onSaveProfile, onShowToast, onViewTimesheets }: {
  invoices: Invoice[];
  timesheets: Timesheet[];
  clients: Client[];
  profile: Profile;
  onSave: (invoices: Invoice[]) => void;
  onSaveTimesheets: (timesheets: Timesheet[]) => void;
  onSaveClients: (clients: Client[]) => void | Promise<void>;
  onSaveProfile: (profile: Profile) => void;
  onShowToast: (msg: string, type?: ToastType) => void;
  onViewTimesheets: () => void;
}) {
  const [sel, setSel] = useState<string | null>(null);
  const [editingInvoice, setEditingInvoice] = useState(false);
  const [protectedEditMessage, setProtectedEditMessage] = useState("");
  const [deleteCandidate, setDeleteCandidate] = useState<Invoice | null>(null);
  const [invoiceActionMessage, setInvoiceActionMessage] = useState("");
  const sortedInvoices = [...(invoices||[])].sort((a,b)=>new Date(b.createdAt).getTime()-new Date(a.createdAt).getTime());
  const inv = sel ? sortedInvoices.find(i => i.id === sel) || null : null;
  const updateInvoice = (next: Invoice) => onSave((invoices || []).map(i => i.id === next.id ? next : i));
  const summaryCurrency = profile.defaultCurrency || sortedInvoices[0]?.currency || "ZAR";
  const currentMonth = todayStr().slice(0, 7);
  const receivableStatuses = ["sent", "partial", "overdue"];
  const paidForInvoice = (i: Invoice) => safe(i.paidAmount, normalizeInvoiceStatus(i.status) === "paid" ? i.total : 0);
  const outstandingTotal = sortedInvoices
    .filter(i => receivableStatuses.includes(normalizeInvoiceStatus(i.status)))
    .reduce((sum, i) => sum + invoiceBalance(i), 0);
  const paidThisMonth = sortedInvoices
    .filter(i => (i.paidDate || (normalizeInvoiceStatus(i.status) === "paid" ? i.issueDate : "") || "").slice(0, 7) === currentMonth && paidForInvoice(i) > 0)
    .reduce((sum, i) => sum + paidForInvoice(i), 0);
  const overdueInvoices = sortedInvoices.filter(i => {
    const status = normalizeInvoiceStatus(i.status);
    return status === "overdue" || (!!i.dueDate && i.dueDate < todayStr() && ["sent", "partial"].includes(status));
  });
  const overdueTotal = overdueInvoices.reduce((sum, i) => sum + invoiceBalance(i), 0);
  const draftCount = sortedInvoices.filter(i => normalizeInvoiceStatus(i.status) === "draft").length;

  const invoiceDeleteBlockReason = (invoice: Invoice) => {
    const status = normalizeInvoiceStatus(invoice.status);
    const label = INVOICE_STATUS[status].label;
    if (invoiceHasRecordedPayment(invoice)) {
      return "This invoice has recorded payments. Remove or reverse the payments and cancel the invoice before deleting it.";
    }
    if (!["draft", "cancelled"].includes(status)) {
      return `Invoice ${invoice.invoiceNumber || "not numbered"} cannot be deleted because its status is ${label}. Cancel the invoice first if it should no longer be active.`;
    }
    return "";
  };

  const requestDeleteInvoice = (invoice: Invoice) => {
    const blockReason = invoiceDeleteBlockReason(invoice);
    if (blockReason) {
      setInvoiceActionMessage(blockReason);
      setDeleteCandidate(null);
      return;
    }
    setInvoiceActionMessage("");
    setDeleteCandidate(invoice);
  };

  const confirmDeleteInvoice = () => {
    if (!deleteCandidate) return;
    const invoiceToDelete = deleteCandidate;
    const remainingInvoices = (invoices || []).filter(i => i.id !== invoiceToDelete.id);
    const nextTimesheets = (timesheets || []).map(ts => {
      const linkedToDeleted = ts.invoiceId === invoiceToDelete.id || ts.id === invoiceToDelete.fromTimesheetId;
      if (!linkedToDeleted) return ts;
      const remainingLinked = remainingInvoices.find(i => i.fromTimesheetId === ts.id || i.id === ts.invoiceId);
      if (remainingLinked) return { ...ts, invoiceId: remainingLinked.id, status: "invoiced" as const };
      return { ...ts, invoiceId: undefined, status: ts.status === "invoiced" ? "open" as const : ts.status };
    });
    onSave(remainingInvoices);
    onSaveTimesheets(nextTimesheets);
    onSaveProfile(rememberInvoiceNumber(profile, invoiceToDelete.invoiceNumber));
    setDeleteCandidate(null);
    setEditingInvoice(false);
    setProtectedEditMessage("");
    setInvoiceActionMessage("");
    setSel(null);
    onShowToast(`Invoice ${invoiceToDelete.invoiceNumber || "not numbered"} was deleted.`, "info");
  };

  if (inv) {
    const c = invoiceClient(inv);
    const sourceTimesheet = (timesheets || []).find(t => t.id === inv.fromTimesheetId) || null;
    const currentStatus = normalizeInvoiceStatus(inv.status);
    const isDraft = currentStatus === "draft";
    const sellerProfile = sellerProfileForInvoice(inv, profile);
    const bd = inv.banking || {};
    const bankRows = ([["Account Holder",bd.accountName],["Bank",bd.bankName],["Account No.",bd.accountNumber],["Branch",bd.branchCode],bd.swift&&["SWIFT",bd.swift],bd.iban&&["IBAN",bd.iban],bd.reference&&["Reference",bd.reference]] as [string,string][]).filter(r=>r&&r[1]);
    const paidAmount = safe(inv.paidAmount, 0);
    const balanceDue = invoiceBalance(inv);
    const statusMeta = INVOICE_STATUS[currentStatus];
    const displayLogo = invoiceLogoForDisplay(inv, sellerProfile);

    if (editingInvoice) {
      return (
        <InvoiceEditScreen
          key={inv.id}
          invoice={inv}
          sourceTimesheet={sourceTimesheet}
          profile={profile}
          clients={clients}
          invoices={invoices}
          onSaveClients={onSaveClients}
          onSave={next => { updateInvoice(next); setEditingInvoice(false); setSel(next.id); }}
          onCancel={() => setEditingInvoice(false)}
          onShowToast={onShowToast}
        />
      );
    }

    const savePatch = (patch: Partial<Invoice>) => {
      const next = normalizeInvoice({ ...inv, ...patch });
      updateInvoice(next);
    };

    const openDraftEditor = () => {
      if (!isDraft) {
        setProtectedEditMessage(`Invoice ${inv.invoiceNumber || "not numbered"} is protected because its status is ${statusMeta.label}. Change it back to Draft before editing.`);
        return;
      }
      setProtectedEditMessage("");
      setEditingInvoice(true);
      setTimeout(() => document.getElementById("edit-invoice-client-panel")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
    };

    const validateDraftInvoiceBeforeFinalising = () => {
      const errors = clientBillingErrors(c);
      if (Object.keys(errors).length) {
        alert(`${inv.clientName || "This client"} is missing: ${clientBillingMissingLabels(errors).join(", ")}.`);
        setEditingInvoice(true);
        return false;
      }
      if (c?.poRequired && !inv.poNumber) {
        alert("This client requires a PO number. Add it before finalising the invoice.");
        setEditingInvoice(true);
        return false;
      }
      if (!(inv.lineItems || []).length) {
        alert("This invoice has no billable items.");
        return false;
      }
      return true;
    };

    const exportInvoice = async () => {
      if (isDraft && !validateDraftInvoiceBeforeFinalising()) return;
      if (c?.poRequired && !inv.poNumber) {
        alert("This client requires a PO number before exporting this invoice.");
        return;
      }
      try {
        await downloadInvoicePdf(inv, profile);
        onShowToast("Invoice PDF downloaded");
      } catch {
        onShowToast("Invoice PDF could not be generated. Please try again.", "error");
      }
    };

    const printInvoiceAction = () => {
      if (isDraft && !validateDraftInvoiceBeforeFinalising()) return;
      if (c?.poRequired && !inv.poNumber) {
        alert("This client requires a PO number before printing this invoice.");
        return;
      }
      printInvoice(inv, profile);
    };

    const changeStatus = (status: InvoiceStatus) => {
      const nextStatus = normalizeInvoiceStatus(status);
      const finalisingDraft = isDraft && nextStatus !== "draft";
      if (finalisingDraft && !validateDraftInvoiceBeforeFinalising()) return;
      if (!isDraft && nextStatus === "draft" && !confirm(`Change invoice ${inv.invoiceNumber || "not numbered"} back to Draft? Draft invoices can be edited again.`)) return;
      const logoPatch = finalisingDraft ? { sellerLogoDataUrl: profile.businessLogoDataUrl || inv.sellerLogoDataUrl || "", sellerSnapshot: sellerSnapshotFromProfile(profile) } : {};
      if (status === "paid") {
        savePatch({ status, paidAmount: inv.total, paidDate: inv.paidDate || todayStr(), balanceDue: 0, ...logoPatch });
        onShowToast("Invoice marked paid");
        return;
      }
      savePatch({ status, ...logoPatch });
    };

    const markPaid = () => changeStatus("paid");

    return (
      <div className="space-y-5">
        <PageHeader
          title={inv.invoiceNumber || "Invoice not numbered"}
          badge={<Badge color={statusMeta.color}>{statusMeta.label}</Badge>}
          description={<>
            <span>{inv.clientName || "No client set"}</span>
            {inv.productionName && <span> · Production: {inv.productionName}</span>}
            <span> · Total <strong className="text-slate-950 tabular-nums">{fmtMoney(inv.total, inv.currency)}</strong></span>
            <span> · Balance due <strong className={`tabular-nums ${balanceDue > 0 ? "text-red-700" : "text-emerald-700"}`}>{fmtMoney(balanceDue, inv.currency)}</strong></span>
          </>}
          secondaryActions={<Btn variant="secondary" size="sm" onClick={() => { setEditingInvoice(false); setProtectedEditMessage(""); setSel(null); }}>{"\u2190"} Back to Invoices</Btn>}
          actions={<>
            <Btn variant="secondary" onClick={openDraftEditor}><Pencil size={14}/> Edit</Btn>
            <Btn variant="secondary" onClick={exportInvoice}><FileText size={14}/> Download Invoice</Btn>
            <Btn variant="secondary" onClick={printInvoiceAction}><FileText size={14}/> Print Invoice</Btn>
            <Btn variant="success" onClick={markPaid} disabled={normalizeInvoiceStatus(inv.status) === "paid"}><CheckCircle size={14}/> Mark Paid</Btn>
            <Btn variant="danger" onClick={() => requestDeleteInvoice(inv)}><Trash2 size={14}/> Delete Invoice</Btn>
          </>}
        />
        {invoiceActionMessage && <AlertBox type="warning">{invoiceActionMessage}</AlertBox>}
        {protectedEditMessage && <AlertBox type="warning">{protectedEditMessage}</AlertBox>}
        {!isDraft && <AlertBox type="info">This invoice is protected because its status is {statusMeta.label}. Change it back to Draft before editing invoice details or line items.</AlertBox>}
        {deleteCandidate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="delete-invoice-title" onClick={e => { if (e.target === e.currentTarget) setDeleteCandidate(null); }}>
            <Card className="w-full max-w-lg p-5 sm:p-6">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-700"><AlertTriangle size={20}/></div>
                <div className="min-w-0">
                  <h2 id="delete-invoice-title" className="text-lg font-bold text-slate-950">Delete invoice {deleteCandidate.invoiceNumber || "not numbered"}?</h2>
                  <div className="mt-3 space-y-1 text-sm text-slate-600">
                    <p><strong className="text-slate-800">Client:</strong> {deleteCandidate.clientName || "Not set"}</p>
                    <p><strong className="text-slate-800">Production:</strong> {deleteCandidate.productionName || "Not set"}</p>
                    <p><strong className="text-slate-800">Total:</strong> {fmtMoney(deleteCandidate.total, deleteCandidate.currency)}</p>
                  </div>
                  <p className="mt-4 text-sm font-semibold text-red-700">This permanently removes the invoice from CrewQuote. This cannot be undone.</p>
                </div>
              </div>
              <div className="mt-6 flex flex-wrap justify-end gap-2">
                <Btn variant="secondary" onClick={() => setDeleteCandidate(null)}>Cancel</Btn>
                <Btn variant="danger" onClick={confirmDeleteInvoice}><Trash2 size={14}/> Delete Invoice</Btn>
              </div>
            </Card>
          </div>
        )}

        <div id="invoice-edit-panel">
        <Card className="p-5 sm:p-6 max-w-5xl">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">Status & Payment</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <SInp label="Status" value={inv.status} onChange={e => changeStatus(e.target.value as InvoiceStatus)}>
              {(Object.entries(INVOICE_STATUS) as [InvoiceStatus, { label: string; color: string }][]).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </SInp>
            <Inp label="Paid Amount" type="number" min="0" value={String(inv.paidAmount || "")} onChange={e => savePatch({ paidAmount: safe(e.target.value, 0) })} />
            <Inp label="Paid Date" type="date" value={inv.paidDate || ""} onChange={e => savePatch({ paidDate: e.target.value })} />
            <div>
              <p className="text-xs font-bold text-gray-300 uppercase tracking-wider mb-1">Balance Due</p>
              <p className="text-sm font-semibold">{fmtMoney(balanceDue, inv.currency)}</p>
            </div>
            <div>
              <p className="text-xs font-bold text-gray-300 uppercase tracking-wider mb-1">Current Status</p>
              <Badge color={statusMeta.color}>{statusMeta.label}</Badge>
            </div>
          </div>
          {isDraft && <p className="mt-4 text-sm text-slate-500">Use Edit to change invoice reference, PO number, dates, line items, expenses, payment terms, notes, or client billing details.</p>}
        </Card>
        </div>

        <Card className="p-5 sm:p-8 max-w-5xl">
          <div className="flex justify-between items-start mb-8">
            <div className="min-w-0">
              {displayLogo && <img src={displayLogo} alt="Business logo" className="mb-4 max-h-20 max-w-[220px] object-contain" />}
              <p className="font-bold text-base">{inv.companyName||sellerProfile.companyName||sellerProfile.fullName}</p>
              <p className="text-gray-500 text-sm">{inv.crewName || sellerProfile.fullName}</p>
              <p className="text-gray-500 text-sm">{inv.role || sellerProfile.role}</p>
              {sellerProfile.email&&<p className="text-gray-500 text-sm">{sellerProfile.email}</p>}
              {sellerProfile.vatRegistered&&sellerProfile.vatNumber&&<p className="text-gray-500 text-sm">VAT: {sellerProfile.vatNumber}</p>}
            </div>
            <div className="text-right"><h2 className="text-3xl font-bold tracking-tight uppercase">{sellerProfile.invoiceLabel || "Invoice"}</h2><p className="text-gray-400 mt-1 text-sm">{inv.invoiceNumber}</p>{inv.poNumber&&<p className="text-gray-400 text-xs mt-0.5">PO: {inv.poNumber}</p>}</div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div><p className="text-xs font-bold text-gray-300 uppercase tracking-wider mb-1">Bill To</p><p className="font-medium">{inv.clientName||"—"}</p>{c?.contactPerson&&<p className="text-sm text-gray-500">{c.contactPerson}</p>}{c?.billingAddress&&<p className="text-sm text-gray-500 whitespace-pre-line">{c.billingAddress}</p>}{c?.vatNumber&&<p className="text-sm text-gray-500">VAT: {c.vatNumber}</p>}</div>
            <div className="text-right"><p className="text-xs font-bold text-gray-300 uppercase tracking-wider mb-1">Issue Date</p><p className="font-medium">{fmtDate(inv.issueDate)}</p>{inv.dueDate&&<><p className="text-xs font-bold text-gray-300 uppercase tracking-wider mb-1 mt-3">Due Date</p><p className="font-medium">{fmtDate(inv.dueDate)}</p></>}</div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6 p-3 rounded-lg border border-gray-100 bg-gray-50">
            <div><p className="text-[10px] font-bold text-gray-300 uppercase tracking-wider">Production</p><p className="text-sm font-medium">{inv.productionName || "Not set"}</p></div>
            <div><p className="text-[10px] font-bold text-gray-300 uppercase tracking-wider">Timesheet</p><p className="text-sm font-medium">{inv.timesheetNumber || "Not set"}</p></div>
            <div><p className="text-[10px] font-bold text-gray-300 uppercase tracking-wider">Dates</p><p className="text-sm font-medium">{inv.timesheetDates || "Not set"}</p></div>
          </div>
          <div className="border-t-2 border-gray-900 mb-1">
            <div className="grid grid-cols-12 gap-3 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider"><div className="col-span-6">Description</div><div className="col-span-2 text-right">Qty</div><div className="col-span-2 text-right">Unit</div><div className="col-span-2 text-right">Amount</div></div>
          </div>
          {(inv.lineItems||[]).map(item => (
            <div key={item.id} className={`grid grid-cols-12 gap-3 py-2.5 border-b border-gray-100 ${item.isExtra ? "bg-gray-50" : ""}`}>
              <div className="col-span-6 text-sm text-gray-700">{item.description}{item.isExtra&&<span className="ml-2 text-xs text-gray-400">extra</span>}</div>
              <div className="col-span-2 text-sm text-right text-gray-400 tabular-nums">{item.quantity > 1 ? item.quantity : ""}</div>
              <div className="col-span-2 text-sm text-right text-gray-400 tabular-nums">{fmtMoney(item.unitPrice || 0, inv.currency)}</div>
              <div className="col-span-2 text-sm font-medium text-right tabular-nums">{fmtMoney(item.amount, inv.currency)}</div>
            </div>
          ))}
          <div className="flex justify-end mt-5">
            <div className="w-56 space-y-1.5">
              <div className="flex justify-between text-sm text-gray-500">{sellerProfile.vatRegistered ? "Subtotal excl. VAT" : "Subtotal"}<span className="tabular-nums font-medium text-gray-900">{fmtMoney(inv.subtotal,inv.currency)}</span></div>
              {inv.vat>0&&<div className="flex justify-between text-sm text-gray-500">VAT ({inv.vat}%)<span className="tabular-nums font-medium text-gray-900">{fmtMoney(inv.vatAmount,inv.currency)}</span></div>}
              <div className="flex justify-between font-bold text-gray-900 border-t-2 border-gray-900 pt-2.5 text-base">{sellerProfile.vatRegistered ? "TOTAL INCL. VAT" : "TOTAL DUE"}<span className="tabular-nums">{fmtMoney(inv.total,inv.currency)}</span></div>
              {paidAmount > 0&&<div className="flex justify-between text-sm text-gray-500">Paid<span className="tabular-nums font-medium text-gray-900">{fmtMoney(paidAmount,inv.currency)}</span></div>}
              {paidAmount > 0&&<div className="flex justify-between text-sm font-semibold text-gray-900">Balance Due<span className="tabular-nums">{fmtMoney(balanceDue,inv.currency)}</span></div>}
            </div>
          </div>
          {(inv.detailMode === "summary_timesheet" && (inv.timesheetBreakdown || []).length > 0)&&<div className="mt-8 pt-6 border-t border-gray-100"><p className="text-xs font-bold text-gray-300 uppercase tracking-wider mb-4">Attached Timesheet Breakdown</p>{(inv.timesheetBreakdown || []).map(item => <div key={item.id} className="grid grid-cols-12 gap-3 py-2 border-b border-gray-100"><div className="col-span-8 text-sm text-gray-700">{item.description}</div><div className="col-span-2 text-sm text-right text-gray-400">{item.quantity > 1 ? item.quantity : ""}</div><div className="col-span-2 text-sm text-right font-medium">{fmtMoney(item.amount, inv.currency)}</div></div>)}</div>}
          {bankRows.length>0&&<div className="mt-8 pt-6 border-t border-gray-100"><p className="text-xs font-bold text-gray-300 uppercase tracking-wider mb-4">Banking Details</p><div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{bankRows.map(([k,v])=><div key={k}><p className="text-xs font-semibold text-gray-300 uppercase tracking-wider">{k}</p><p className="text-sm font-medium mt-0.5">{v}</p></div>)}</div></div>}
          {(inv.paymentTerms || inv.paymentNotes)&&<div className="mt-6 pt-5 border-t border-gray-100"><p className="text-xs font-bold text-gray-300 uppercase tracking-wider mb-2">Payment Terms</p><p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">{inv.paymentTerms || inv.paymentNotes}</p></div>}
          {inv.notes&&<div className="mt-6 pt-5 border-t border-gray-100"><p className="text-xs font-bold text-gray-300 uppercase tracking-wider mb-2">Notes</p><p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">{inv.notes}</p></div>}
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Invoices"
        description={`${(invoices||[]).length} invoice${(invoices||[]).length !== 1 ? "s" : ""}`}
      />
      {sortedInvoices.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          <MetricCard label="Outstanding" value={fmtMoney(outstandingTotal, summaryCurrency)} detail="Unpaid balances" icon={Receipt} tone="blue" />
          <MetricCard label="Paid This Month" value={fmtMoney(paidThisMonth, summaryCurrency)} detail="Invoices marked paid" icon={CheckCircle} tone="green" />
          <MetricCard label="Overdue" value={fmtMoney(overdueTotal, summaryCurrency)} detail={`${overdueInvoices.length} invoice${overdueInvoices.length !== 1 ? "s" : ""}`} icon={AlertTriangle} tone="red" />
          <MetricCard label="Drafts" value={draftCount} detail="Waiting to send" icon={FileText} tone="slate" />
        </div>
      )}
      <Card>
        {(invoices||[]).length === 0 ? (
          <div className="py-16 text-center">
            <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4"><Receipt size={24} className="text-gray-300"/></div>
            <h3 className="text-base font-semibold text-gray-900 mb-1">No invoices yet</h3>
            <p className="text-sm text-gray-400 mb-5 max-w-sm mx-auto">Invoices are generated from completed timesheets.</p>
            <Btn variant="secondary" onClick={onViewTimesheets}><Clock size={14}/> View Timesheets</Btn>
          </div>
        ) : (
          <div className={UI.tableWrap}>
            <table className={UI.table}><thead><tr>{["Invoice","Client / Production","PO","Due Date","Status","Total","Balance"].map((h,i)=><th key={i} className={`${UI.th} ${i>=5?"text-right":"text-left"}`}>{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100">{sortedInvoices.map(i=>{const st=INVOICE_STATUS[normalizeInvoiceStatus(i.status)];const bal=invoiceBalance(i);const openInvoice=()=>{setEditingInvoice(false);setProtectedEditMessage("");setSel(i.id);};return(<tr key={i.id} role="button" tabIndex={0} className={UI.rowClickable} onClick={openInvoice} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openInvoice(); } }}><td className={UI.td}><p className="text-sm font-semibold text-blue-700 group-hover:text-blue-800">{i.invoiceNumber || "Not set"}</p><p className="text-xs text-slate-400 mt-0.5">{fmtDate(i.issueDate)}</p></td><td className={UI.td}><p className="max-w-[280px] truncate text-sm font-medium text-slate-950">{i.clientName||"—"}</p><p className="max-w-[280px] truncate text-xs text-slate-400 mt-0.5">{i.productionName || "No production set"}</p></td><td className={`${UI.td} text-slate-400`}>{i.poNumber || "—"}</td><td className={`${UI.td} text-slate-500`}>{i.dueDate ? fmtDate(i.dueDate) : "Not set"}</td><td className={UI.td}><Badge color={st.color}>{st.label}</Badge></td><td className={`${UI.td} text-right font-semibold text-slate-950 tabular-nums`}>{fmtMoney(i.total,i.currency)}</td><td className={`${UI.td} text-right font-semibold tabular-nums ${bal > 0 ? "text-slate-950" : "text-emerald-700"}`}>{fmtMoney(bal,i.currency)}</td></tr>);})}</tbody></table>
          </div>
        )}
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// LAYOUT
// ═══════════════════════════════════════════════════════════════════════════

const NAV = [{ id:"timesheets",label:"Timesheets",icon:Clock },{ id:"clients",label:"Clients",icon:Users },{ id:"invoices",label:"Invoices",icon:Receipt },{ id:"settings",label:"Settings",icon:Settings },{ id:"account",label:"Account",icon:UserCircle }];

type FeedbackType = "Bug" | "Calculation issue" | "Feature request" | "Confusing workflow" | "Other";

interface FeedbackDraft {
  type: FeedbackType;
  happened: string;
  expected: string;
  contactEmail: string;
  includeTechnical: boolean;
}

const FEEDBACK_TYPES: FeedbackType[] = ["Bug", "Calculation issue", "Feature request", "Confusing workflow", "Other"];

function feedbackMessage(page: string, draft: FeedbackDraft, timestamp: string) {
  return [
    `Feedback type: ${draft.type}`,
    "",
    "What happened?",
    draft.happened || "",
    "",
    "What did you expect?",
    draft.expected || "",
    "",
    draft.contactEmail ? `Contact email: ${draft.contactEmail}` : "Contact email: Not provided",
    "",
    ...(draft.includeTechnical ? [
      "Technical information:",
      `App version: ${APP_VERSION}`,
      `Current page: /${page}`,
      `Browser: ${navigator.userAgent || "Unknown"}`,
      `Timestamp: ${timestamp}`,
    ] : []),
  ].join("\n");
}

function feedbackMailto(page: string, draft: FeedbackDraft, timestamp: string) {
  const subject = `CrewQuote Pro Beta Feedback – v${APP_VERSION}`;
  const body = feedbackMessage(page, draft, timestamp);
  return `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function FeedbackModal({ page, onClose }: { page: string; onClose: () => void }) {
  const [draft, setDraft] = useState<FeedbackDraft>({ type: "Bug", happened: "", expected: "", contactEmail: "", includeTechnical: true });
  const [timestamp] = useState(() => new Date().toISOString());
  const [notice, setNotice] = useState("");
  const [manualCopy, setManualCopy] = useState("");
  const modalRef = useRef<HTMLDivElement | null>(null);
  const firstFieldRef = useRef<HTMLSelectElement | null>(null);
  const message = feedbackMessage(page, draft, timestamp);

  useEffect(() => {
    firstFieldRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const keepFocusInside = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Tab") return;
    const focusable = Array.from(modalRef.current?.querySelectorAll<HTMLElement>('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])') || []).filter(el => !el.hasAttribute("disabled"));
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const openEmail = () => {
    const a = document.createElement("a");
    a.href = feedbackMailto(page, draft, timestamp);
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setNotice("If your email app did not open, use Copy Feedback and send it manually.");
  };

  const copyFeedback = async () => {
    try {
      await navigator.clipboard?.writeText(message);
      setNotice("Feedback copied to clipboard.");
      setManualCopy("");
    } catch {
      setNotice("Clipboard access was blocked. Select and copy the feedback text below.");
      setManualCopy(message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="feedback-title" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <Card ref={modalRef} onKeyDown={keepFocusInside} className="w-full max-w-2xl p-5 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 id="feedback-title" className="text-lg font-bold text-slate-950">Send CrewQuote Feedback</h2>
            <p className="mt-1 text-sm text-slate-500">This does not include banking details, client records, invoice values, timesheets, or localStorage data.</p>
          </div>
          <Btn variant="ghost" size="sm" onClick={onClose}>Cancel</Btn>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4">
          <Fld label="Feedback Type">
            <select ref={firstFieldRef} className={base} value={draft.type} onChange={e => setDraft(p => ({ ...p, type: e.target.value as FeedbackType }))}>
              {FEEDBACK_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
            </select>
          </Fld>
          <TxInp label="What happened?" rows={4} value={draft.happened} onChange={e => setDraft(p => ({ ...p, happened: e.target.value }))} placeholder="Describe the issue or idea." />
          <TxInp label="What did you expect?" rows={3} value={draft.expected} onChange={e => setDraft(p => ({ ...p, expected: e.target.value }))} placeholder="What should CrewQuote have done instead?" />
          <Inp label="Optional Contact Email" type="email" value={draft.contactEmail} onChange={e => setDraft(p => ({ ...p, contactEmail: e.target.value }))} placeholder="you@example.com" />
          <label className="flex items-start gap-3 rounded-lg border border-slate-200 p-3 text-sm text-slate-700">
            <input type="checkbox" checked={draft.includeTechnical} onChange={e => setDraft(p => ({ ...p, includeTechnical: e.target.checked }))} className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
            <span>
              <span className="block font-semibold">Include technical information</span>
              <span className="mt-1 block text-xs leading-relaxed text-slate-500">App version {APP_VERSION}, current page /{page}, browser, and timestamp {timestamp}.</span>
            </span>
          </label>
          {notice && <AlertBox type={notice.includes("copied") ? "success" : "info"}>{notice}</AlertBox>}
          {manualCopy && (
            <TxInp label="Copy Feedback Manually" rows={8} value={manualCopy} readOnly onFocus={e => e.currentTarget.select()} />
          )}
        </div>

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
          <Btn variant="secondary" onClick={openEmail}>Open Email App</Btn>
          <Btn onClick={copyFeedback}><Copy size={14}/> Copy Feedback</Btn>
        </div>
      </Card>
    </div>
  );
}

function Layout({ page, setPage, profile, children }: { page:string; setPage:(p:string)=>void; profile:Profile; children:React.ReactNode }) {
  const initial = (profile.fullName||"?").charAt(0).toUpperCase();
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const feedbackButtonRef = useRef<HTMLButtonElement | null>(null);
  const closeFeedback = useCallback(() => {
    setFeedbackOpen(false);
    setTimeout(() => feedbackButtonRef.current?.focus(), 0);
  }, []);
  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      <aside className="w-52 flex flex-col flex-shrink-0 bg-slate-900">
        <div className="flex items-center gap-2.5 p-5 border-b border-slate-700/60">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-sm flex-shrink-0"><Film size={14} className="text-white"/></div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="text-white font-bold text-[13px] leading-tight">CrewQuote Pro</p>
              <Badge color="blue">Beta</Badge>
            </div>
            <p className="text-slate-500 text-[10px]">Freelancer Timesheet</p>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-0.5">
          {NAV.map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" onClick={() => setPage(id)} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-colors ${UI.focus} ${page===id?"bg-blue-600 text-white":"text-slate-400 hover:text-white hover:bg-slate-800"}`}>
              <Icon size={16}/>{label}
            </button>
          ))}
        </nav>
        <div className="p-4 border-t border-slate-700/60">
          <div className="mb-3 rounded-lg border border-slate-700/70 bg-slate-800/45 p-3">
            <p className="text-[11px] font-semibold text-slate-200">CrewQuote Pro Beta</p>
            <p className="mt-0.5 text-[10px] text-slate-500">Version {APP_VERSION}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <button ref={feedbackButtonRef} type="button" aria-label="Send CrewQuote Pro beta feedback" onClick={() => setFeedbackOpen(true)} className={`inline-flex min-h-8 items-center justify-center rounded-md bg-slate-700 px-2.5 text-[11px] font-semibold text-slate-100 transition-colors hover:bg-slate-600 ${UI.focus}`}>Send Feedback</button>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">{initial}</div>
            <div className="min-w-0"><p className="text-white text-xs font-medium truncate">{profile.fullName||"Your Name"}</p><p className="text-slate-500 text-[10px] truncate">{profile.role||"Set role in Settings"}</p></div>
          </div>
        </div>
      </aside>
      <div className="flex-1 flex flex-col overflow-hidden">
        <main className="flex-1 overflow-auto px-3 py-4 sm:px-5 lg:px-8 xl:px-9">
          <div className="mx-auto w-full max-w-[1560px]">{children}</div>
        </main>
      </div>
      {feedbackOpen && <FeedbackModal page={page} onClose={closeFeedback} />}
    </div>
  );
}

class ErrorBoundary extends Component<{ children: React.ReactNode }, { error: Error | null; componentStack: string; copied: boolean; detailsOpen: boolean }> {
  state = { error: null as Error | null, componentStack: "", copied: false, detailsOpen: false };

  static getDerivedStateFromError(error: Error) {
    return { error, componentStack: "", copied: false, detailsOpen: false };
  }

  componentDidCatch(_error: Error, info: React.ErrorInfo) {
    this.setState({ componentStack: info.componentStack || "" });
  }

  exportEmergencyBackup = () => {
    try {
      downloadBackup(appDataFromRawStorage(false), "crewquote-emergency-backup");
    } catch (err) {
      alert(err instanceof Error ? err.message : "CrewQuote could not export an emergency backup from this browser.");
    }
  };

  copyErrorDetails = async () => {
    const details = [
      `CrewQuote Pro Beta ${APP_VERSION}`,
      this.state.error?.name || "Error",
      this.state.error?.message || "Unknown error",
      this.state.componentStack,
    ].filter(Boolean).join("\n\n");
    try {
      await navigator.clipboard?.writeText(details);
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 2000);
    } catch {
      window.prompt("Copy these error details", details);
    }
  };

  resetApp = () => {
    const ok = confirm("This permanently removes CrewQuote data stored in this browser. Export a backup first.");
    if (!ok) return;
    try {
      clearCrewQuoteStorage();
      window.location.reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : "CrewQuote could not reset local data.");
    }
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="min-h-screen bg-slate-50 px-4 py-10">
        <div className="mx-auto max-w-2xl">
          <Card className="p-6 sm:p-8">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-700"><AlertTriangle size={22}/></div>
              <div className="min-w-0">
                <p className="text-xl font-bold text-slate-950">CrewQuote encountered a problem</p>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  The app hit an unexpected screen error. Saved data has not intentionally been removed. Reload first, or export an emergency backup before considering a reset.
                </p>
              </div>
            </div>
            <div className="mt-6 flex flex-wrap gap-2">
              <Btn onClick={() => window.location.reload()}>Reload App</Btn>
              <Btn variant="secondary" onClick={this.exportEmergencyBackup}><FileText size={14}/> Export Emergency Backup</Btn>
              <Btn variant="secondary" onClick={this.copyErrorDetails}><Copy size={14}/> {this.state.copied ? "Copied" : "Copy Error Details"}</Btn>
            </div>
            <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50">
              <button type="button" className={`flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold text-slate-700 ${UI.focus}`} onClick={() => this.setState(s => ({ detailsOpen: !s.detailsOpen }))}>
                Error details
                {this.state.detailsOpen ? <ChevronUp size={15}/> : <ChevronDown size={15}/>}
              </button>
              {this.state.detailsOpen && (
                <pre className="max-h-64 overflow-auto border-t border-slate-200 p-4 text-xs leading-relaxed text-slate-600 whitespace-pre-wrap">
                  {`${this.state.error.name}: ${this.state.error.message}\n\n${this.state.componentStack}`}
                </pre>
              )}
            </div>
            <div className="mt-6 border-t border-slate-200 pt-5">
              <p className="text-sm font-semibold text-slate-800">Reset Application</p>
              <p className="mt-1 text-sm leading-relaxed text-slate-500">Use this only after exporting a backup or when local browser data is intentionally disposable.</p>
              <Btn variant="danger" className="mt-3" onClick={this.resetApp}>Reset Application</Btn>
            </div>
          </Card>
        </div>
      </div>
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// APP ROOT
// ═══════════════════════════════════════════════════════════════════════════

function Phase3MigrationPanel({ summary, busy, error, success, onImport, onDismiss }: {
  summary: Phase3MigrationSummary;
  busy: boolean;
  error: string;
  success: string;
  onImport: () => void;
  onDismiss?: () => void;
}) {
  return (
    <Card className="p-5 sm:p-6 border-blue-200 bg-blue-50/40">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="text-base font-bold text-slate-950">Import browser data into your account?</p>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-slate-600">
            CrewQuote found business settings and clients stored in this browser. Settings and clients will be copied into your account now. Timesheets and invoices remain stored in this browser until the next migration phase.
          </p>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <MetricCard label="Business settings" value={summary.businessSettingsFound ? "Yes" : "No"} detail="Account import" icon={Settings} tone="blue" />
            <MetricCard label="Clients" value={summary.clientCount} detail="Bill-to records" icon={Users} tone="slate" />
            <MetricCard label="Rate memories" value={summary.rateMemoryCount} detail="Client last-used rates" icon={Zap} tone="slate" />
            <MetricCard label="Timesheets" value={summary.timesheetCount} detail="Remain local" icon={Clock} tone="orange" />
            <MetricCard label="Invoices" value={summary.invoiceCount} detail="Remain local" icon={Receipt} tone="orange" />
          </div>
          <p className="mt-4 text-sm leading-relaxed text-slate-600">
            Existing browser data will not be deleted. CrewQuote will download a safety backup before cloud import starts and associate remaining local records in this browser with this account.
          </p>
          {error && <div className="mt-4"><AlertBox type="error">{error}</AlertBox></div>}
          {success && <div className="mt-4"><AlertBox type="success">{success}</AlertBox></div>}
        </div>
        <div className="flex flex-shrink-0 flex-wrap gap-2 lg:justify-end">
          <Btn onClick={onImport} disabled={busy}><Save size={14}/> {busy ? "Importing..." : "Import to My Account"}</Btn>
          {onDismiss && <Btn variant="secondary" onClick={onDismiss} disabled={busy}>Not Now</Btn>}
        </div>
      </div>
    </Card>
  );
}

const PHASE4_STAGE_LABELS: Record<string, string> = {
  preparing: "Preparing migration",
  "creating-backup": "Creating safety backup",
  validating: "Validating calculation snapshots",
  "checking-previous": "Checking previous migration",
  "resolving-clients": "Resolving clients",
  "importing-timesheets": "Importing timesheets",
  "importing-work-days": "Importing work days",
  "importing-expenses": "Importing expenses",
  verifying: "Verifying cloud records",
  "updating-compatibility": "Updating local compatibility data",
  complete: "Migration complete",
  "already-migrated": "Already migrated",
  failed: "Migration failed",
};

function Phase4MigrationPanel({ preflight, invoiceCount, paymentCount, busy, stage, counts, error, success, completed, confirming, onValidate, onOpenConfirmation, onCancelConfirmation, onStart }: {
  preflight: Phase4MigrationPreflight | null;
  invoiceCount: number;
  paymentCount: number;
  busy: boolean;
  stage: string;
  counts: { timesheets: number; timesheet_entries: number; day_expenses: number };
  error: string;
  success: string;
  completed: boolean;
  confirming: boolean;
  onValidate: () => void;
  onOpenConfirmation: () => void;
  onCancelConfirmation: () => void;
  onStart: () => void;
}) {
  const summary = preflight?.summary;
  const progress = stage ? PHASE4_STAGE_LABELS[stage] || "Preparing migration" : "Review calculation snapshots before migration.";
  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50/40 p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-950">Copy reviewed timesheets to your account</p>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-slate-600">This one-time Phase 4A action copies only reviewed browser-local timesheets, work days, and day expenses. The normal Timesheets workspace stays on its browser source until Phase 4B.</p>
          {summary && <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
            <MetricCard label="Timesheets" value={summary.timesheetCount} detail="Reviewed records" icon={Clock} tone="blue" />
            <MetricCard label="Work days" value={summary.entryCount} detail="Frozen values" icon={Zap} tone="slate" />
            <MetricCard label="Expenses" value={summary.expenseCount} detail="Derived rows" icon={Receipt} tone="slate" />
            <MetricCard label="Invoices" value={invoiceCount} detail="Remain local" icon={FileText} tone="orange" />
            <MetricCard label="Payments" value={paymentCount} detail="Remain local" icon={Building2} tone="orange" />
          </div>}
          <p className="mt-4 text-sm font-medium text-slate-700">{progress}</p>
          {busy && summary && <p className="mt-1 text-xs text-slate-500">Timesheets imported: {counts.timesheets} of {summary.timesheetCount} · Work days imported: {counts.timesheet_entries} of {summary.entryCount} · Expenses imported: {counts.day_expenses} of {summary.expenseCount}</p>}
          {error && <div className="mt-3"><AlertBox type="error">{error}</AlertBox></div>}
          {success && <div className="mt-3"><AlertBox type="success">{success}</AlertBox></div>}
          {completed && !success && <div className="mt-3"><AlertBox type="success">This browser has a verified Phase 4A migration marker. The current Timesheets workspace still uses browser-local records.</AlertBox></div>}
          {confirming && summary && (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
              <p className="font-bold">Start reviewed timesheet migration?</p>
              <p className="mt-1 leading-relaxed">Your reviewed timesheets and work days will be copied to your CrewQuote account. A complete safety backup will download before migration begins. Invoices and payments will remain stored in this browser. Local source records will not be deleted.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Btn onClick={onStart} disabled={busy}><Save size={14}/> Start Migration</Btn>
                <Btn variant="secondary" onClick={onCancelConfirmation} disabled={busy}>Cancel</Btn>
              </div>
            </div>
          )}
        </div>
        <div className="flex flex-shrink-0 flex-wrap gap-2 lg:justify-end">
          {!confirming && <Btn variant="secondary" onClick={onValidate} disabled={busy}><CheckCircle size={14}/>{busy && stage === "preparing" ? "Checking..." : preflight ? "Recheck Readiness" : "Check Migration Readiness"}</Btn>}
          {preflight && !confirming && <Btn onClick={onOpenConfirmation} disabled={busy}><Save size={14}/> Start Migration</Btn>}
        </div>
      </div>
    </div>
  );
}

function AppShell() {
  const { signOut, user } = useAuth();
  const [page,       setPage]       = useState("timesheets");
  const [profile,    setProfile]    = useState<Profile>({ ...DEFAULT_PROFILE });
  const [clients,    setClients]    = useState<Client[]>([]);
  const [timesheets, setTimesheets] = useState<Timesheet[]>([]);
  const [invoices,   setInvoices]   = useState<Invoice[]>([]);
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);
  const [ready,      setReady]      = useState(false);
  const [toasts,     setToasts]     = useState<ToastMsg[]>([]);
  const [startupError, setStartupError] = useState("");
  const [forceTestError, setForceTestError] = useState(false);
  const [cloudError, setCloudError] = useState("");
  const [cloudSavingSettings, setCloudSavingSettings] = useState(false);
  const [cloudSavingClients, setCloudSavingClients] = useState(false);
  const [ownerMismatch, setOwnerMismatch] = useState(false);
  const [ownershipClaimRequired, setOwnershipClaimRequired] = useState(false);
  const [migrationSummary, setMigrationSummary] = useState<Phase3MigrationSummary | null>(null);
  const [migrationDismissed, setMigrationDismissed] = useState(false);
  const [migrationBusy, setMigrationBusy] = useState(false);
  const [migrationError, setMigrationError] = useState("");
  const [migrationSuccess, setMigrationSuccess] = useState("");
  const [phase4Preflight, setPhase4Preflight] = useState<Phase4MigrationPreflight | null>(null);
  const [phase4Busy, setPhase4Busy] = useState(false);
  const [phase4Stage, setPhase4Stage] = useState("");
  const [phase4Counts, setPhase4Counts] = useState({ timesheets: 0, timesheet_entries: 0, day_expenses: 0 });
  const [phase4Error, setPhase4Error] = useState("");
  const [phase4Success, setPhase4Success] = useState("");
  const [phase4Confirming, setPhase4Confirming] = useState(false);

  const loadCloudAwareData = useCallback(async () => {
    if (!user?.id) return;
    setReady(false);
    setStartupError("");
    setCloudError("");
    setOwnerMismatch(false);
    setOwnershipClaimRequired(false);
    try {
      const localData = await loadStoredAppData();
      const localOwner = readLocalDataOwnerId();
      const hasPrivateLocalData = hasMeaningfulCrewQuoteData(localData);
      if (hasPrivateLocalData && localOwner && localOwner !== user.id) {
        setProfile({ ...DEFAULT_PROFILE });
        setClients([]);
        setTimesheets([]);
        setInvoices([]);
        setOnboardingDismissed(false);
        setMigrationSummary(null);
        setOwnerMismatch(true);
        return;
      }
      if ((localData.timesheets.length > 0 || localData.invoices.length > 0) && !localOwner) {
        setProfile(localData.profile);
        setClients(localData.clients);
        setTimesheets(localData.timesheets);
        setInvoices(localData.invoices);
        setOnboardingDismissed(localData.onboardingDismissed);
        setMigrationSummary(null);
        setOwnershipClaimRequired(true);
        return;
      }

      const migrationWasCompleted = migrationCompletedForUser(user.id);
      const sourceSummary = summarizePhase3MigrationSource(localData);
      const shouldHaveMigration = hasPhase3MigrationSource(localData) && !migrationWasCompleted;
      if (shouldHaveMigration) {
        setProfile(localData.profile);
        setClients(localData.clients);
        setTimesheets(localData.timesheets);
        setInvoices(localData.invoices);
        setOnboardingDismissed(localData.onboardingDismissed);
        setMigrationSummary(sourceSummary);
        setCloudError("");
        return;
      }

      let nextProfile = localData.profile;
      let nextClients = localData.clients;
      let nextOnboardingDismissed = localData.onboardingDismissed;
      let nextCloudError = "";

      const [settingsResult, preferencesResult, clientsResult] = await Promise.all([
        getCurrentBusinessSettings({ ...localData.profile, businessLogoDataUrl: localData.profile.businessLogoDataUrl || "" }),
        getCurrentUserPreferences({ onboardingDismissed: localData.onboardingDismissed, uiPreferences: {} }),
        listClients(),
      ]);

      if (settingsResult.error) nextCloudError = settingsResult.error;
      else if (settingsResult.data?.exists) nextProfile = settingsResult.data.profile as Profile;

      if (preferencesResult.error) nextCloudError = nextCloudError || preferencesResult.error;
      else if (preferencesResult.data?.exists) nextOnboardingDismissed = preferencesResult.data.preferences.onboardingDismissed;

      if (clientsResult.error) nextCloudError = nextCloudError || clientsResult.error;
      else if (clientsResult.data && (clientsResult.data.length > 0 || migrationWasCompleted)) nextClients = clientsResult.data as Client[];

      setProfile(nextProfile);
      setClients(nextClients);
      setTimesheets(localData.timesheets);
      setInvoices(localData.invoices);
      setOnboardingDismissed(nextOnboardingDismissed);

      try {
        Store.set(STORAGE_KEYS.dataVersion, CURRENT_DATA_VERSION);
        if (settingsResult.data?.exists) Store.set(STORAGE_KEYS.profile, nextProfile);
        if (clientsResult.data && (clientsResult.data.length > 0 || migrationWasCompleted)) Store.set(STORAGE_KEYS.clients, nextClients);
        if (preferencesResult.data?.exists) Store.set(STORAGE_KEYS.onboardingDismissed, nextOnboardingDismissed);
      } catch (err) {
        nextCloudError = nextCloudError || (err instanceof Error ? err.message : "CrewQuote could not refresh the local compatibility cache.");
      }

      setMigrationSummary(null);
      setCloudError(nextCloudError);
      setPhase4Preflight(null);
      setPhase4Confirming(false);
    } catch (err) {
      setStartupError(err instanceof Error ? err.message : "CrewQuote could not load saved browser data.");
    } finally {
      setReady(true);
    }
  }, [migrationDismissed, user?.id]);

  useEffect(() => {
    void loadCloudAwareData();
  }, [loadCloudAwareData]);

  const showToast = useCallback((msg: string, type: ToastType = "success") => {
    const id = uid();
    setToasts(p => [...p, { id, msg, type }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3500);
  }, []);

  const currentAppData = useMemo<AppData>(() => ({
    dataVersion: CURRENT_DATA_VERSION,
    profile,
    clients,
    timesheets,
    invoices,
    onboardingDismissed,
  }), [profile, clients, timesheets, invoices, onboardingDismissed]);

  const persistValue = useCallback(<T,>(key: string, value: T, apply: (value: T) => void, throwOnError = false) => {
    try {
      Store.set(key, value);
      Store.set(STORAGE_KEYS.dataVersion, CURRENT_DATA_VERSION);
      apply(value);
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "CrewQuote could not save to browser storage.";
      showToast(msg, "error");
      if (throwOnError) throw err;
      return false;
    }
  }, [showToast]);

  const rememberLocalOwner = useCallback(() => {
    if (user?.id) claimLocalDataOwner(user.id);
  }, [user?.id]);

  const saveProfile = useCallback(async (p: Profile) => {
    setCloudSavingSettings(true);
    setCloudError("");
    try {
      const result = await saveCurrentBusinessSettings(p, { ...profile, businessLogoDataUrl: p.businessLogoDataUrl });
      if (result.error || !result.data) throw new Error(result.error || "CrewQuote could not save business settings to your account.");
      const savedProfile = { ...(result.data as Profile), businessLogoDataUrl: p.businessLogoDataUrl };
      rememberLocalOwner();
      persistValue(STORAGE_KEYS.profile, savedProfile, setProfile, true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "CrewQuote could not save business settings to your account.";
      setCloudError(msg);
      throw new Error(msg);
    } finally {
      setCloudSavingSettings(false);
    }
  }, [persistValue, profile, rememberLocalOwner]);

  const saveClients = useCallback(async (nextClientsInput: Client[]) => {
    const nextClients = nextClientsInput.map(client => normalizeClient(client));
    const previousById = new Map(clients.map(client => [client.id, client]));
    const nextById = new Map(nextClients.map(client => [client.id, client]));
    const removed = clients.find(client => !nextById.has(client.id));
    const added = nextClients.find(client => !previousById.has(client.id));
    const updated = nextClients.find(client => {
      const previous = previousById.get(client.id);
      return previous ? JSON.stringify(previous) !== JSON.stringify(client) : false;
    });

    if (!removed && !added && !updated) {
      rememberLocalOwner();
      persistValue(STORAGE_KEYS.clients, nextClients, setClients);
      return;
    }

    setCloudSavingClients(true);
    setCloudError("");
    try {
      const result = removed
        ? await deleteCloudClient(removed.id)
        : added
          ? await createCloudClient(added)
          : await updateCloudClient(updated as Client);
      if (result.error) throw new Error(result.error);

      const refreshed = await listClients();
      if (refreshed.error || !refreshed.data) throw new Error(refreshed.error || "CrewQuote could not refresh clients from your account.");
      rememberLocalOwner();
      persistValue(STORAGE_KEYS.clients, refreshed.data as Client[], setClients, true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "CrewQuote could not save clients to your account.";
      setCloudError(msg);
      throw new Error(msg);
    } finally {
      setCloudSavingClients(false);
    }
  }, [clients, persistValue, rememberLocalOwner]);

  const saveTimesheets = useCallback((t: Timesheet[]) => {
    rememberLocalOwner();
    persistValue(STORAGE_KEYS.timesheets, t, setTimesheets);
  }, [persistValue, rememberLocalOwner]);

  const saveInvoices = useCallback((i: Invoice[]) => {
    rememberLocalOwner();
    persistValue(STORAGE_KEYS.invoices, i, setInvoices);
  }, [persistValue, rememberLocalOwner]);

  const addInvoice = (inv: Invoice) => {
    const normalized = normalizeInvoice(inv);
    const next = [...invoices, normalized];
    saveInvoices(next);
    void saveProfile(rememberInvoiceNumber(profile, normalized.invoiceNumber)).catch(err => {
      showToast(err instanceof Error ? err.message : "CrewQuote could not save the invoice number history to your account.", "error");
    });
  };
  const dismissOnboarding = () => {
    void (async () => {
      const result = await saveCurrentUserPreferences({ onboardingDismissed: true, uiPreferences: {} });
      if (result.error) {
        setCloudError(result.error);
        showToast(result.error, "error");
        return;
      }
      rememberLocalOwner();
      persistValue(STORAGE_KEYS.onboardingDismissed, true, setOnboardingDismissed);
    })();
  };
  const exportBackup = async () => {
    try {
      const result = await buildCloudAwareBackupData(currentAppData);
      if (result.error || !result.data) throw new Error(result.error || "CrewQuote could not assemble a cloud-aware backup.");
      const calculationSnapshots = user?.id
        ? { ownerUserId: user.id, records: readCalculationSnapshots(user.id) }
        : undefined;
      downloadBackup(result.data as AppData, "crewquote-backup", calculationSnapshots);
      showToast("Backup exported", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "CrewQuote could not export a backup.", "error");
    }
  };

  const runPhase4Preflight = useCallback(async () => {
    if (!user?.id) return;
    setPhase4Busy(true);
    setPhase4Stage("preparing");
    setPhase4Counts({ timesheets: 0, timesheet_entries: 0, day_expenses: 0 });
    setPhase4Error("");
    setPhase4Success("");
    setPhase4Confirming(false);
    try {
      const result = await preflightPhase4TimesheetMigration({
        ownerUserId: readLocalDataOwnerId(),
        authenticatedUserId: user.id,
        localTimesheets: timesheets as CrewTimesheet[],
        storedSnapshots: readCalculationSnapshots(user.id),
        invoiceCount: invoices.length,
      });
      if (result.error || !result.data) throw new Error(result.error || "CrewQuote could not validate the reviewed timesheets.");
      setPhase4Preflight(result.data);
      setPhase4Stage("validating");
    } catch (err) {
      setPhase4Preflight(null);
      setPhase4Stage("failed");
      setPhase4Error(err instanceof Error ? err.message : "CrewQuote could not validate the reviewed timesheets.");
    } finally {
      setPhase4Busy(false);
    }
  }, [invoices.length, timesheets, user?.id]);

  const runPhase4Migration = useCallback(async () => {
    if (!user?.id || !phase4Preflight) return;
    setPhase4Busy(true);
    setPhase4Stage("creating-backup");
    setPhase4Error("");
    setPhase4Success("");
    try {
      const refreshedPreflight = await preflightPhase4TimesheetMigration({
        ownerUserId: readLocalDataOwnerId(),
        authenticatedUserId: user.id,
        localTimesheets: timesheets as CrewTimesheet[],
        storedSnapshots: readCalculationSnapshots(user.id),
        invoiceCount: invoices.length,
      });
      if (refreshedPreflight.error || !refreshedPreflight.data) throw new Error(refreshedPreflight.error || "CrewQuote could not revalidate the reviewed timesheets.");
      if (refreshedPreflight.data.fingerprint !== phase4Preflight.fingerprint) {
        setPhase4Preflight(refreshedPreflight.data);
        throw new Error("A local timesheet or confirmed calculation changed after readiness was checked. Review the updated record, then confirm migration again.");
      }
      const completeBackup = await buildPhase4CloudBackupData(currentAppData);
      if (completeBackup.error || !completeBackup.data) throw new Error(completeBackup.error || "CrewQuote could not create the complete safety backup.");
      const snapshots = { ownerUserId: user.id, records: readCalculationSnapshots(user.id) };
      downloadBackup(
        completeBackup.data.appData as AppData,
        "crewquote-pre-phase4-timesheet-migration-backup",
        snapshots,
        {
          localOwnerUserId: readLocalDataOwnerId(),
          phase4MigrationFingerprint: phase4Preflight.fingerprint,
          phase3MigrationCompleted: migrationCompletedForUser(user.id),
          phase4MigrationAlreadyCompleted: phase4MigrationCompletedForUser(user.id),
          cloudRecovery: completeBackup.data.cloudRecovery,
        },
      );
      const result = await migratePreparedTimesheets(
        refreshedPreflight.data.records,
        APP_VERSION,
        CURRENT_DATA_VERSION,
        (stage: Phase4MigrationStage, counts) => { setPhase4Stage(stage); setPhase4Counts(counts); },
      );
      if (result.error || !result.data) throw new Error(result.error || "CrewQuote could not migrate the reviewed timesheets.");
      setPhase4Confirming(false);
      setPhase4Success(result.data.alreadyCompleted
        ? "Already migrated. CrewQuote verified the reviewed cloud records and refreshed the local compatibility data."
        : `Migration complete. Copied ${result.data.counts.timesheets} timesheet${result.data.counts.timesheets === 1 ? "" : "s"}, ${result.data.counts.timesheet_entries} work day${result.data.counts.timesheet_entries === 1 ? "" : "s"}, and ${result.data.counts.day_expenses} day expense${result.data.counts.day_expenses === 1 ? "" : "s"}.`);
    } catch (err) {
      setPhase4Stage("failed");
      setPhase4Error(err instanceof Error ? err.message : "CrewQuote could not migrate the reviewed timesheets.");
    } finally {
      setPhase4Busy(false);
    }
  }, [currentAppData, invoices.length, phase4Preflight, timesheets, user?.id]);
  const importBackup = () => {
    throw new Error(PHASE3_BACKUP_IMPORT_DISABLED_MESSAGE);
  };

  const runPhase3Migration = useCallback(async () => {
    if (!migrationSummary) return;
    setMigrationError("");
    setMigrationSuccess("");
    const ok = confirm("CrewQuote will first download a safety backup, then copy browser settings and clients into your account. Timesheets and invoices will remain in this browser and be associated with this account for temporary user-switch protection. Continue?");
    if (!ok) return;
    try {
      downloadBackup(currentAppData, "crewquote-pre-cloud-import-backup");
    } catch (err) {
      setMigrationError(err instanceof Error ? `Import cancelled because CrewQuote could not create the safety backup: ${err.message}` : "Import cancelled because CrewQuote could not create the safety backup.");
      return;
    }

    setMigrationBusy(true);
    try {
      const result = await migrateBrowserDataToCloud(currentAppData, APP_VERSION);
      if (result.error || !result.data) throw new Error(result.error || "CrewQuote could not import browser data into your account.");
      setMigrationSuccess(result.data.alreadyCompleted
        ? "This browser data was already imported. CrewQuote refreshed your account data."
        : `Imported settings, preferences, and ${result.data.counts.clients} client${result.data.counts.clients === 1 ? "" : "s"} into your account.`);
      setMigrationSummary(null);
      await loadCloudAwareData();
    } catch (err) {
      setMigrationError(err instanceof Error ? err.message : "CrewQuote could not import browser data into your account.");
    } finally {
      setMigrationBusy(false);
    }
  }, [currentAppData, loadCloudAwareData, migrationSummary]);

  const topMigrationPanel = migrationSummary && !migrationDismissed ? (
    <Phase3MigrationPanel
      summary={migrationSummary}
      busy={migrationBusy}
      error={migrationError}
      success={migrationSuccess}
      onImport={() => void runPhase3Migration()}
      onDismiss={() => setMigrationDismissed(true)}
    />
  ) : null;

  const settingsMigrationPanel = migrationSummary ? (
    <Phase3MigrationPanel
      summary={migrationSummary}
      busy={migrationBusy}
      error={migrationError}
      success={migrationSuccess}
      onImport={() => void runPhase3Migration()}
    />
  ) : null;

  const phase4MigrationPanel = user?.id ? (
    <Phase4MigrationPanel
      preflight={phase4Preflight}
      invoiceCount={invoices.length}
      paymentCount={invoices.filter(invoice => Number(invoice.paidAmount) > 0 || Boolean(invoice.paidDate)).length}
      busy={phase4Busy}
      stage={phase4Stage}
      counts={phase4Counts}
      error={phase4Error}
      success={phase4Success}
      completed={phase4MigrationCompletedForUser(user.id)}
      confirming={phase4Confirming}
      onValidate={() => void runPhase4Preflight()}
      onOpenConfirmation={() => { setPhase4Error(""); setPhase4Confirming(true); }}
      onCancelConfirmation={() => setPhase4Confirming(false)}
      onStart={() => void runPhase4Migration()}
    />
  ) : null;

  const saveProfileFromLocalWorkflow = useCallback((nextProfile: Profile) => {
    void saveProfile(nextProfile).catch(err => {
      showToast(err instanceof Error ? err.message : "CrewQuote could not save settings to your account.", "error");
    });
  }, [saveProfile, showToast]);

  const showOnboarding = !onboardingDismissed && !hasMeaningfulCrewQuoteData(currentAppData);

  if (forceTestError) throw new Error("CrewQuote recovery screen test error.");

  if (!ready) return (
    <div className="h-screen flex items-center justify-center bg-slate-900">
      <div className="text-center">
        <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center mx-auto mb-3 animate-pulse"><Film size={20} className="text-white"/></div>
        <p className="text-slate-400 text-sm">Loading…</p>
      </div>
    </div>
  );

  if (startupError) return (
    <div className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <Card className="p-6 sm:p-8">
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700"><AlertTriangle size={22}/></div>
            <div>
              <p className="text-xl font-bold text-slate-950">CrewQuote could not load saved data</p>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{startupError}</p>
              <p className="mt-2 text-sm leading-relaxed text-slate-500">CrewQuote has not intentionally reset your records. Export an emergency backup before taking destructive action.</p>
            </div>
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            <Btn onClick={() => window.location.reload()}>Reload App</Btn>
            <Btn variant="secondary" onClick={() => downloadBackup(appDataFromRawStorage(false), "crewquote-emergency-backup")}><FileText size={14}/> Export Emergency Backup</Btn>
          </div>
        </Card>
      </div>
    </div>
  );

  if (ownershipClaimRequired) return (
    <div className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <Card className="p-6 sm:p-8">
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><Info size={22}/></div>
            <div>
              <p className="text-xl font-bold text-slate-950">Use this account for browser-local CrewQuote records?</p>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                This browser contains local CrewQuote timesheets or invoices. To protect them from other sign-ins in this browser profile, associate the remaining local records with the current account before continuing.
              </p>
              <p className="mt-2 text-sm leading-relaxed text-slate-500">
                This does not upload timesheets or invoices. They remain in this browser until a later migration phase.
              </p>
            </div>
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            <Btn onClick={() => { if (user?.id) claimLocalDataOwner(user.id); setOwnershipClaimRequired(false); void loadCloudAwareData(); }}>Use This Account</Btn>
            <Btn variant="secondary" onClick={() => void signOut()}>Sign Out</Btn>
            <Btn variant="secondary" onClick={() => downloadBackup(appDataFromRawStorage(false), "crewquote-browser-ownership-backup")}><FileText size={14}/> Export Browser Backup</Btn>
          </div>
        </Card>
      </div>
    </div>
  );

  if (ownerMismatch) return (
    <div className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <Card className="p-6 sm:p-8">
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700"><AlertTriangle size={22}/></div>
            <div>
              <p className="text-xl font-bold text-slate-950">CrewQuote browser data belongs to another account</p>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                This browser contains CrewQuote records associated with another account. Sign in with the account that owns these records or use a separate browser profile.
              </p>
              <p className="mt-2 text-sm leading-relaxed text-slate-500">
                CrewQuote has stopped before loading any saved records on this screen.
              </p>
            </div>
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            <Btn onClick={() => void signOut()}>Sign Out</Btn>
            <Btn variant="secondary" onClick={() => downloadBackup(appDataFromRawStorage(false), "crewquote-browser-owner-mismatch-backup")}><FileText size={14}/> Export Browser Backup</Btn>
          </div>
        </Card>
      </div>
    </div>
  );

  return (
    <Layout page={page} setPage={setPage} profile={profile}>
      <ToastContainer toasts={toasts} />
      {topMigrationPanel && page !== "settings" && <div className="mb-5">{topMigrationPanel}</div>}
      {page === "timesheets" && <TimesheetsPage timesheets={timesheets} profile={profile} clients={clients} onSave={saveTimesheets} onSaveClients={saveClients} invoices={invoices} onAddInvoice={addInvoice} onSaveInvoices={saveInvoices} onShowToast={showToast} showOnboarding={showOnboarding} onDismissOnboarding={dismissOnboarding} onNavigate={setPage} />}
      {page === "clients"    && <ClientsPage    clients={clients} timesheets={timesheets} invoices={invoices} onSave={saveClients} onShowToast={showToast} loadError={cloudError} saving={cloudSavingClients} onRetry={() => void loadCloudAwareData()} />}
      {page === "invoices"   && <InvoicesPage   invoices={invoices} timesheets={timesheets} clients={clients} profile={profile} onSave={saveInvoices} onSaveTimesheets={saveTimesheets} onSaveClients={saveClients} onSaveProfile={saveProfileFromLocalWorkflow} onShowToast={showToast} onViewTimesheets={() => setPage("timesheets")} />}
      {page === "settings"   && <SettingsPage   profile={profile} appData={currentAppData} onSave={saveProfile} onExportBackup={exportBackup} onImportBackup={importBackup} onTestError={() => setForceTestError(true)} cloudSaving={cloudSavingSettings} cloudError={cloudError} migrationPanel={settingsMigrationPanel} phase4MigrationPanel={phase4MigrationPanel} backupImportDisabledMessage={PHASE3_BACKUP_IMPORT_DISABLED_MESSAGE} calculationOwnerUserId={user?.id} phase4Completed={user?.id ? phase4MigrationCompletedForUser(user.id) : false} />}
      {page === "account"    && <AccountPage />}
    </Layout>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppShell />
    </ErrorBoundary>
  );
}
