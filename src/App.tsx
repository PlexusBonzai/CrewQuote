import { Fragment, useState, useEffect, useMemo, useCallback } from "react";
import {
  Clock, Receipt, Settings, Film, Plus, Trash2,
  AlertTriangle, CheckCircle, Moon, ChevronDown, ChevronUp,
  Save, Zap, Copy, FileText, Info, Users, Building2, Pencil
} from "lucide-react";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

type OTRuleId        = "sa-film" | "sa-bcea" | "custom";
type TurnaroundMode  = "warning" | "penalty" | "manual";
type ToastType       = "success" | "error" | "info";
type InvoiceDetailMode = "summary" | "detailed" | "summary_timesheet";
type InvoiceStatus = "draft" | "sent" | "paid" | "partial" | "overdue" | "cancelled";

interface ToastMsg { id: string; msg: string; type: ToastType; }

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

function getOTBands(ruleId: OTRuleId, profile: Profile): { band1Hours: number; band1Mult: number; band2Mult: number } {
  if (ruleId === "sa-film") return { band1Hours: 4,    band1Mult: 1.5, band2Mult: 2.0 };
  if (ruleId === "sa-bcea") return { band1Hours: 9999, band1Mult: 1.5, band2Mult: 1.5 };
  return { band1Hours: profile.defaultOtBand1Hours ?? 4, band1Mult: profile.defaultOtBand1Mult ?? 1.5, band2Mult: profile.defaultOtBand2Mult ?? 2.0 };
}

// ═══════════════════════════════════════════════════════════════════════════
// PROFILE DEFAULTS
// ═══════════════════════════════════════════════════════════════════════════

const DEFAULT_PROFILE = {
  fullName: "", role: "", companyName: "", email: "", phone: "", address: "", vatNumber: "",
  vatRegistered:          false,
  invoiceLabel:           "Invoice",
  paymentTerms:           "Payment due within 30 days",
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

// ═══════════════════════════════════════════════════════════════════════════
// STORAGE
// ═══════════════════════════════════════════════════════════════════════════

const Store = {
  async get(k: string) {
    try {
      const raw = window.localStorage?.getItem(k);
      if (raw) return JSON.parse(raw);
    } catch {}
    try {
      const r = await (window as any).storage?.get?.(k);
      if (r?.value) {
        try { window.localStorage?.setItem(k, r.value); } catch {}
        return JSON.parse(r.value);
      }
    } catch {}
    return null;
  },
  async set(k: string, v: unknown) {
    const raw = JSON.stringify(v);
    try { window.localStorage?.setItem(k, raw); } catch {}
    try { await (window as any).storage?.set?.(k, raw); } catch {}
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// CALCULATION ENGINE
// ═══════════════════════════════════════════════════════════════════════════

const toMins     = (t: string) => { if (!t) return 0; const [h = 0, m = 0] = (t + ":0").split(":").map(Number); return h * 60 + m; };
const durH       = (s: string, e: string) => { let sm = toMins(s), em = toMins(e); if (em <= sm) em += 1440; return Math.max((em - sm) / 60, 0); };
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
const calcTurnaround = (prevWrap: string, nextCall: string) => {
  if (!prevWrap || !nextCall) return null;
  let w = toMins(prevWrap), n = toMins(nextCall);
  if (n <= w) n += 1440;
  return (n - w) / 60;
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
  notes: "",
  ...overrides,
});

const normalizeClient = (c: Partial<Client>): Client => {
  const terms = c.paymentTerms || c.defaultPaymentTerms || "";
  return blankClient({ ...c, id: c.id || uid(), paymentTerms: terms, defaultPaymentTerms: terms });
};
const clientName = (c?: Partial<Client> | null) => c?.companyName || c?.contactPerson || "";
const clientBillingComplete = (c?: Partial<Client> | null) => Boolean((c?.companyName || "").trim() && (c?.billingAddress || "").trim());
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

function profileForTimesheet(profile: Profile, ts?: Partial<Timesheet>): Profile {
  if (!ts) return profile;
  return {
    ...profile,
    defaultCurrency:          ts.currency || profile.defaultCurrency,
    defaultDayRate:           safe(ts.defaultDayRate, profile.defaultDayRate),
    defaultIncludedHours:     safe(ts.defaultIncludedHours, profile.defaultIncludedHours),
    defaultEquipmentRental:   safe(ts.defaultEquipmentRental, profile.defaultEquipmentRental),
    defaultPerDiem:           safe(ts.defaultPerDiem, profile.defaultPerDiem),
    defaultVat:               safe(ts.vat, profile.defaultVat),
    defaultOvertimeRule:      (ts.defaultOvertimeRule || profile.defaultOvertimeRule) as OTRuleId,
    defaultOtBand1Hours:      safe(ts.defaultOtBand1Hours, profile.defaultOtBand1Hours),
    defaultOtBand1Mult:       safe(ts.defaultOtBand1Mult, profile.defaultOtBand1Mult),
    defaultOtBand2Mult:       safe(ts.defaultOtBand2Mult, profile.defaultOtBand2Mult),
    defaultMinTurnaround:     safe(ts.defaultMinTurnaround, profile.defaultMinTurnaround),
    defaultTurnaroundMode:    (ts.defaultTurnaroundMode || profile.defaultTurnaroundMode) as TurnaroundMode,
    defaultTurnaroundPenMult: safe(ts.defaultTurnaroundPenMult, profile.defaultTurnaroundPenMult),
    mealBreaksDeducted:       ts.mealBreaksDeducted ?? profile.mealBreaksDeducted,
    travelTimePaid:           ts.travelTimePaid ?? profile.travelTimePaid,
    equipmentRentalDaily:     ts.equipmentRentalDaily ?? profile.equipmentRentalDaily,
  };
}

function timesheetDateRange(ts: Timesheet): string {
  const dates = (ts.entries || []).map(e => e.date).filter(Boolean).sort();
  if (!dates.length) return ts.startDate ? fmtDate(ts.startDate) : "Not set";
  const first = fmtDate(dates[0]);
  const last = fmtDate(dates[dates.length - 1]);
  return first === last ? first : `${first} - ${last}`;
}

function normalizeTimesheet(t: Partial<Timesheet>): Timesheet {
  return {
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
    entries: Array.isArray(t.entries) ? t.entries : [],
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

/** Core per-day calculation — FULLY DEFENSIVE, never throws */
function calcDay(e: Partial<TimesheetEntry>, profile: Profile) {
  try {
    const call  = e.callTime    || "08:00";
    const wrap  = e.wrapTime    || "18:00";
    const onSetH    = durH(call, wrap);
    const overnight = toMins(wrap) <= toMins(call);
    const mealDeducted = e.mealDeducted ?? profile.mealBreaksDeducted ?? true;
    const travelPaid   = e.travelPaid   ?? profile.travelTimePaid     ?? true;
    const mealH = mealDeducted ? Math.max(safe(e.mealBreakMinutes) / 60, 0) : 0;
    const workH = Math.max(onSetH - mealH, 0);
    const travH = travelPaid && e.travelStartTime && e.travelEndTime ? durH(e.travelStartTime, e.travelEndTime) : 0;
    const paidH = workH + travH;
    const dayRate     = safe(e.dayRate,       profile.defaultDayRate       ?? 0);
    const incH        = Math.max(safe(e.includedHours, profile.defaultIncludedHours ?? 10), 1);
    const baseHourly  = dayRate / incH;
    const ruleId      = (e.overtimeRule || profile.defaultOvertimeRule || "sa-film") as OTRuleId;
    const ovEntry     = { defaultOtBand1Hours: safe(e.otBand1Hours, profile.defaultOtBand1Hours ?? 4), defaultOtBand1Mult: safe(e.otBand1Mult, profile.defaultOtBand1Mult ?? 1.5), defaultOtBand2Mult: safe(e.otBand2Mult, profile.defaultOtBand2Mult ?? 2.0) };
    const bands       = getOTBands(ruleId, { ...profile, ...ovEntry } as Profile);
    const totalOtH    = Math.max(paidH - incH, 0);
    const b1H         = Math.min(totalOtH, bands.band1Hours);
    const b2H         = Math.max(totalOtH - bands.band1Hours, 0);
    const b1Cost      = b1H * baseHourly * bands.band1Mult;
    const b2Cost      = b2H * baseHourly * bands.band2Mult;
    const totalOtCost = b1Cost + b2Cost;
    const equip    = safe(e.equipmentRental, profile.equipmentRentalDaily ? profile.defaultEquipmentRental : 0);
    const perDiem  = safe(e.perDiem,  profile.defaultPerDiem  ?? 0);
    const expenses = safe(e.expenses, 0);
    const total    = dayRate + totalOtCost + equip + perDiem + expenses;
    return { onSetH, overnight, mealH, workH, travH, paidH, incH, baseHourly, totalOtH, b1H, b1Cost, b2H, b2Cost, totalOtCost, equip, perDiem, expenses, dayRate, total, ruleId, bands };
  } catch {
    return { onSetH: 0, overnight: false, mealH: 0, workH: 0, travH: 0, paidH: 0, incH: 10, baseHourly: 0, totalOtH: 0, b1H: 0, b1Cost: 0, b2H: 0, b2Cost: 0, totalOtCost: 0, equip: 0, perDiem: 0, expenses: 0, dayRate: 0, total: 0, ruleId: "sa-film" as OTRuleId, bands: { band1Hours: 4, band1Mult: 1.5, band2Mult: 2.0 } };
  }
}

function calcSummary(entries: TimesheetEntry[], profile: Profile) {
  const minTR        = profile.defaultMinTurnaround || 10;
  const calcs        = (entries || []).map((e, i) => {
    const c = calcDay(e, profile);
    const prev = i > 0 ? entries[i - 1] : undefined;
    const turnaround = prev ? calcTurnaround(prev.wrapTime || "", e.callTime || "") : null;
    const shortfall = turnaround !== null ? Math.max(minTR - turnaround, 0) : 0;
    const turnaroundPenalty = profile.defaultTurnaroundMode === "penalty"
      ? shortfall * (c.baseHourly || 0) * (profile.defaultTurnaroundPenMult || 1)
      : 0;
    return { entry: e, c: { ...c, turnaround, turnaroundPenalty, totalWithPenalty: c.total + turnaroundPenalty } };
  });
  const totalDays    = calcs.length;
  const totalDayRates = calcs.reduce((s, { c }) => s + (c.dayRate    || 0), 0);
  const totalOtCost  = calcs.reduce((s, { c }) => s + (c.totalOtCost || 0), 0);
  const totalOtH     = calcs.reduce((s, { c }) => s + (c.totalOtH    || 0), 0);
  const totalEquip   = calcs.reduce((s, { c }) => s + (c.equip       || 0), 0);
  const totalPerDiem = calcs.reduce((s, { c }) => s + (c.perDiem     || 0), 0);
  const totalExp     = calcs.reduce((s, { c }) => s + (c.expenses    || 0), 0);
  const totalTurnaroundPenalty = calcs.reduce((s, { c }) => s + (c.turnaroundPenalty || 0), 0);
  const totalPaidH   = calcs.reduce((s, { c }) => s + (c.paidH       || 0), 0);
  const totalTravH   = calcs.reduce((s, { c }) => s + (c.travH       || 0), 0);
  const subtotal     = totalDayRates + totalOtCost + totalEquip + totalPerDiem + totalExp + totalTurnaroundPenalty;
  const vatPct       = profile.vatRegistered ? safe(profile.defaultVat) : 0;
  const vatAmt       = subtotal * (vatPct / 100);
  const grandTotal   = subtotal + vatAmt;
  return { calcs, totalDays, totalDayRates, totalOtCost, totalOtH, totalEquip, totalPerDiem, totalExp, totalTurnaroundPenalty, totalPaidH, totalTravH, subtotal, vatPct, vatAmt, grandTotal };
}

const genTSNum  = (list: Timesheet[]) => { const yr = new Date().getFullYear(); return `T-${yr}-${String((list || []).filter(t => t?.timesheetNumber?.startsWith(`T-${yr}`)).length + 1).padStart(4, "0")}`; };
const genINVNum = (list: Invoice[])   => { const yr = new Date().getFullYear(); return `I-${yr}-${String((list || []).filter(i => i?.invoiceNumber?.startsWith(`I-${yr}`)).length + 1).padStart(4, "0")}`; };

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
  isSunday:         false,
  isPublicHoliday:  false,
});

/** Duplicate previous day (keep rates/location, clear times/notes) */
const duplicateEntry = (prev: TimesheetEntry, currentDate: string): Omit<TimesheetEntry, "id"> => ({
  ...prev,
  date:             currentDate,
  callTime:         "08:00",
  wrapTime:         "18:00",
  notes:            "",
  travelStartTime:  "",
  travelEndTime:    "",
  travelDistance:   "",
  expenses:         0,
});

// ═══════════════════════════════════════════════════════════════════════════
// UI PRIMITIVES
// ═══════════════════════════════════════════════════════════════════════════

const Fld = ({ label, hint, children }: { label?: string; hint?: string; children: React.ReactNode }) => (
  <div className="space-y-1">
    {label && <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider">{label}</label>}
    {children}
    {hint && <p className="text-xs text-gray-400 mt-0.5">{hint}</p>}
  </div>
);

const base = "w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors";

const Inp = ({ label, hint, ...p }: React.InputHTMLAttributes<HTMLInputElement> & { label?: string; hint?: string }) =>
  <Fld label={label} hint={hint}><input className={base} {...p} /></Fld>;

const TInp = ({ label, ...p }: React.InputHTMLAttributes<HTMLInputElement> & { label?: string }) =>
  <Fld label={label}><input className={`${base} font-mono text-[15px] font-semibold`} type="time" {...p} /></Fld>;

const SInp = ({ label, hint, children, ...p }: React.SelectHTMLAttributes<HTMLSelectElement> & { label?: string; hint?: string; children: React.ReactNode }) =>
  <Fld label={label} hint={hint}><select className={base} {...p}>{children}</select></Fld>;

const TxInp = ({ label, ...p }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string }) =>
  <Fld label={label}><textarea className={`${base} resize-none`} {...p} /></Fld>;

const Tog = ({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) => (
  <label className="flex items-start justify-between gap-4 cursor-pointer py-2 select-none">
    <div><p className="text-sm font-medium text-gray-800">{label}</p>{hint && <p className="text-xs text-gray-400 mt-0.5">{hint}</p>}</div>
    <div className="flex-shrink-0" onClick={() => onChange(!checked)}
      style={{ width: 40, height: 22, background: checked ? "#2563EB" : "#D1D5DB", borderRadius: 11, position: "relative", cursor: "pointer", transition: "background .2s" }}>
      <div style={{ position: "absolute", width: 18, height: 18, background: "#fff", borderRadius: "50%", top: 2, left: checked ? 20 : 2, transition: "left .15s", boxShadow: "0 1px 3px rgba(0,0,0,.2)" }} />
    </div>
  </label>
);

const Btn = ({ children, variant = "primary", size = "md", className = "", ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string; size?: string }) => {
  const v: Record<string, string> = { primary: "bg-blue-600 hover:bg-blue-700 text-white shadow-sm", secondary: "bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 shadow-sm", ghost: "hover:bg-gray-100 text-gray-600", success: "bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm", danger: "bg-red-50 hover:bg-red-100 text-red-600 border border-red-200", amber: "bg-amber-500 hover:bg-amber-600 text-white shadow-sm" };
  const s: Record<string, string> = { xs: "px-2.5 py-1 text-xs rounded-md", sm: "px-3 py-1.5 text-xs rounded-md", md: "px-4 py-2 text-sm rounded-lg", lg: "px-5 py-2.5 text-sm rounded-xl" };
  return <button className={`inline-flex items-center gap-2 font-medium transition-colors ${v[variant] || v.primary} ${s[size] || s.md} disabled:opacity-40 disabled:cursor-not-allowed ${className}`} {...p}>{children}</button>;
};

const Card = ({ children, className = "" }: { children: React.ReactNode; className?: string }) =>
  <div className={`bg-white rounded-xl border border-gray-200 shadow-sm ${className}`}>{children}</div>;

const Badge = ({ children, color = "gray" }: { children: React.ReactNode; color?: string }) => {
  const c: Record<string, string> = { gray: "bg-gray-100 text-gray-700", blue: "bg-blue-100 text-blue-700", green: "bg-green-100 text-green-700", amber: "bg-amber-100 text-amber-800", orange: "bg-orange-100 text-orange-700", purple: "bg-purple-100 text-purple-700", red: "bg-red-100 text-red-700" };
  return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${c[color] || c.gray}`}>{children}</span>;
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

function SettingsPage({ profile, onSave }: { profile: Profile; onSave: (p: Profile) => void }) {
  const [f, setF] = useState<Profile>({ ...DEFAULT_PROFILE, ...profile });
  const [tab, setTab] = useState("profile");
  const [saved, setSaved] = useState(false);
  const set  = (k: keyof Profile) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF(p => ({ ...p, [k]: e.target.value }));
  const setN = (k: keyof Profile) => (e: React.ChangeEvent<HTMLInputElement>) => setF(p => ({ ...p, [k]: parseFloat(e.target.value) || 0 }));
  const setT = (k: keyof Profile) => (v: boolean) => setF(p => ({ ...p, [k]: v }));
  const save = () => { onSave(f); setSaved(true); setTimeout(() => setSaved(false), 2500); };
  const sym  = { ZAR: "R", USD: "$", GBP: "£", EUR: "€" }[f.defaultCurrency] || "R";
  const isCustom = f.defaultOvertimeRule === "custom";
  const TABS = [["profile", "My Business Details"], ["rates", "Default Rates"], ["overtime", "Overtime & Turnaround"], ["timesheet", "Timesheet"], ["banking", "Banking"]];

  return (
    <div className="max-w-2xl space-y-5">
      <div className="flex items-start justify-between">
        <div><h1 className="text-xl font-bold text-gray-900">Settings</h1><p className="text-sm text-gray-500 mt-0.5">Set your business details once so timesheets and invoices fill themselves in.</p></div>
        {saved ? <span className="inline-flex items-center gap-1.5 px-3 py-2 bg-green-50 text-green-700 text-sm font-medium rounded-lg border border-green-200"><CheckCircle size={14} /> Saved</span>
               : <Btn onClick={save}><Save size={14} /> Save Settings</Btn>}
      </div>

      <div className="flex border-b border-gray-200 overflow-x-auto">
        {TABS.map(([id, lbl]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${tab === id ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-800"}`}>
            {lbl}
          </button>
        ))}
      </div>

      <Card className="p-5">
        {tab === "profile" && (
          <div className="space-y-4">
            <AlertBox type="info">These seller details appear on every invoice you create.</AlertBox>
            <Inp label="Full Name"             value={f.fullName}    onChange={set("fullName")}    placeholder="Your full name" />
            <div className="grid grid-cols-2 gap-4">
              <Inp label="Role"                 value={f.role}        onChange={set("role")}        placeholder="e.g. Sound Mixer" />
              <Inp label="Trading / Company Name" value={f.companyName} onChange={set("companyName")} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Inp label="Email" type="email"   value={f.email}       onChange={set("email")} />
              <Inp label="Phone" type="tel"     value={f.phone}       onChange={set("phone")} />
            </div>
            <TxInp label="Address"             value={f.address}     onChange={set("address")} rows={2} placeholder="Street, city, postal code" />
            <div className="grid grid-cols-2 gap-4">
              <SInp label="Invoice Label" value={f.invoiceLabel} onChange={set("invoiceLabel")}>
                <option value="Invoice">Invoice</option>
                <option value="Tax Invoice">Tax Invoice</option>
              </SInp>
              <Inp label="VAT / Tax Number" value={f.vatNumber} onChange={set("vatNumber")} placeholder="Your VAT registration number" />
            </div>
            <Tog checked={f.vatRegistered} onChange={setT("vatRegistered")} label="VAT registered" hint="When enabled, invoices show subtotal excluding VAT, VAT amount, and total including VAT" />
            <TxInp label="Payment Terms"         value={f.paymentTerms} onChange={set("paymentTerms")} rows={2} placeholder="e.g. Payment due within 30 days" />
          </div>
        )}

        {tab === "rates" && (
          <div className="space-y-4">
            <AlertBox type="info">These rates auto-fill every timesheet day. Overtime is calculated automatically from your day rate and included hours.</AlertBox>
            <SInp label="Default Currency" value={f.defaultCurrency} onChange={set("defaultCurrency")}>
              {[["ZAR","South African Rand"],["USD","US Dollar"],["GBP","British Pound"],["EUR","Euro"]].map(([k,n]) => <option key={k} value={k}>{k} — {n}</option>)}
            </SInp>
            <div className="grid grid-cols-2 gap-4">
              <Inp label={`Day Rate (${sym})`}       type="number" value={f.defaultDayRate      || ""} onChange={setN("defaultDayRate")}      placeholder="0.00" min="0" />
              <Inp label="Included Hours / Day"       type="number" value={f.defaultIncludedHours|| ""} onChange={setN("defaultIncludedHours")} placeholder="10"   min="1"
                hint="Hours included in your day rate. Overtime starts after this." />
            </div>
            <div className="p-3 bg-blue-50 rounded-lg border border-blue-100 text-sm text-blue-800">
              Base hourly rate: <strong>{fmtMoney(f.defaultDayRate && f.defaultIncludedHours ? f.defaultDayRate / f.defaultIncludedHours : 0, f.defaultCurrency)}/hr</strong>
              {f.defaultDayRate > 0 && f.defaultIncludedHours > 0 && ` (${fmtMoney(f.defaultDayRate, f.defaultCurrency)} ÷ ${f.defaultIncludedHours}h)`}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Inp label={`Equipment / day (${sym})`} type="number" value={f.defaultEquipmentRental || ""} onChange={setN("defaultEquipmentRental")} placeholder="0.00" min="0" />
              <Inp label={`Per Diem (${sym})`}        type="number" value={f.defaultPerDiem        || ""} onChange={setN("defaultPerDiem")}        placeholder="0.00" min="0" />
            </div>
            <Inp label="Default VAT %"               type="number" value={f.defaultVat           || ""} onChange={setN("defaultVat")}            placeholder="0"    min="0" max="100" />
          </div>
        )}

        {tab === "overtime" && (
          <div className="space-y-5">
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Overtime Rule Preset</p>
              <p className="text-xs text-gray-400 mb-3">Overtime is calculated automatically: Base rate = Day rate ÷ Included hours.</p>
              <div className="space-y-2">
                {(Object.entries(OT_PRESETS) as [OTRuleId, { name: string; desc: string }][]).map(([id, preset]) => (
                  <label key={id} className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${f.defaultOvertimeRule === id ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:border-gray-300"}`}>
                    <input type="radio" name="otRule" value={id} checked={f.defaultOvertimeRule === id}
                      onChange={() => setF(p => ({ ...p, defaultOvertimeRule: id }))} className="mt-0.5 text-blue-600" />
                    <div><p className="text-sm font-semibold text-gray-900">{preset.name}</p><p className="text-xs text-gray-500 mt-0.5">{preset.desc}</p></div>
                  </label>
                ))}
              </div>
            </div>

            {isCustom && (
              <div className="p-4 bg-gray-50 rounded-lg border border-gray-200 space-y-3">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Custom Overtime Bands</p>
                <div className="grid grid-cols-3 gap-3">
                  <Inp label="Band 1 Length (hrs)" type="number" min="0" value={f.defaultOtBand1Hours || ""} onChange={setN("defaultOtBand1Hours")} placeholder="4" hint="First N OT hours" />
                  <Inp label="Band 1 Multiplier"   type="number" min="0" step="0.1" value={f.defaultOtBand1Mult || ""} onChange={setN("defaultOtBand1Mult")} placeholder="1.5" />
                  <Inp label="Band 2 Multiplier"   type="number" min="0" step="0.1" value={f.defaultOtBand2Mult || ""} onChange={setN("defaultOtBand2Mult")} placeholder="2.0" hint="After band 1" />
                </div>
              </div>
            )}

            <div className="border-t border-gray-100 pt-4">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Turnaround</p>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <Inp label="Minimum Turnaround Hours" type="number" min="0" value={f.defaultMinTurnaround || ""} onChange={setN("defaultMinTurnaround")} placeholder="10" />
                <SInp label="When turnaround is short" value={f.defaultTurnaroundMode} onChange={set("defaultTurnaroundMode") as any}>
                  <option value="warning">Show warning only</option>
                  <option value="penalty">Charge penalty automatically</option>
                  <option value="manual">Manual approval required</option>
                </SInp>
              </div>
              {f.defaultTurnaroundMode === "penalty" && (
                <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 space-y-3">
                  <p className="text-xs text-amber-800">Shortfall hours × base hourly rate × penalty multiplier will be added to the day.</p>
                  <Inp label="Turnaround Penalty Multiplier" type="number" min="0" step="0.1" value={f.defaultTurnaroundPenMult || ""} onChange={setN("defaultTurnaroundPenMult")} placeholder="1.5" />
                </div>
              )}
            </div>
          </div>
        )}

        {tab === "timesheet" && (
          <div className="space-y-2">
            <div className="divide-y divide-gray-100">
              <Tog checked={f.mealBreaksDeducted}   onChange={setT("mealBreaksDeducted")}   label="Meal breaks are deducted"       hint="Meal break time is subtracted from on-set hours before calculating paid time" />
              <Tog checked={f.travelTimePaid}       onChange={setT("travelTimePaid")}       label="Travel time is paid"            hint="Travel hours count toward paid hours for overtime calculation" />
              <Tog checked={f.equipmentRentalDaily} onChange={setT("equipmentRentalDaily")} label="Equipment rental applies daily" hint="Your default equipment rental rate is added to every shoot day automatically" />
            </div>
          </div>
        )}

        {tab === "banking" && (
          <div className="space-y-4">
            <AlertBox type="info">These details appear on every invoice you generate.</AlertBox>
            <Inp label="Account Holder"      value={f.bankAccountName}   onChange={set("bankAccountName")} />
            <div className="grid grid-cols-2 gap-4">
              <Inp label="Bank Name"          value={f.bankName}          onChange={set("bankName")} />
              <Inp label="Account Number"     value={f.bankAccountNumber} onChange={set("bankAccountNumber")} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Inp label="Branch / Sort Code" value={f.bankBranchCode}   onChange={set("bankBranchCode")} />
              <Inp label="SWIFT / BIC"        value={f.bankSwift}        onChange={set("bankSwift")} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Inp label="IBAN"              value={f.bankIban}         onChange={set("bankIban")} />
              <Inp label="Payment Reference" value={f.bankReference}    onChange={set("bankReference")} placeholder="e.g. Invoice number" />
            </div>
          </div>
        )}
      </Card>
      <div className="flex justify-end"><Btn onClick={save} size="lg"><Save size={15} /> Save Settings</Btn></div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// CLIENTS
// ═══════════════════════════════════════════════════════════════════════════

function ClientFields({ client, onChange }: { client: Client; onChange: (c: Client) => void }) {
  const set = (k: keyof Client) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange({ ...client, [k]: e.target.value });
  const setPaymentTerms = (e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...client, paymentTerms: e.target.value, defaultPaymentTerms: e.target.value });
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Inp label="Company / Client Name" value={client.companyName} onChange={set("companyName")} placeholder="e.g. Homebrew Films" />
        <Inp label="Contact Person" value={client.contactPerson} onChange={set("contactPerson")} placeholder="Accounts or producer" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Inp label="Email" type="email" value={client.email} onChange={set("email")} />
        <Inp label="Phone" type="tel" value={client.phone} onChange={set("phone")} />
        <Inp label="Accounts Email" type="email" value={client.accountsEmail} onChange={set("accountsEmail")} placeholder="accounts@example.com" />
        <Inp label="Vendor Number" value={client.vendorNumber} onChange={set("vendorNumber")} placeholder="Optional" />
      </div>
      <TxInp label="Billing Address" value={client.billingAddress} onChange={set("billingAddress")} rows={2} placeholder="Registered billing address" />
      <div className="grid grid-cols-2 gap-4">
        <Inp label="VAT Number" value={client.vatNumber} onChange={set("vatNumber")} placeholder="Optional" />
        <Inp label="Payment Terms" value={client.paymentTerms || client.defaultPaymentTerms} onChange={setPaymentTerms} placeholder="Optional" />
      </div>
      <div className="grid grid-cols-2 gap-4">
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

function ClientsPage({ clients, onSave, onShowToast }: {
  clients: Client[]; onSave: (clients: Client[]) => void; onShowToast: (msg: string, type?: ToastType) => void;
}) {
  const [draft, setDraft] = useState<Client | null>(null);

  const startAdd = () => setDraft(blankClient());
  const startEdit = (client: Client) => setDraft({ ...client });
  const cancel = () => setDraft(null);

  const saveClient = () => {
    if (!draft) return;
    if (!draft.companyName.trim()) { onShowToast("Client company name is required", "error"); return; }
    const client = normalizeClient(draft);
    const exists = clients.some(c => c.id === client.id);
    onSave(exists ? clients.map(c => c.id === client.id ? client : c) : [...clients, client]);
    setDraft(null);
    onShowToast(`${client.companyName} saved`);
  };

  const deleteClient = (id: string) => {
    const client = clients.find(c => c.id === id);
    if (!confirm(`Delete ${clientName(client) || "this client"}? Existing timesheets and invoices will keep their saved text.`)) return;
    onSave(clients.filter(c => c.id !== id));
    onShowToast("Client deleted", "info");
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div><h1 className="text-xl font-bold text-gray-900">Clients</h1><p className="text-sm text-gray-500 mt-0.5">Saved bill-to companies and people for invoices.</p></div>
        <Btn onClick={startAdd}><Plus size={14}/> Add Client</Btn>
      </div>

      {draft && (
        <Card className="p-5 max-w-3xl">
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-sm font-bold text-gray-900">{clients.some(c => c.id === draft.id) ? "Edit Client" : "Add Client"}</p>
              <p className="text-xs text-gray-400 mt-0.5">Client records are for invoice recipients only.</p>
            </div>
            <div className="flex gap-2">
              <Btn variant="secondary" size="sm" onClick={cancel}>{"\u2190"} Back to Clients</Btn>
              <Btn size="sm" onClick={saveClient}><Save size={13}/> Save Client</Btn>
            </div>
          </div>
          <ClientFields client={draft} onChange={setDraft} />
        </Card>
      )}

      <Card>
        {clients.length === 0 ? (
          <div className="py-16 text-center">
            <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4"><Building2 size={24} className="text-gray-300"/></div>
            <h3 className="text-base font-semibold text-gray-900 mb-1">No invoice clients yet</h3>
            <p className="text-sm text-gray-400 mb-5 max-w-sm mx-auto">Save the companies and accounts contacts you bill most often. You can still create a timesheet with an unknown client and add billing details later.</p>
            <Btn onClick={startAdd}><Plus size={14}/> Add Client</Btn>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr className="border-b border-gray-200">{["Client","Contact","Email","Billing",""].map((h,i) => <th key={i} className={`px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider ${i === 4 ? "text-right" : "text-left"}`}>{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-gray-50">
                {[...clients].sort((a,b) => clientName(a).localeCompare(clientName(b))).map(client => {
                  const complete = clientBillingComplete(client);
                  return (
                    <tr key={client.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          <button onClick={() => startEdit(client)} className="text-sm font-semibold text-blue-600 hover:text-blue-800">{client.companyName || "Unnamed client"}</button>
                          {!complete && <Badge color="amber">Incomplete</Badge>}
                        </div>
                        {client.vatNumber && <p className="text-xs text-gray-400 mt-0.5">VAT: {client.vatNumber}</p>}
                      </td>
                      <td className="px-4 py-3.5 text-sm text-gray-600">{client.contactPerson || "—"}{client.phone && <p className="text-xs text-gray-400 mt-0.5">{client.phone}</p>}</td>
                      <td className="px-4 py-3.5 text-sm text-gray-500">{client.email || "—"}</td>
                      <td className="px-4 py-3.5 text-sm text-gray-500 max-w-xs truncate">{client.billingAddress || "Not set"}</td>
                      <td className="px-4 py-3.5 text-right">
                        <button onClick={() => startEdit(client)} className="p-1.5 rounded text-gray-300 hover:text-blue-600 transition-colors"><Pencil size={13}/></button>
                        <button onClick={() => deleteClient(client.id)} className="p-1.5 rounded text-gray-300 hover:text-red-500 transition-colors"><Trash2 size={13}/></button>
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
  const trMin  = profile.defaultMinTurnaround || 10;
  const trWarn = turnaround !== null && turnaround < trMin;
  const trShort = turnaround !== null ? trMin - turnaround : 0;

  return (
    <div className="rounded-xl border-2 border-blue-200 p-5 sticky top-5" style={{ background: "#F0F7FF" }}>
      <div className="flex items-center gap-2 mb-4"><Zap size={14} className="text-blue-600" /><span className="text-xs font-bold text-blue-700 uppercase tracking-wider">Live Calculation</span></div>

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
        Base rate: {fmtMoney(c.baseHourly, cur)}/hr ({fmtMoney(c.dayRate, cur)} ÷ {c.incH}h)
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
        {c.totalOtH > 0 && <SRow label="OT cost"    value={fmtMoney(c.totalOtCost, cur)} amber />}
        {c.equip   > 0 && <SRow label="Equipment"   value={fmtMoney(c.equip,       cur)} />}
        {c.perDiem > 0 && <SRow label="Per diem"    value={fmtMoney(c.perDiem,     cur)} />}
        {c.expenses> 0 && <SRow label="Expenses"    value={fmtMoney(c.expenses,    cur)} />}
      </div>

      <div className="border-t-2 border-blue-700 pt-3 flex justify-between items-baseline">
        <span className="font-bold text-gray-900">Day Total</span>
        <span className="text-xl font-bold text-gray-900 tabular-nums">{fmtMoney(c.total, cur)}</span>
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

// ═══════════════════════════════════════════════════════════════════════════
// ADD DAY FORM  — no manual OT rate, auto-filled from profile
// ═══════════════════════════════════════════════════════════════════════════

function AddDayForm({ timesheet, profile, onAdd, onShowToast }: { timesheet: Timesheet; profile: Profile; onAdd: (e: TimesheetEntry) => void; onShowToast: (msg: string, type?: ToastType) => void }) {
  const prev     = timesheet.entries.length > 0 ? timesheet.entries[timesheet.entries.length - 1] : undefined;
  const [form, setForm] = useState<Omit<TimesheetEntry, "id">>(() => entryDefaults(profile, prev, timesheet.productionName));
  const [showRates, setShowRates] = useState(false);
  const upd    = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm(p => ({ ...p, [k]: e.target.value }));
  const updNum = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(p => ({ ...p, [k]: parseFloat(e.target.value) || 0 }));
  const updBool= (k: string) => (v: boolean) => setForm(p => ({ ...p, [k]: v }));
  const turnaround = prev ? calcTurnaround(prev.wrapTime, form.callTime) : null;
  const cur = profile.defaultCurrency || "ZAR";
  const sym = { ZAR: "R", USD: "$", GBP: "£", EUR: "€" }[cur] || "R";
  const isCustom = form.overtimeRule === "custom";
  const trMin = profile.defaultMinTurnaround || 10;
  const trWarn = turnaround !== null && turnaround < trMin;

  const handleDuplicate = () => {
    if (!prev) return;
    setForm(p => ({ ...duplicateEntry(prev, p.date) }));
    onShowToast("Previous day duplicated — edit times as needed", "info");
  };

  const handleAdd = () => {
    if (!form.date)     { onShowToast("Please enter a date", "error"); return; }
    if (!form.callTime) { onShowToast("Please enter a call time", "error"); return; }
    if (!form.wrapTime) { onShowToast("Please enter a wrap time", "error"); return; }
    const entry: TimesheetEntry = { id: uid(), ...form };
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
          <div className="grid grid-cols-2 gap-4 mb-4">
            <Inp label="Date" type="date" value={form.date} onChange={upd("date")} />
            <Inp label="Location" value={form.location} onChange={upd("location")} placeholder="Set / studio / location" />
          </div>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <TInp label="Call Time (24h)" value={form.callTime} onChange={upd("callTime")} />
            <TInp label="Wrap Time (24h)" value={form.wrapTime} onChange={upd("wrapTime")} />
          </div>
          <div className="w-48">
            <Inp label="Meal Break (minutes)" type="number" min="0" value={form.mealBreakMinutes} onChange={updNum("mealBreakMinutes")}
              hint={form.mealDeducted ? "Deducted from working hours" : "Not deducted (see Timesheet settings)"} />
          </div>
        </Card>

        <Card className="p-5">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Travel <span className="normal-case font-normal text-gray-300 ml-1">(optional)</span></p>
          <div className="grid grid-cols-3 gap-4">
            <TInp label="Travel Start" value={form.travelStartTime} onChange={upd("travelStartTime")} />
            <TInp label="Travel End"   value={form.travelEndTime}   onChange={upd("travelEndTime")} />
            <Inp  label="Distance (km)" type="number" min="0" value={form.travelDistance} onChange={upd("travelDistance")} placeholder="0" />
          </div>
        </Card>

        <TxInp label="Notes" rows={2} value={form.notes} onChange={upd("notes")} placeholder="Shoot notes, special conditions…" />

        {/* Rate override — hidden by default */}
        <div>
          <button onClick={() => setShowRates(!showRates)} className="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-600 transition-colors py-1">
            {showRates ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
            {showRates ? "Hide rate overrides" : "Override rates for this day"}
            <span className="text-gray-300 text-xs">({fmtMoney(profile.defaultDayRate, cur)}/day · {OT_PRESETS[profile.defaultOvertimeRule]?.name} from your profile)</span>
          </button>

          {showRates && (
            <Card className="p-4 mt-2 space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <Inp label={`Day Rate (${sym})`}   type="number" min="0" value={form.dayRate}       onChange={updNum("dayRate")} />
                <Inp label="Included Hours"         type="number" min="1" value={form.includedHours} onChange={updNum("includedHours")} />
              </div>
              <SInp label="Overtime Rule" value={form.overtimeRule} onChange={upd("overtimeRule") as any}>
                {(Object.entries(OT_PRESETS) as [OTRuleId, {name:string}][]).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}
              </SInp>
              {isCustom && (
                <div className="grid grid-cols-3 gap-3">
                  <Inp label="Band 1 hrs"  type="number" min="0" value={form.otBand1Hours} onChange={updNum("otBand1Hours")} />
                  <Inp label="Band 1 mult" type="number" min="0" step="0.1" value={form.otBand1Mult} onChange={updNum("otBand1Mult")} />
                  <Inp label="Band 2 mult" type="number" min="0" step="0.1" value={form.otBand2Mult} onChange={updNum("otBand2Mult")} />
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <Inp label={`Equipment (${sym})`} type="number" min="0" value={form.equipmentRental} onChange={updNum("equipmentRental")} />
                <Inp label={`Per Diem (${sym})`}  type="number" min="0" value={form.perDiem}         onChange={updNum("perDiem")} />
              </div>
              <Inp label={`Other Expenses (${sym})`} type="number" min="0" value={form.expenses} onChange={updNum("expenses")} placeholder="0.00" />
              <div className="divide-y divide-gray-100">
                <Tog checked={form.mealDeducted} onChange={updBool("mealDeducted")} label="Meal break deducted for this day" />
                <Tog checked={form.travelPaid}   onChange={updBool("travelPaid")}   label="Travel time paid for this day" />
              </div>
            </Card>
          )}
        </div>

        <div className="flex gap-3">
          <button onClick={handleAdd}
            className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm flex items-center justify-center gap-2">
            <Plus size={16}/> Add This Day
          </button>
          {prev && (
            <Btn variant="secondary" onClick={handleDuplicate} title="Copy rates and location from previous day">
              <Copy size={14}/> Duplicate Previous
            </Btn>
          )}
        </div>
      </div>

      <LiveCalcPanel entry={form} profile={profile} turnaround={turnaround} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// WEEKLY VIEW  — crash-safe defensive rendering
// ═══════════════════════════════════════════════════════════════════════════

function WeeklyView({ timesheet, profile, onDeleteEntry }: { timesheet: Timesheet; profile: Profile; onDeleteEntry: (id: string) => void }) {
  const entries = timesheet?.entries || [];
  const cur     = profile?.defaultCurrency || "ZAR";
  const minTR   = profile?.defaultMinTurnaround || 10;

  if (entries.length === 0)
    return <Card className="py-16 text-center"><p className="text-gray-400 text-sm">No days yet — use the "Add Day" tab to enter your first shoot day.</p></Card>;

  // Pre-compute all calcs safely
  const rows = entries.map((e, i) => {
    let c;
    try { c = calcDay(e, profile); }
    catch { c = { onSetH: 0, overnight: false, mealH: 0, travH: 0, paidH: 0, incH: 10, baseHourly: 0, totalOtH: 0, b1H: 0, b1Cost: 0, b2H: 0, b2Cost: 0, totalOtCost: 0, equip: 0, perDiem: 0, expenses: 0, dayRate: 0, total: 0, ruleId: "sa-film" as OTRuleId, bands: { band1Hours: 4, band1Mult: 1.5, band2Mult: 2.0 } }; }
    const prevEntry = i > 0 ? entries[i - 1] : undefined;
    let tr: number | null = null;
    try { tr = prevEntry ? calcTurnaround(prevEntry.wrapTime || "", e.callTime || "") : null; } catch { tr = null; }
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

  const thCls = "px-2 py-2.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap text-left";
  const thR   = `${thCls} text-right`;
  const tdCls = "px-2 py-2.5 text-sm";
  const tdR   = `${tdCls} text-right tabular-nums`;

  return (
    <Card>
      <div className="overflow-x-auto">
        <table className="w-full">
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
                <tr className="hover:bg-gray-50 transition-colors border-b border-gray-50">
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
                    <button onClick={() => { if (confirm("Remove this day?")) onDeleteEntry(e.id); }} className="p-1 text-gray-300 hover:text-red-500 rounded transition-colors"><Trash2 size={13}/></button>
                  </td>
                </tr>
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
            {sum.vatPct > 0 && <SRow label={`VAT (${sum.vatPct}%)`} value={fmtMoney(sum.vatAmt, cur)} />}
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
    const d = fmtDate(entry.date);
    if (c.dayRate > 0) lines.push({ id: uid(), description: `${d} — Day Rate`, quantity: 1, unitPrice: c.dayRate, amount: c.dayRate, taxable: true, category: "day-rate" });
    if (c.b1H > 0) lines.push({ id: uid(), description: `${d} — Overtime band 1 (${hoursToHM(c.b1H)} @ ${c.bands.band1Mult}x)`, quantity: c.b1H, unitPrice: c.b1Cost / Math.max(c.b1H, 1), amount: c.b1Cost, taxable: true, category: "overtime" });
    if (c.b2H > 0) lines.push({ id: uid(), description: `${d} — Overtime band 2 (${hoursToHM(c.b2H)} @ ${c.bands.band2Mult}x)`, quantity: c.b2H, unitPrice: c.b2Cost / Math.max(c.b2H, 1), amount: c.b2Cost, taxable: true, category: "overtime" });
    if (c.equip > 0) lines.push({ id: uid(), description: `${d} — Equipment Rental`, quantity: 1, unitPrice: c.equip, amount: c.equip, taxable: true, category: "equipment" });
    if (c.travH > 0) lines.push({ id: uid(), description: `${d} — Travel (${hoursToHM(c.travH)}${entry.travelDistance ? `, ${entry.travelDistance} km` : ""})`, quantity: 1, unitPrice: 0, amount: 0, taxable: false, category: "travel" });
    if (c.perDiem + c.expenses > 0) lines.push({ id: uid(), description: `${d} — Expenses`, quantity: 1, unitPrice: c.perDiem + c.expenses, amount: c.perDiem + c.expenses, taxable: true, category: "expenses" });
    if (c.turnaroundPenalty > 0) lines.push({ id: uid(), description: `${d} — Turnaround penalty`, quantity: 1, unitPrice: c.turnaroundPenalty, amount: c.turnaroundPenalty, taxable: true, category: "turnaround" });
  });
  return lines;
}

const buildTimesheetLines = (sum: ReturnType<typeof calcSummary>, mode: InvoiceDetailMode) =>
  mode === "detailed" ? buildDetailedTimesheetLines(sum) : buildSummaryTimesheetLines(sum);

function InvoiceReviewScreen({ timesheet, profile, clients, onSaveClients, invoices, onSave, onUpdateTimesheet, onBack, onShowToast }: {
  timesheet: Timesheet; profile: Profile; clients: Client[]; onSaveClients: (clients: Client[]) => void; invoices: Invoice[];
  onSave: (inv: Invoice) => void; onUpdateTimesheet: (ts: Timesheet) => void; onBack: () => void; onShowToast: (msg: string, type?: ToastType) => void;
}) {
  const effectiveProfile = useMemo(() => profileForTimesheet(profile, timesheet), [profile, timesheet]);
  const cur = timesheet.currency || effectiveProfile.defaultCurrency || "ZAR";
  const sym = { ZAR: "R", USD: "$", GBP: "£", EUR: "€" }[cur] || "R";
  const sum = useMemo(() => calcSummary(timesheet.entries || [], effectiveProfile), [timesheet.entries, effectiveProfile]);
  const savedClient = getTimesheetClient(timesheet, clients);

  const [invoiceNumber, setInvoiceNumber] = useState(() => genINVNum(invoices));
  const [poNumber, setPoNumber] = useState("");
  const [issueDate, setIssueDate] = useState(todayStr());
  const [dueDate, setDueDate] = useState("");
  const [status, setStatus] = useState<InvoiceStatus>("draft");
  const [detailMode, setDetailMode] = useState<InvoiceDetailMode>(savedClient?.preferredInvoiceDetailMode || "summary");
  const [clientDraft, setClientDraft] = useState<Client>(() => savedClient ? { ...savedClient } : blankClient({ companyName: timesheet.clientName === "Unknown / add later" ? "" : timesheet.clientName || "" }));
  const [extras, setExtras] = useState<InvoiceLine[]>([]);
  const [newItem, setNewItem] = useState({ description: "", quantity: "1", unitPrice: "", taxable: true });
  const [paymentTerms, setPaymentTerms] = useState(timesheet.paymentTerms || savedClient?.paymentTerms || savedClient?.defaultPaymentTerms || profile.paymentTerms || "");
  const [paidAmountStr, setPaidAmountStr] = useState("");
  const [paidDate, setPaidDate] = useState("");
  const [notes, setNotes] = useState(timesheet.notes || "");

  const baseLines = useMemo(() => buildTimesheetLines(sum, detailMode), [sum, detailMode]);
  const timesheetBreakdown = useMemo(() => detailMode === "summary_timesheet" ? buildDetailedTimesheetLines(sum) : [], [sum, detailMode]);
  const allLines = [...baseLines, ...extras];
  const subtotal = allLines.reduce((s, l) => s + (l.amount || 0), 0);
  const taxableSubtotal = allLines.reduce((s, l) => s + (l.taxable === false ? 0 : (l.amount || 0)), 0);
  const vatPct = profile.vatRegistered ? sum.vatPct : 0;
  const vatAmt = taxableSubtotal * (vatPct / 100);
  const total = subtotal + vatAmt;
  const paidAmount = Math.min(safe(paidAmountStr, 0), total);
  const balanceDue = Math.max(total - paidAmount, 0);
  const clientIncomplete = !clientBillingComplete(clientDraft);
  const duplicateInvoice = invoices.some(inv => inv.invoiceNumber === invoiceNumber);
  const poMissing = clientDraft.poRequired && !poNumber.trim();

  const persistClientDetails = (notify = true) => {
    if (!clientDraft.companyName.trim()) { if (notify) onShowToast("Client company name is required", "error"); return null; }
    const client = normalizeClient(clientDraft);
    const exists = clients.some(c => c.id === client.id);
    onSaveClients(exists ? clients.map(c => c.id === client.id ? client : c) : [...clients, client]);
    const updatedTS = {
      ...timesheet,
      clientId: client.id,
      clientName: clientName(client),
      clientIncomplete: !clientBillingComplete(client),
      paymentTerms: client.paymentTerms || client.defaultPaymentTerms || timesheet.paymentTerms || profile.paymentTerms,
    };
    onUpdateTimesheet(updatedTS);
    setClientDraft(client);
    if (client.paymentTerms || client.defaultPaymentTerms) setPaymentTerms(client.paymentTerms || client.defaultPaymentTerms);
    if (notify) onShowToast(clientBillingComplete(client) ? "Client billing details saved" : "Client saved, but billing address is still missing", clientBillingComplete(client) ? "success" : "info");
    return client;
  };

  const saveClientDetails = () => { persistClientDetails(true); };

  const addExtra = () => {
    const qty = parseFloat(newItem.quantity) || 1;
    const up  = parseFloat(newItem.unitPrice) || 0;
    if (!newItem.description.trim() || !up) { onShowToast("Enter description and price", "error"); return; }
    setExtras(p => [...p, { id: uid(), description: newItem.description.trim(), quantity: qty, unitPrice: up, amount: qty * up, isExtra: true, taxable: newItem.taxable, category: "additional" }]);
    setNewItem({ description: "", quantity: "1", unitPrice: "", taxable: true });
  };

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
    productionName: timesheet.productionName || "",
    timesheetNumber: timesheet.timesheetNumber || "",
    timesheetDates: timesheetDateRange(timesheet),
    detailMode,
    lineItems: allLines,
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
    if (!clientIncomplete) return true;
    onShowToast("Client billing details are incomplete. Please add them before finalising this invoice.", "error");
    return false;
  };

  const ensureInvoiceReady = () => {
    if (!ensureClientReady()) return false;
    if (poMissing) {
      onShowToast("This client requires a PO number before finalising or exporting.", "error");
      return false;
    }
    if (duplicateInvoice && !confirm(`Invoice number ${invoiceNumber} already exists. Continue anyway?`)) return false;
    return true;
  };

  const handleSave = () => {
    if (!ensureInvoiceReady()) return;
    persistClientDetails(false);
    const inv = makeInvoice();
    onSave(inv);
    onShowToast(`Invoice ${inv.invoiceNumber} saved`);
  };

  const openPDF = () => {
    if (!ensureInvoiceReady()) return;
    persistClientDetails(false);
    printInvoice(makeInvoice(), profile);
  };

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <Btn variant="secondary" size="sm" onClick={onBack}>{"\u2190"} Back to Timesheets</Btn>
        <div className="flex items-start justify-between gap-4">
          <div><h1 className="text-xl font-bold text-gray-900">Invoice Review</h1><p className="text-sm text-gray-400 mt-0.5">{timesheet.productionName || "Not set"} · {timesheet.timesheetNumber || "Not set"}</p></div>
          <div className="flex items-center gap-2">
            <Btn variant="secondary" onClick={openPDF}><FileText size={14}/> Export PDF</Btn>
            <Btn variant="success" onClick={handleSave}><Save size={14}/> Save Invoice</Btn>
          </div>
        </div>
      </div>

      {clientIncomplete && (
        <AlertBox type="warning">Client billing details are incomplete. Please add them before finalising this invoice.</AlertBox>
      )}
      {duplicateInvoice && (
        <AlertBox type="warning">Invoice number {invoiceNumber || "Not set"} already exists. You can override it, but double-check before saving or exporting.</AlertBox>
      )}
      {poMissing && (
        <AlertBox type="warning">This client requires a PO number before finalising or exporting this invoice.</AlertBox>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          <Card className="p-5">
            <div className="grid grid-cols-2 gap-6">
              <div>
                <p className="text-xs font-bold text-gray-300 uppercase tracking-wider mb-2">From</p>
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
                <ClientFields client={clientDraft} onChange={setClientDraft} />
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">Invoice Details</p>
            <div className="grid grid-cols-2 gap-4">
              <Inp label="Invoice Number" value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} />
              <Inp label="PO Number" value={poNumber} onChange={e => setPoNumber(e.target.value)} placeholder={clientDraft.poRequired ? "Required by client" : "Optional"} />
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

          <Card className="p-5">
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
          </Card>

          {detailMode === "summary_timesheet" && (
            <Card className="p-5">
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

          <Card className="p-5">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">Additional Items</p>
            {extras.length > 0 && (
              <div className="mb-4 space-y-0">
                {extras.map(l => (
                  <div key={l.id} className="grid grid-cols-12 gap-2 py-2.5 border-b border-gray-100 items-center">
                    <div className="col-span-5 text-sm text-gray-700">{l.description}</div>
                    <div className="col-span-2 text-sm text-right text-gray-400 tabular-nums">{l.quantity} × {sym}{l.unitPrice.toFixed(2)}</div>
                    <div className="col-span-2 text-xs text-right text-gray-400">{l.taxable === false ? "No VAT" : "VAT"}</div>
                    <div className="col-span-2 text-sm text-right font-medium tabular-nums">{fmtMoney(l.amount, cur)}</div>
                    <div className="col-span-1 flex justify-end"><button onClick={() => removeExtra(l.id)} className="p-1 text-gray-300 hover:text-red-500 rounded"><Trash2 size={13}/></button></div>
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
              <Btn variant="secondary" className="w-full justify-center" onClick={openPDF}><FileText size={14}/> Export PDF</Btn>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// PDF PRINT
// ═══════════════════════════════════════════════════════════════════════════

function printInvoice(inv: Invoice, profile: Profile) {
  const esc = (s: unknown) => String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  const block = (s: unknown) => esc(s).replace(/\n/g, "<br/>");
  const m = (n: unknown) => fmtMoney(n, inv.currency);
  const client = invoiceClient(inv);
  const bd = inv.banking || {};
  const bankRows = ([["Account Holder", bd.accountName],["Bank", bd.bankName],["Account No.", bd.accountNumber],["Branch", bd.branchCode],bd.swift&&["SWIFT", bd.swift],bd.iban&&["IBAN", bd.iban],bd.reference&&["Reference", bd.reference]] as [string,string][]).filter(r=>r&&r[1]);
  const sellerRows = ([profile.fullName, profile.role, profile.email, profile.phone, profile.address, profile.vatRegistered && profile.vatNumber && `VAT / Tax: ${profile.vatNumber}`] as string[]).filter(Boolean);
  const clientRows = ([client?.contactPerson, client?.accountsEmail || client?.email, client?.phone, client?.billingAddress, client?.vendorNumber && `Vendor: ${client.vendorNumber}`, client?.vatNumber && `VAT: ${client.vatNumber}`] as string[]).filter(Boolean);
  const lineRows = (inv.lineItems||[]).map(l=>`<tr><td>${esc(l.description)}${l.isExtra?`<span class="pill">Additional</span>`:""}</td><td class="num">${l.quantity || ""}</td><td class="num">${m(l.unitPrice || 0)}</td><td class="num muted">${l.taxable === false ? "No" : inv.vat > 0 ? "Yes" : "—"}</td><td class="num strong">${m(l.amount)}</td></tr>`).join("") || `<tr><td colspan="5" class="muted">No line items</td></tr>`;
  const attachedRows = (inv.timesheetBreakdown || []).map(l=>`<tr><td>${esc(l.description)}</td><td class="num">${l.quantity || ""}</td><td class="num">${m(l.unitPrice || 0)}</td><td class="num"></td><td class="num strong">${m(l.amount)}</td></tr>`).join("");
  const paymentTerms = inv.paymentTerms || inv.paymentNotes || profile.paymentTerms || "";
  const balanceDue = invoiceBalance(inv);
  const paidAmount = safe(inv.paidAmount, 0);
  const invoiceLabel = profile.vatRegistered ? (profile.invoiceLabel || "Tax Invoice") : (profile.invoiceLabel || "Invoice");
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(inv.invoiceNumber)}</title><style>
*{margin:0;padding:0;box-sizing:border-box}body{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#111827;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}.page{max-width:820px;margin:0 auto;padding:46px}.top{display:flex;justify-content:space-between;gap:32px;margin-bottom:30px}.title{font-size:30px;font-weight:750;letter-spacing:.02em;text-transform:uppercase}.muted{color:#6B7280}.tiny{font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:.08em}.strong{font-weight:700}.boxgrid{display:grid;grid-template-columns:1fr 1fr;gap:28px;margin-bottom:24px}.meta{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;border:1px solid #E5E7EB;border-radius:10px;padding:14px;margin-bottom:24px}.meta div{min-width:0}.meta p:last-child{font-size:12px;margin-top:4px;font-weight:600}.party{line-height:1.5;font-size:12px}.party h2{font-size:15px;margin:6px 0 4px}table{width:100%;border-collapse:collapse;margin-top:8px}th{padding:9px 0;border-top:2px solid #111827;border-bottom:1px solid #E5E7EB;font-size:10px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:.06em;text-align:left}td{padding:10px 0;border-bottom:1px solid #F3F4F6;font-size:12px;vertical-align:top}.num{text-align:right;white-space:nowrap}.pill{display:inline-block;margin-left:8px;padding:2px 6px;border-radius:999px;background:#F3F4F6;color:#6B7280;font-size:9px;font-weight:700;text-transform:uppercase}.totals{display:flex;justify-content:flex-end;margin-top:18px}.totals>div{width:280px}.row{display:flex;justify-content:space-between;padding:4px 0;font-size:13px;color:#6B7280}.due{font-size:17px;font-weight:750;color:#111827;border-top:2px solid #111827;margin-top:6px;padding-top:10px}.section{margin-top:24px;padding-top:18px;border-top:1px solid #E5E7EB}.bank{display:grid;grid-template-columns:1fr 1fr;gap:10px 22px;margin-top:10px}.bank div p:last-child{font-size:12px;font-weight:600;margin-top:2px}.notes{font-size:12px;color:#374151;line-height:1.55;margin-top:8px}@media print{.page{padding:30px}.meta{break-inside:avoid}.section{break-inside:avoid}}
</style></head><body><div class="page">
<div class="top"><div><div class="title">${esc(invoiceLabel)}</div><div class="muted" style="font-size:13px;margin-top:4px">${esc(inv.invoiceNumber || "Not set")}</div>${inv.poNumber?`<div class="muted" style="font-size:12px;margin-top:2px">PO: ${esc(inv.poNumber)}</div>`:""}</div><div style="text-align:right"><div style="font-size:17px;font-weight:750">${esc(inv.companyName || profile.companyName || profile.fullName || "Not set")}</div>${sellerRows.map(r=>`<div class="muted" style="font-size:12px">${block(r)}</div>`).join("")}</div></div>
<div class="boxgrid"><div class="party"><div class="tiny">Bill To</div><h2>${esc(inv.clientName || "Not set")}</h2>${clientRows.length ? clientRows.map(r=>`<div class="muted">${block(r)}</div>`).join("") : `<div class="muted">Not set</div>`}</div><div class="party" style="text-align:right"><div class="tiny">Invoice Date</div><h2>${esc(fmtDate(inv.issueDate))}</h2>${inv.dueDate?`<div class="tiny" style="margin-top:10px">Due Date</div><div style="font-weight:700">${esc(fmtDate(inv.dueDate))}</div>`:""}</div></div>
<div class="meta"><div><p class="tiny">Production</p><p>${esc(inv.productionName || "Not set")}</p></div><div><p class="tiny">PO Number</p><p>${esc(inv.poNumber || "Not set")}</p></div><div><p class="tiny">Timesheet</p><p>${esc(inv.timesheetNumber || "Not set")}</p></div><div><p class="tiny">Detail</p><p>${esc(invoiceDetailModeLabel(inv.detailMode))}</p></div><div><p class="tiny">Status</p><p>${esc(INVOICE_STATUS[normalizeInvoiceStatus(inv.status)].label)}</p></div></div>
<table><thead><tr><th>Description</th><th class="num">Qty</th><th class="num">Unit</th><th class="num">VAT</th><th class="num">Amount</th></tr></thead><tbody>${lineRows}</tbody></table>
<div class="totals"><div><div class="row"><span>${profile.vatRegistered ? "Subtotal excl. VAT" : "Subtotal"}</span><span>${m(inv.subtotal)}</span></div>${inv.vat>0?`<div class="row"><span>VAT (${inv.vat}%)</span><span>${m(inv.vatAmount)}</span></div>`:""}<div class="row due"><span>${profile.vatRegistered ? "Total incl. VAT" : "Total Due"}</span><span>${m(inv.total)}</span></div>${paidAmount>0?`<div class="row"><span>Paid</span><span>${m(paidAmount)}</span></div><div class="row strong"><span>Balance Due</span><span>${m(balanceDue)}</span></div>`:""}</div></div>
${attachedRows?`<div class="section"><div class="tiny">Attached Timesheet Breakdown</div><table><thead><tr><th>Description</th><th class="num">Qty</th><th class="num">Unit</th><th></th><th class="num">Amount</th></tr></thead><tbody>${attachedRows}</tbody></table></div>`:""}
${bankRows.length?`<div class="section"><div class="tiny">Banking Details</div><div class="bank">${bankRows.map(([k,v])=>`<div><p class="tiny">${esc(k)}</p><p>${esc(v)}</p></div>`).join("")}</div></div>`:""}
${paymentTerms?`<div class="section"><div class="tiny">Payment Terms</div><div class="notes">${block(paymentTerms)}</div></div>`:""}
${inv.notes?`<div class="section"><div class="tiny">Notes</div><div class="notes">${block(inv.notes)}</div></div>`:""}
</div><script>window.addEventListener('load',function(){setTimeout(function(){window.print()},500)})<\/script></body></html>`;
  const w = window.open("", "_blank", "width=960,height=720");
  if (!w) { alert("Allow pop-ups to export PDF"); return; }
  w.document.write(html); w.document.close();
}

// ═══════════════════════════════════════════════════════════════════════════
// TIMESHEET DETAIL
// ═══════════════════════════════════════════════════════════════════════════

function TimesheetDetail({ timesheet, profile, onUpdate, onBack, onCreateInvoice, onShowToast }: {
  timesheet: Timesheet; profile: Profile; onUpdate: (ts: Timesheet) => void;
  onBack: () => void; onCreateInvoice: (ts: Timesheet) => void; onShowToast: (msg: string, type?: ToastType) => void;
}) {
  const [tab, setTab]     = useState("add");
  const effectiveProfile  = useMemo(() => profileForTimesheet(profile, timesheet), [profile, timesheet]);
  const sum               = useMemo(() => calcSummary(timesheet.entries || [], effectiveProfile), [timesheet.entries, effectiveProfile]);
  const cur               = timesheet.currency || effectiveProfile.defaultCurrency || "ZAR";
  const addEntry          = (e: TimesheetEntry) => onUpdate({ ...timesheet, entries: [...(timesheet.entries || []), e] });
  const deleteEntry       = (id: string) => onUpdate({ ...timesheet, entries: (timesheet.entries || []).filter(e => e.id !== id) });
  const statusColor       = ({ open: "blue", submitted: "purple", invoiced: "green" } as Record<string, string>)[timesheet.status] || "blue";
  const statusLabel       = ({ open: "Open", submitted: "Submitted", invoiced: "Invoiced" } as Record<string, string>)[timesheet.status] || "Open";
  const TABS = [{ id: "add", label: "Add Day" }, { id: "weekly", label: `Weekly (${(timesheet.entries||[]).length})` }, { id: "summary", label: "Summary" }];

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <Btn variant="secondary" size="sm" onClick={onBack}>{"\u2190"} Back to Timesheets</Btn>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{timesheet.productionName || "Untitled"}</h1>
            <p className="text-sm text-gray-400 mt-0.5">{timesheet.timesheetNumber} · Bill to {timesheet.clientName || "Unknown / add later"} · {(timesheet.entries||[]).length} day{(timesheet.entries||[]).length !== 1 ? "s" : ""} · {fmtMoney(sum.grandTotal, cur)}</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge color={statusColor}>{statusLabel}</Badge>
            {timesheet.status !== "invoiced" && sum.grandTotal > 0 && <Btn variant="success" size="sm" onClick={() => onCreateInvoice(timesheet)}><Receipt size={13}/> Create Invoice</Btn>}
          </div>
        </div>
      </div>
      <div className="flex border-b border-gray-200">
        {TABS.map(t => <button key={t.id} onClick={() => setTab(t.id)} className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === t.id ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-800"}`}>{t.label}</button>)}
      </div>
      {tab === "add"    && <AddDayForm  timesheet={timesheet} profile={effectiveProfile} onAdd={addEntry} onShowToast={onShowToast} />}
      {tab === "weekly" && <WeeklyView  timesheet={timesheet} profile={effectiveProfile} onDeleteEntry={deleteEntry} />}
      {tab === "summary"&& <SummaryView timesheet={timesheet} profile={effectiveProfile} onStartInvoice={() => onCreateInvoice(timesheet)} />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TIMESHEETS PAGE
// ═══════════════════════════════════════════════════════════════════════════

function TimesheetsPage({ timesheets, profile, clients, onSave, onSaveClients, invoices, onAddInvoice, onShowToast }: {
  timesheets: Timesheet[]; profile: Profile; clients: Client[]; onSave: (t: Timesheet[]) => void; onSaveClients: (clients: Client[]) => void;
  invoices: Invoice[]; onAddInvoice: (i: Invoice) => void; onShowToast: (msg: string, type?: ToastType) => void;
}) {
  const [view, setView]           = useState<"list" | "detail" | "invoice-review">("list");
  const [selected, setSelected]   = useState<Timesheet | null>(null);
  const [showNew, setShowNew]     = useState(false);
  const [newTs, setNewTs] = useState({
    productionName: "",
    clientChoice: "unknown",
    role: profile.role || "",
    startDate: todayStr(),
    currency: profile.defaultCurrency || "ZAR",
    notes: "",
  });
  const [newClient, setNewClient] = useState<Client>(() => blankClient());
  const cur = profile.defaultCurrency || "ZAR";

  const resetNewTimesheet = () => {
    setNewTs({
      productionName: "",
      clientChoice: "unknown",
      role: profile.role || "",
      startDate: todayStr(),
      currency: profile.defaultCurrency || "ZAR",
      notes: "",
    });
    setNewClient(blankClient());
  };

  const createTS = () => {
    if (!newTs.productionName.trim()) return;

    let chosenClient: Client | null = null;
    let nextClients = clients;

    if (newTs.clientChoice === "new") {
      if (!newClient.companyName.trim()) { onShowToast("Enter the new client company name or choose Unknown / add later", "error"); return; }
      chosenClient = normalizeClient(newClient);
      nextClients = [...clients, chosenClient];
      onSaveClients(nextClients);
    } else if (newTs.clientChoice !== "unknown") {
      chosenClient = clients.find(c => c.id === newTs.clientChoice) || null;
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
      vat: profile.defaultVat,
      status: "open",
      entries: [],
      paymentTerms: chosenClient?.paymentTerms || chosenClient?.defaultPaymentTerms || profile.paymentTerms,
      defaultDayRate: profile.defaultDayRate,
      defaultIncludedHours: profile.defaultIncludedHours,
      defaultEquipmentRental: profile.defaultEquipmentRental,
      defaultPerDiem: profile.defaultPerDiem,
      defaultOvertimeRule: profile.defaultOvertimeRule,
      defaultOtBand1Hours: profile.defaultOtBand1Hours,
      defaultOtBand1Mult: profile.defaultOtBand1Mult,
      defaultOtBand2Mult: profile.defaultOtBand2Mult,
      defaultMinTurnaround: profile.defaultMinTurnaround,
      defaultTurnaroundMode: profile.defaultTurnaroundMode,
      defaultTurnaroundPenMult: profile.defaultTurnaroundPenMult,
      mealBreaksDeducted: profile.mealBreaksDeducted,
      travelTimePaid: profile.travelTimePaid,
      equipmentRentalDaily: profile.equipmentRentalDaily,
      createdAt: new Date().toISOString(),
    };
    onSave([...timesheets, ts]); setSelected(ts); setView("detail"); setShowNew(false); resetNewTimesheet();
  };

  const updateTS = useCallback((ts: Timesheet) => {
    onSave((timesheets || []).map(x => x.id === ts.id ? ts : x));
    setSelected(ts);
  }, [timesheets, onSave]);

  const deleteTS = (id: string) => { if (!confirm("Delete this timesheet?")) return; onSave((timesheets||[]).filter(t => t.id !== id)); if (selected?.id === id) { setView("list"); setSelected(null); } };

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
    return <TimesheetDetail timesheet={currentTS} profile={profile} onUpdate={updateTS} onBack={() => { setView("list"); setSelected(null); }} onCreateInvoice={startInvoice} onShowToast={onShowToast} />;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div><h1 className="text-xl font-bold text-gray-900">Timesheets</h1><p className="text-sm text-gray-500 mt-0.5">{(timesheets||[]).length} timesheet{(timesheets||[]).length !== 1 ? "s" : ""}</p></div>
        <Btn onClick={() => setShowNew(true)}><Plus size={14}/> New Timesheet</Btn>
      </div>

      {!profile.defaultDayRate && (
        <AlertBox type="warning">Your day rate is not set. <strong>Go to Settings → Default Rates</strong> to set your day rate and included hours — overtime will be calculated automatically.</AlertBox>
      )}

      {showNew && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) { setShowNew(false); resetNewTimesheet(); } }}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-3xl shadow-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-base font-bold text-gray-900 mb-1">New Timesheet</h2>
            <p className="text-sm text-gray-400 mb-4">Production and bill-to client can be different. Rates and rules fill from your business profile.</p>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Inp label="Production / Project Name" value={newTs.productionName} onChange={e => setNewTs(p => ({ ...p, productionName: e.target.value }))} placeholder="e.g. Kokkedoor S4" autoFocus />
                <Inp label="Role" value={newTs.role} onChange={e => setNewTs(p => ({ ...p, role: e.target.value }))} placeholder="e.g. Sound Mixer" />
              </div>
              <div className="grid grid-cols-2 gap-4">
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
              {newTs.clientChoice === "unknown" && (
                <AlertBox type="warning">This timesheet can be created now, but the client will be marked incomplete until billing details are added.</AlertBox>
              )}
              {newTs.clientChoice === "new" && (
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">New Client</p>
                  <ClientFields client={newClient} onChange={setNewClient} />
                </div>
              )}
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
            <p className="text-sm text-gray-400 mb-5 max-w-sm mx-auto">{profile.defaultDayRate > 0 ? `Your ${fmtMoney(profile.defaultDayRate, cur)} day rate is ready. Start with the production name and bill-to client, then add shoot days as you go.` : "Set your rates in Settings, then create a timesheet for the production you are working on."}</p>
            <Btn onClick={() => setShowNew(true)}><Plus size={14}/> New Timesheet</Btn>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr className="border-b border-gray-200">{["Timesheet","Production","Bill To","Days","Status","Total",""].map((h,i) => <th key={i} className={`px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider ${i >= 5 ? "text-right" : "text-left"}`}>{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-gray-50">
                {[...(timesheets||[])].sort((a,b) => new Date(b.createdAt).getTime()-new Date(a.createdAt).getTime()).map(ts => {
                  const effectiveProfile = profileForTimesheet(profile, ts);
                  const s = calcSummary(ts.entries||[], effectiveProfile);
                  const billTo = getTimesheetClient(ts, clients);
                  const col = ({ open:"blue", submitted:"purple", invoiced:"green" } as Record<string,string>)[ts.status]||"blue";
                  const lbl = ({ open:"Open", submitted:"Submitted", invoiced:"Invoiced" } as Record<string,string>)[ts.status]||"Open";
                  return (
                    <tr key={ts.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3.5"><button onClick={() => { setSelected(ts); setView("detail"); }} className="text-sm font-semibold text-blue-600 hover:text-blue-800">{ts.timesheetNumber}</button></td>
                      <td className="px-4 py-3.5 text-sm font-medium text-gray-900">{ts.productionName||"—"}</td>
                      <td className="px-4 py-3.5 text-sm text-gray-500">
                        <div className="flex items-center gap-2">
                          <span>{clientName(billTo) || ts.clientName || "Unknown / add later"}</span>
                          {(!billTo || !clientBillingComplete(billTo)) && <Badge color="amber">Incomplete</Badge>}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-sm text-gray-500">{(ts.entries||[]).length}</td>
                      <td className="px-4 py-3.5"><Badge color={col}>{lbl}</Badge></td>
                      <td className="px-4 py-3.5 text-sm font-semibold text-gray-900 text-right tabular-nums">{fmtMoney(s.grandTotal, ts.currency||cur)}</td>
                      <td className="px-4 py-3.5 text-right"><button onClick={() => deleteTS(ts.id)} className="p-1.5 rounded text-gray-300 hover:text-red-500 transition-colors"><Trash2 size={13}/></button></td>
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

function InvoicesPage({ invoices, profile, onSave, onShowToast }: { invoices: Invoice[]; profile: Profile; onSave: (invoices: Invoice[]) => void; onShowToast: (msg: string, type?: ToastType) => void }) {
  const [sel, setSel] = useState<string | null>(null);
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

  if (inv) {
    const c = invoiceClient(inv);
    const bd = inv.banking || {};
    const bankRows = ([["Account Holder",bd.accountName],["Bank",bd.bankName],["Account No.",bd.accountNumber],["Branch",bd.branchCode],bd.swift&&["SWIFT",bd.swift],bd.iban&&["IBAN",bd.iban],bd.reference&&["Reference",bd.reference]] as [string,string][]).filter(r=>r&&r[1]);
    const paidAmount = safe(inv.paidAmount, 0);
    const balanceDue = invoiceBalance(inv);
    const statusMeta = INVOICE_STATUS[normalizeInvoiceStatus(inv.status)];

    const savePatch = (patch: Partial<Invoice>) => {
      const next = normalizeInvoice({ ...inv, ...patch });
      updateInvoice(next);
    };

    const editInvoiceNumber = () => {
      const nextNumber = prompt("Invoice number", inv.invoiceNumber || "");
      if (nextNumber === null || nextNumber === inv.invoiceNumber) return;
      if ((inv.status === "sent" || inv.status === "paid") && !confirm("This invoice is already Sent or Paid. Change the invoice number anyway?")) return;
      if (invoices.some(i => i.id !== inv.id && i.invoiceNumber === nextNumber) && !confirm(`Invoice number ${nextNumber} already exists. Use it anyway?`)) return;
      savePatch({ invoiceNumber: nextNumber });
      onShowToast("Invoice number updated");
    };

    const exportInvoice = () => {
      if (c?.poRequired && !inv.poNumber) {
        alert("This client requires a PO number before exporting this invoice.");
        return;
      }
      printInvoice(inv, profile);
    };

    const changeStatus = (status: InvoiceStatus) => {
      if (status === "paid") {
        savePatch({ status, paidAmount: inv.total, paidDate: inv.paidDate || todayStr(), balanceDue: 0 });
        onShowToast("Invoice marked paid");
        return;
      }
      savePatch({ status });
    };

    const markPaid = () => changeStatus("paid");

    return (
      <div className="space-y-5">
        <div className="space-y-3">
          <Btn variant="secondary" size="sm" onClick={() => setSel(null)}>{"\u2190"} Back to Invoices</Btn>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-bold text-gray-900">{inv.invoiceNumber || "Invoice not numbered"}</h1>
                <Badge color={statusMeta.color}>{statusMeta.label}</Badge>
              </div>
              <p className="text-sm text-gray-500 mt-1">{inv.clientName || "No client set"}</p>
              {inv.productionName && <p className="text-sm text-gray-400 mt-0.5">Production: {inv.productionName}</p>}
              <div className="flex flex-wrap gap-x-6 gap-y-1 mt-3 text-sm">
                <span className="text-gray-500">Total <strong className="text-gray-900 tabular-nums">{fmtMoney(inv.total, inv.currency)}</strong></span>
                <span className="text-gray-500">Balance due <strong className={`tabular-nums ${balanceDue > 0 ? "text-red-700" : "text-green-700"}`}>{fmtMoney(balanceDue, inv.currency)}</strong></span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 lg:justify-end">
              <Btn variant="secondary" onClick={() => document.getElementById("invoice-edit-panel")?.scrollIntoView({ behavior: "smooth", block: "start" })}><Pencil size={14}/> Edit</Btn>
              <Btn variant="secondary" onClick={exportInvoice}><FileText size={14}/> Download PDF</Btn>
              <Btn variant="success" onClick={markPaid} disabled={normalizeInvoiceStatus(inv.status) === "paid"}><CheckCircle size={14}/> Mark Paid</Btn>
            </div>
          </div>
        </div>

        <div id="invoice-edit-panel">
        <Card className="p-5 max-w-3xl">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <p className="text-xs font-bold text-gray-300 uppercase tracking-wider mb-1">Invoice #</p>
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold">{inv.invoiceNumber || "Not set"}</p>
                <button onClick={editInvoiceNumber} className="p-1 text-gray-300 hover:text-blue-600 rounded"><Pencil size={13}/></button>
              </div>
            </div>
            <SInp label="Status" value={inv.status} onChange={e => changeStatus(e.target.value as InvoiceStatus)}>
              {(Object.entries(INVOICE_STATUS) as [InvoiceStatus, { label: string; color: string }][]).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </SInp>
            <Inp label="PO Number" value={inv.poNumber || ""} onChange={e => savePatch({ poNumber: e.target.value })} />
            <Inp label="Due Date" type="date" value={inv.dueDate || ""} onChange={e => savePatch({ dueDate: e.target.value })} />
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
          <div className="mt-4">
            <TxInp label="Payment Terms" rows={2} value={inv.paymentTerms || inv.paymentNotes || ""} onChange={e => savePatch({ paymentTerms: e.target.value, paymentNotes: e.target.value })} />
          </div>
        </Card>
        </div>

        <Card className="p-8 max-w-3xl">
          <div className="flex justify-between items-start mb-8">
            <div><h2 className="text-3xl font-bold tracking-tight uppercase">{profile.invoiceLabel || "Invoice"}</h2><p className="text-gray-400 mt-1 text-sm">{inv.invoiceNumber}</p>{inv.poNumber&&<p className="text-gray-400 text-xs mt-0.5">PO: {inv.poNumber}</p>}</div>
            <div className="text-right"><p className="font-bold text-base">{inv.companyName||profile.companyName||profile.fullName}</p><p className="text-gray-500 text-sm">{inv.crewName || profile.fullName}</p><p className="text-gray-500 text-sm">{inv.role || profile.role}</p>{profile.email&&<p className="text-gray-500 text-sm">{profile.email}</p>}{profile.vatRegistered&&profile.vatNumber&&<p className="text-gray-500 text-sm">VAT: {profile.vatNumber}</p>}</div>
          </div>
          <div className="grid grid-cols-2 gap-6 mb-8">
            <div><p className="text-xs font-bold text-gray-300 uppercase tracking-wider mb-1">Bill To</p><p className="font-medium">{inv.clientName||"—"}</p>{c?.contactPerson&&<p className="text-sm text-gray-500">{c.contactPerson}</p>}{c?.billingAddress&&<p className="text-sm text-gray-500 whitespace-pre-line">{c.billingAddress}</p>}{c?.vatNumber&&<p className="text-sm text-gray-500">VAT: {c.vatNumber}</p>}</div>
            <div className="text-right"><p className="text-xs font-bold text-gray-300 uppercase tracking-wider mb-1">Issue Date</p><p className="font-medium">{fmtDate(inv.issueDate)}</p>{inv.dueDate&&<><p className="text-xs font-bold text-gray-300 uppercase tracking-wider mb-1 mt-3">Due Date</p><p className="font-medium">{fmtDate(inv.dueDate)}</p></>}</div>
          </div>
          <div className="grid grid-cols-3 gap-3 mb-6 p-3 rounded-lg border border-gray-100 bg-gray-50">
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
              <div className="flex justify-between text-sm text-gray-500">{profile.vatRegistered ? "Subtotal excl. VAT" : "Subtotal"}<span className="tabular-nums font-medium text-gray-900">{fmtMoney(inv.subtotal,inv.currency)}</span></div>
              {inv.vat>0&&<div className="flex justify-between text-sm text-gray-500">VAT ({inv.vat}%)<span className="tabular-nums font-medium text-gray-900">{fmtMoney(inv.vatAmount,inv.currency)}</span></div>}
              <div className="flex justify-between font-bold text-gray-900 border-t-2 border-gray-900 pt-2.5 text-base">{profile.vatRegistered ? "TOTAL INCL. VAT" : "TOTAL DUE"}<span className="tabular-nums">{fmtMoney(inv.total,inv.currency)}</span></div>
              {paidAmount > 0&&<div className="flex justify-between text-sm text-gray-500">Paid<span className="tabular-nums font-medium text-gray-900">{fmtMoney(paidAmount,inv.currency)}</span></div>}
              {paidAmount > 0&&<div className="flex justify-between text-sm font-semibold text-gray-900">Balance Due<span className="tabular-nums">{fmtMoney(balanceDue,inv.currency)}</span></div>}
            </div>
          </div>
          {(inv.detailMode === "summary_timesheet" && (inv.timesheetBreakdown || []).length > 0)&&<div className="mt-8 pt-6 border-t border-gray-100"><p className="text-xs font-bold text-gray-300 uppercase tracking-wider mb-4">Attached Timesheet Breakdown</p>{(inv.timesheetBreakdown || []).map(item => <div key={item.id} className="grid grid-cols-12 gap-3 py-2 border-b border-gray-100"><div className="col-span-8 text-sm text-gray-700">{item.description}</div><div className="col-span-2 text-sm text-right text-gray-400">{item.quantity > 1 ? item.quantity : ""}</div><div className="col-span-2 text-sm text-right font-medium">{fmtMoney(item.amount, inv.currency)}</div></div>)}</div>}
          {bankRows.length>0&&<div className="mt-8 pt-6 border-t border-gray-100"><p className="text-xs font-bold text-gray-300 uppercase tracking-wider mb-4">Banking Details</p><div className="grid grid-cols-2 gap-3">{bankRows.map(([k,v])=><div key={k}><p className="text-xs font-semibold text-gray-300 uppercase tracking-wider">{k}</p><p className="text-sm font-medium mt-0.5">{v}</p></div>)}</div></div>}
          {(inv.paymentTerms || inv.paymentNotes)&&<div className="mt-6 pt-5 border-t border-gray-100"><p className="text-xs font-bold text-gray-300 uppercase tracking-wider mb-2">Payment Terms</p><p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">{inv.paymentTerms || inv.paymentNotes}</p></div>}
          {inv.notes&&<div className="mt-6 pt-5 border-t border-gray-100"><p className="text-xs font-bold text-gray-300 uppercase tracking-wider mb-2">Notes</p><p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">{inv.notes}</p></div>}
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div><h1 className="text-xl font-bold text-gray-900">Invoices</h1><p className="text-sm text-gray-500 mt-0.5">{(invoices||[]).length} invoice{(invoices||[]).length !== 1 ? "s" : ""}</p></div>
      {sortedInvoices.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          <Card className="p-4">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Outstanding</p>
            <p className="text-xl font-bold text-gray-900 mt-2 tabular-nums">{fmtMoney(outstandingTotal, summaryCurrency)}</p>
            <p className="text-xs text-gray-400 mt-1">Unpaid balances</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Paid This Month</p>
            <p className="text-xl font-bold text-green-700 mt-2 tabular-nums">{fmtMoney(paidThisMonth, summaryCurrency)}</p>
            <p className="text-xs text-gray-400 mt-1">Invoices marked paid</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Overdue</p>
            <p className="text-xl font-bold text-red-700 mt-2 tabular-nums">{fmtMoney(overdueTotal, summaryCurrency)}</p>
            <p className="text-xs text-gray-400 mt-1">{overdueInvoices.length} invoice{overdueInvoices.length !== 1 ? "s" : ""}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Drafts</p>
            <p className="text-xl font-bold text-gray-900 mt-2 tabular-nums">{draftCount}</p>
            <p className="text-xs text-gray-400 mt-1">Waiting to send</p>
          </Card>
        </div>
      )}
      <Card>
        {(invoices||[]).length === 0 ? (
          <div className="py-16 text-center">
            <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4"><Receipt size={24} className="text-gray-300"/></div>
            <h3 className="text-base font-semibold text-gray-900 mb-1">No invoices yet</h3>
            <p className="text-sm text-gray-400 max-w-sm mx-auto">Create invoices from completed timesheets. The review screen will pull in the client, production, PO, VAT, banking, and line-item totals before you download the PDF.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full"><thead><tr className="border-b border-gray-200">{["Invoice","Client / Production","PO","Due Date","Status","Total","Balance"].map((h,i)=><th key={i} className={`px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider ${i>=5?"text-right":"text-left"}`}>{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-gray-50">{sortedInvoices.map(i=>{const st=INVOICE_STATUS[normalizeInvoiceStatus(i.status)];const bal=invoiceBalance(i);return(<tr key={i.id} role="button" tabIndex={0} className="hover:bg-gray-50 cursor-pointer transition-colors focus:outline-none focus:bg-blue-50" onClick={()=>setSel(i.id)} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSel(i.id); } }}><td className="px-4 py-3.5"><p className="text-sm font-semibold text-blue-600">{i.invoiceNumber || "Not set"}</p><p className="text-xs text-gray-400 mt-0.5">{fmtDate(i.issueDate)}</p></td><td className="px-4 py-3.5"><p className="text-sm font-medium text-gray-900">{i.clientName||"—"}</p><p className="text-xs text-gray-400 mt-0.5">{i.productionName || "No production set"}</p></td><td className="px-4 py-3.5 text-sm text-gray-400">{i.poNumber || "—"}</td><td className="px-4 py-3.5 text-sm text-gray-500">{i.dueDate ? fmtDate(i.dueDate) : "Not set"}</td><td className="px-4 py-3.5"><Badge color={st.color}>{st.label}</Badge></td><td className="px-4 py-3.5 text-sm font-semibold text-gray-900 text-right tabular-nums">{fmtMoney(i.total,i.currency)}</td><td className="px-4 py-3.5 text-sm font-semibold text-right tabular-nums">{fmtMoney(bal,i.currency)}</td></tr>);})}</tbody></table>
          </div>
        )}
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// LAYOUT
// ═══════════════════════════════════════════════════════════════════════════

const NAV = [{ id:"timesheets",label:"Timesheets",icon:Clock },{ id:"clients",label:"Clients",icon:Users },{ id:"invoices",label:"Invoices",icon:Receipt },{ id:"settings",label:"Settings",icon:Settings }];

function Layout({ page, setPage, profile, children }: { page:string; setPage:(p:string)=>void; profile:Profile; children:React.ReactNode }) {
  const initial = (profile.fullName||"?").charAt(0).toUpperCase();
  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <aside className="w-52 flex flex-col flex-shrink-0 bg-slate-900">
        <div className="flex items-center gap-2.5 p-5 border-b border-slate-700/60">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-sm flex-shrink-0"><Film size={14} className="text-white"/></div>
          <div><p className="text-white font-bold text-[13px] leading-tight">CrewQuote Pro</p><p className="text-slate-500 text-[10px]">Freelancer Timesheet</p></div>
        </div>
        <nav className="flex-1 p-3 space-y-0.5">
          {NAV.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setPage(id)} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all ${page===id?"bg-blue-600 text-white":"text-slate-400 hover:text-white hover:bg-slate-800"}`}>
              <Icon size={16}/>{label}
            </button>
          ))}
        </nav>
        <div className="p-4 border-t border-slate-700/60">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">{initial}</div>
            <div className="min-w-0"><p className="text-white text-xs font-medium truncate">{profile.fullName||"Your Name"}</p><p className="text-slate-500 text-[10px] truncate">{profile.role||"Set role in Settings"}</p></div>
          </div>
        </div>
      </aside>
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-auto p-5 lg:p-6">{children}</div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// APP ROOT
// ═══════════════════════════════════════════════════════════════════════════

export default function App() {
  const [page,       setPage]       = useState("timesheets");
  const [profile,    setProfile]    = useState<Profile>({ ...DEFAULT_PROFILE });
  const [clients,    setClients]    = useState<Client[]>([]);
  const [timesheets, setTimesheets] = useState<Timesheet[]>([]);
  const [invoices,   setInvoices]   = useState<Invoice[]>([]);
  const [ready,      setReady]      = useState(false);
  const [toasts,     setToasts]     = useState<ToastMsg[]>([]);

  useEffect(() => {
    (async () => {
      const [p, c, t, i] = await Promise.all([Store.get("cqp-profile"), Store.get("cqp-clients"), Store.get("cqp-timesheets"), Store.get("cqp-invoices")]);
      if (p) setProfile({ ...DEFAULT_PROFILE, ...p });
      if (c) setClients(Array.isArray(c) ? c.map(normalizeClient) : []);
      if (t) setTimesheets(Array.isArray(t) ? t.map(normalizeTimesheet) : []);
      if (i) setInvoices(Array.isArray(i) ? i.map(normalizeInvoice) : []);
      setReady(true);
    })();
  }, []);

  const showToast = useCallback((msg: string, type: ToastType = "success") => {
    const id = uid();
    setToasts(p => [...p, { id, msg, type }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3500);
  }, []);

  const saveProfile    = (p: Profile)     => { setProfile(p);    Store.set("cqp-profile",    p); };
  const saveClients    = (c: Client[])    => { setClients(c);    Store.set("cqp-clients",    c); };
  const saveTimesheets = (t: Timesheet[]) => { setTimesheets(t); Store.set("cqp-timesheets", t); };
  const saveInvoices   = (i: Invoice[])   => { setInvoices(i);   Store.set("cqp-invoices",   i); };
  const addInvoice     = (inv: Invoice)   => { const next = [...invoices, normalizeInvoice(inv)]; saveInvoices(next); };

  if (!ready) return (
    <div className="h-screen flex items-center justify-center bg-slate-900">
      <div className="text-center">
        <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center mx-auto mb-3 animate-pulse"><Film size={20} className="text-white"/></div>
        <p className="text-slate-400 text-sm">Loading…</p>
      </div>
    </div>
  );

  return (
    <Layout page={page} setPage={setPage} profile={profile}>
      <ToastContainer toasts={toasts} />
      {page === "timesheets" && <TimesheetsPage timesheets={timesheets} profile={profile} clients={clients} onSave={saveTimesheets} onSaveClients={saveClients} invoices={invoices} onAddInvoice={addInvoice} onShowToast={showToast} />}
      {page === "clients"    && <ClientsPage    clients={clients}         onSave={saveClients} onShowToast={showToast} />}
      {page === "invoices"   && <InvoicesPage   invoices={invoices}     profile={profile} onSave={saveInvoices} onShowToast={showToast} />}
      {page === "settings"   && <SettingsPage   profile={profile}       onSave={saveProfile} />}
    </Layout>
  );
}
